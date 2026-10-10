// The forge agent loop: plan, render, verify, with self-correcting retries.
// It only talks to a transport, so the same loop runs in the browser (fetch to the API
// routes) and in the Node scripts (direct calls into the server pipeline).

import type { Candidate, Verify } from "../ai/schemas";
import type { NormBox } from "../cv/types";
import { TYPE_LABELS, type ManipulationType } from "../game/types";
import {
  GENERIC_REASONS,
  type ApiErrorCode,
  type PlanRequest,
  type PlanResponse,
  type RenderRequest,
  type RenderResponse,
  type RenderStats,
  type VerifyRequest,
  type VerifyResponse,
} from "./types";

export interface ForgeTransport {
  plan(body: PlanRequest, signal?: AbortSignal): Promise<PlanResponse>;
  render(body: RenderRequest, signal?: AbortSignal): Promise<RenderResponse>;
  verify(body: VerifyRequest, signal?: AbortSignal): Promise<VerifyResponse>;
}

export type FailureCode = ApiErrorCode | "NETWORK" | "ABORTED";

export class ForgeFailure extends Error {
  readonly code: FailureCode;

  constructor(code: FailureCode, message: string) {
    super(message);
    this.name = "ForgeFailure";
    this.code = code;
  }
}

/** Text that is hidden behind an ink bar until the reveal. */
export interface Secret {
  secret: string;
}
export type Segment = string | Secret;

export type StepId = "read" | "plan" | "forge" | "check" | "ready";

export const STEP_LABELS: Record<StepId, string> = {
  read: "Reading the scene",
  plan: "Planning the forgery",
  forge: "Forging",
  check: "Checking realism",
  ready: "Ready",
};

export type EntryStatus = "running" | "done" | "rejected" | "failed";

export interface TimelineEntry {
  key: string;
  step: StepId;
  status: EntryStatus;
  /** Measured duration in milliseconds, null while running. */
  ms: number | null;
  text: Segment[];
}

export interface ForgeOutcome {
  candidate: Candidate;
  /** Base64 JPEG of the forgery. */
  forged: string;
  /** Base64 PNG answer key. */
  mask: string;
  /** Base64 PNG heat overlay. */
  heat: string;
  changeBox: NormBox;
  stats: RenderStats;
  verdict: Verify | null;
  tell: string;
  hint: string;
  scene: string;
  mock: boolean;
  /** Image-model calls spent on this forge. */
  renders: number;
  totalMs: number;
  timeline: TimelineEntry[];
}

export interface ForgeOptions {
  image: string;
  difficulty: number;
  weights: Partial<Record<ManipulationType, number>>;
  avoid?: string[];
  onTimeline?: (entries: TimelineEntry[]) => void;
  signal?: AbortSignal;
  now?: () => number;
}

/** At most this many image-model calls per forge. Each one costs money. */
export const MAX_RENDERS = 3;
const ATTEMPTS_PER_CANDIDATE = 2;

function secret(text: string): Secret {
  return { secret: text };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export async function runForge(transport: ForgeTransport, options: ForgeOptions): Promise<ForgeOutcome> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const entries: TimelineEntry[] = [];
  const emit = () => options.onTimeline?.(entries.map((entry) => ({ ...entry, text: [...entry.text] })));
  const push = (entry: TimelineEntry) => {
    entries.push(entry);
    emit();
    return entry;
  };
  const settle = (entry: TimelineEntry, status: EntryStatus, ms: number | null, text: Segment[]) => {
    entry.status = status;
    entry.ms = ms;
    entry.text = text;
    emit();
  };
  const checkAborted = () => {
    if (options.signal?.aborted) throw new ForgeFailure("ABORTED", "The forge was cancelled.");
  };

  // Step 1 and 2: one vision call reads the scene and plans; the server validates the plan.
  const read = push({ key: "read", step: "read", status: "running", ms: null, text: ["Looking at the photo."] });
  let plan: PlanResponse;
  const planStarted = now();
  try {
    plan = await transport.plan(
      { image: options.image, difficulty: options.difficulty, weights: options.weights, avoid: options.avoid },
      options.signal,
    );
  } catch (error) {
    settle(read, "failed", now() - planStarted, ["The scene could not be planned."]);
    throw error;
  }
  settle(read, "done", plan.timings.modelMs, [
    `Scene: ${plan.scene.replace(/[.\s]+$/, "")}. ${plural(plan.objectCount, "object")} found.`,
    plan.containsPeople ? " People detected, they are off limits." : "",
  ]);
  const describePlan = (candidate: Candidate): Segment[] => [
    "Plan: ",
    secret(TYPE_LABELS[candidate.type].toLowerCase()),
    " on ",
    secret(candidate.target_label || candidate.target_description),
    `, subtlety ${candidate.subtlety} of 5. ${plan.validCount} of ${plural(plan.plannedCount, "candidate")} passed validation.`,
    plan.replanned ? " The first plan was discarded and planned again." : "",
  ];
  push({
    key: "plan",
    step: "plan",
    status: "done",
    ms: plan.timings.validateMs,
    text: describePlan(plan.candidate),
  });

  const queue = [plan.candidate, ...plan.alternates];
  let renders = 0;
  let fallback: { candidate: Candidate; render: Extract<RenderResponse, { ok: true }>; verdict: Verify } | null = null;
  let lastFailure: ForgeFailure | null = null;

  for (let c = 0; c < queue.length && renders < MAX_RENDERS; c++) {
    const candidate = queue[c];
    if (c > 0) {
      push({
        key: `plan-${c}`,
        step: "plan",
        status: "done",
        ms: 0,
        text: ["Switching to the next candidate. ", ...describePlan(candidate)],
      });
    }
    for (let attempt = 1; attempt <= ATTEMPTS_PER_CANDIDATE && renders < MAX_RENDERS; attempt++) {
      checkAborted();
      renders++;
      const more = renders < MAX_RENDERS;
      const nextMove =
        attempt < ATTEMPTS_PER_CANDIDATE
          ? "Retrying with a stricter instruction."
          : c + 1 < queue.length
            ? "Trying the next candidate."
            : "No candidates left.";

      const forge = push({
        key: `forge-${renders}`,
        step: "forge",
        status: "running",
        ms: null,
        text: [`Attempt ${renders}: the image model is editing the photo.`],
      });
      let render: RenderResponse;
      const renderStarted = now();
      try {
        render = await transport.render(
          { image: options.image, candidate, difficulty: options.difficulty, attempt, ticket: plan.ticket },
          options.signal,
        );
      } catch (error) {
        const failure = error instanceof ForgeFailure ? error : new ForgeFailure("NETWORK", "The connection was lost.");
        if (failure.code === "ABORTED") throw failure;
        lastFailure = failure;
        settle(forge, "failed", now() - renderStarted, [
          `Attempt ${renders} failed: ${failure.message} ${more ? "Trying again." : ""}`.trim(),
        ]);
        // Limits and switched-off forging will not get better by retrying.
        if (failure.code === "RATE_LIMITED" || failure.code === "LIVE_DISABLED" || failure.code === "BAD_INPUT") {
          throw failure;
        }
        continue;
      }
      if (!render.ok) {
        settle(forge, "rejected", render.timings.modelMs + render.timings.cvMs, [
          `Attempt ${renders} rejected by the compositor: ${render.message}. ${more ? nextMove : ""}`.trim(),
        ]);
        continue;
      }
      const [dx, dy] = render.stats.shift;
      settle(forge, "done", render.stats.timings.modelMs + render.stats.timings.cvMs, [
        `Attempt ${renders}: edit received, `,
        dx || dy ? `registered with a shift of ${dx}, ${dy} px, ` : "already registered, ",
        "tone matched and composited. ",
        secret(`${render.stats.changedPct.toFixed(2)}% of the pixels changed`),
        ".",
      ]);

      const check = push({
        key: `check-${renders}`,
        step: "check",
        status: "running",
        ms: null,
        text: ["A second model compares the forgery with the original."],
      });
      let verification: VerifyResponse | null = null;
      const verifyStarted = now();
      try {
        verification = await transport.verify(
          {
            original: options.image,
            forged: render.forged,
            candidate,
            difficulty: options.difficulty,
            ticket: plan.ticket,
          },
          options.signal,
        );
      } catch (error) {
        const failure = error instanceof ForgeFailure ? error : new ForgeFailure("NETWORK", "The connection was lost.");
        if (failure.code === "ABORTED") throw failure;
        // The composite only touches the validated region, so the forgery stays usable
        // without a verdict. The log says so openly.
        settle(check, "failed", now() - verifyStarted, [
          "The verifier did not answer. Using the forgery with the planner's own tell.",
        ]);
      }

      if (!verification) {
        return finish(candidate, render, null);
      }
      const { verdict } = verification;
      if (verification.accepted) {
        settle(check, "done", verification.timings.modelMs, [
          `Verifier: plausibility ${verdict.plausibility} of 5, obviousness ${verdict.obviousness} of 5. Accepted.`,
        ]);
        return finish(candidate, render, verdict);
      }
      const reason = verification.reason ?? "it did not pass";
      const reasonSegment: Segment = GENERIC_REASONS.includes(reason) ? reason : secret(reason);
      if (verification.safety) {
        settle(check, "rejected", verification.timings.modelMs, [
          `Attempt ${renders} rejected by the verifier: `,
          reasonSegment,
          `. Discarded. ${more && c + 1 < queue.length ? "Trying the next candidate." : ""}`.trimEnd(),
        ]);
        break;
      }
      settle(check, "rejected", verification.timings.modelMs, [
        `Attempt ${renders} rejected by the verifier: `,
        reasonSegment,
        `. ${more ? nextMove : ""}`.trimEnd(),
      ]);
      if (!fallback || verdict.plausibility > fallback.verdict.plausibility) {
        fallback = { candidate, render, verdict };
      }
    }
  }

  if (fallback) {
    push({
      key: "fallback",
      step: "check",
      status: "done",
      ms: 0,
      text: ["Attempt budget used up. Keeping the most plausible attempt, flaws included."],
    });
    return finish(fallback.candidate, fallback.render, fallback.verdict);
  }
  throw lastFailure ?? new ForgeFailure("NO_CANDIDATE", "The forger could not produce a clean edit for this photo.");

  function finish(
    candidate: Candidate,
    render: Extract<RenderResponse, { ok: true }>,
    verdict: Verify | null,
  ): ForgeOutcome {
    const totalMs = now() - startedAt;
    push({
      key: "ready",
      step: "ready",
      status: "done",
      ms: totalMs,
      text: [`Forgery ready after ${plural(renders, "attempt")}. One edit is hidden in the photo.`],
    });
    return {
      candidate,
      forged: render.forged,
      mask: render.mask,
      heat: render.heat,
      changeBox: render.changeBox,
      stats: render.stats,
      verdict,
      tell: verdict?.tell.trim() || candidate.tell,
      hint: candidate.hint.trim() || verdict?.hint.trim() || "Look closely at the smaller objects.",
      scene: plan.scene,
      mock: plan.mock,
      renders,
      totalMs,
      timeline: entries.map((entry) => ({ ...entry, text: [...entry.text] })),
    };
  }
}

/** Plain text of a timeline entry, with secrets shown or replaced by a marker. */
export function entryText(entry: TimelineEntry, revealed: boolean): string {
  return entry.text
    .map((segment) => (typeof segment === "string" ? segment : revealed ? segment.secret : "[redacted]"))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
