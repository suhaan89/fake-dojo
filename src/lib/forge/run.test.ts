import { describe, expect, it } from "vitest";
import type { Candidate, Verify } from "../ai/schemas";
import { entryText, ForgeFailure, MAX_RENDERS, runForge, type ForgeTransport, type TimelineEntry } from "./run";
import type { PlanResponse, RenderResponse, VerifyResponse } from "./types";

function candidate(label: string): Candidate {
  return {
    type: "add_object",
    target_label: label,
    target_description: `the ${label} near the window`,
    box_2d: [100, 100, 300, 300],
    polygon: [],
    edit_instruction: `Add a ${label}.`,
    plausibility_rationale: "",
    tell: `The ${label} has no shadow.`,
    hint: "Look near the window.",
    subtlety: 3,
  };
}

const PLAN: PlanResponse = {
  ticket: "ticket",
  scene: "A quiet room with a window.",
  objectCount: 7,
  containsPeople: false,
  candidate: candidate("vase"),
  alternates: [candidate("book")],
  validCount: 2,
  plannedCount: 3,
  replanned: false,
  width: 1024,
  height: 768,
  aspectRatio: "4:3",
  mock: false,
  timings: { modelMs: 4000, validateMs: 12 },
};

function rendered(tag: string): RenderResponse {
  return {
    ok: true,
    forged: `forged-${tag}`,
    mask: "mask",
    heat: "heat",
    changeBox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    stats: {
      changedPct: 2.5,
      meanDelta: 30,
      shift: [1, -2],
      alignBefore: 14,
      alignAfter: 2,
      attempt: 1,
      jpegQuality: 90,
      noiseSigma: 0,
      timings: { modelMs: 9000, cvMs: 300 },
    },
  };
}

const VERDICT: Verify = {
  edit_applied: true,
  matches_intent: true,
  artifacts_visible: false,
  artifact_notes: "",
  people_altered: false,
  inappropriate: false,
  plausibility: 4,
  obviousness: 2,
  tell: "The vase casts no shadow.",
  hint: "Look around.",
};

function verified(partial: Partial<VerifyResponse> = {}): VerifyResponse {
  return { verdict: VERDICT, accepted: true, safety: false, reason: null, timings: { modelMs: 2000 }, ...partial };
}

function transport(renders: (RenderResponse | Error)[], verifies: (VerifyResponse | Error)[]) {
  const calls = { plan: 0, render: [] as { label: string; attempt: number }[], verify: 0 };
  const t: ForgeTransport = {
    plan: async () => {
      calls.plan++;
      return PLAN;
    },
    render: async (body) => {
      calls.render.push({ label: body.candidate.target_label, attempt: body.attempt });
      const next = renders.shift();
      if (!next) throw new Error("unexpected render call");
      if (next instanceof Error) throw next;
      return next;
    },
    verify: async () => {
      calls.verify++;
      const next = verifies.shift();
      if (!next) throw new Error("unexpected verify call");
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { t, calls };
}

const OPTIONS = { image: "img", difficulty: 3, weights: {} };

describe("forge loop", () => {
  it("runs plan, render and verify once on the happy path", async () => {
    const { t, calls } = transport([rendered("a")], [verified()]);
    let last: TimelineEntry[] = [];
    const outcome = await runForge(t, { ...OPTIONS, onTimeline: (entries) => (last = entries) });
    expect(calls).toMatchObject({ plan: 1, verify: 1 });
    expect(calls.render).toEqual([{ label: "vase", attempt: 1 }]);
    expect(outcome).toMatchObject({ forged: "forged-a", renders: 1, tell: "The vase casts no shadow.", hint: "Look near the window." });
    expect(last.map((e) => e.step)).toEqual(["read", "plan", "forge", "check", "ready"]);
    expect(last.every((e) => e.status === "done")).toBe(true);
    expect(last[0].ms).toBe(4000);
    expect(last[2].ms).toBe(9300);
  });

  it("redacts the plan until the reveal", async () => {
    const { t } = transport([rendered("a")], [verified()]);
    const outcome = await runForge(t, OPTIONS);
    const plan = outcome.timeline[1];
    expect(entryText(plan, false)).toBe("Plan: [redacted] on [redacted], subtlety 3 of 5. 2 of 3 candidates passed validation.");
    expect(entryText(plan, true)).toContain("added object on vase");
    expect(entryText(outcome.timeline[0], false)).toBe("Scene: A quiet room with a window. 7 objects found.");
    expect(entryText(outcome.timeline[2], false)).toContain("registered with a shift of 1, -2 px");
    expect(entryText(outcome.timeline[2], false)).not.toContain("2.50%");
  });

  it("retries after a compositor rejection and shows it openly", async () => {
    const rejected: RenderResponse = {
      ok: false,
      reason: "not_applied",
      message: "no visible change came back",
      timings: { modelMs: 8000, cvMs: 200 },
    };
    const { t, calls } = transport([rejected, rendered("b")], [verified()]);
    const outcome = await runForge(t, OPTIONS);
    expect(calls.render).toEqual([{ label: "vase", attempt: 1 }, { label: "vase", attempt: 2 }]);
    expect(outcome.renders).toBe(2);
    const first = outcome.timeline.find((e) => e.key === "forge-1")!;
    expect(first.status).toBe("rejected");
    expect(entryText(first, false)).toBe(
      "Attempt 1 rejected by the compositor: no visible change came back. Retrying with a stricter instruction.",
    );
  });

  it("retries after a verifier rejection and redacts spoiling reasons", async () => {
    const seam = verified({ accepted: false, reason: "visible seam left of the vase" });
    const { t } = transport([rendered("a"), rendered("b")], [seam, verified()]);
    const outcome = await runForge(t, OPTIONS);
    expect(outcome.forged).toBe("forged-b");
    const check = outcome.timeline.find((e) => e.key === "check-1")!;
    expect(check.status).toBe("rejected");
    expect(entryText(check, false)).toBe("Attempt 1 rejected by the verifier: [redacted]. Retrying with a stricter instruction.");
    expect(entryText(check, true)).toContain("visible seam left of the vase");
  });

  it("moves to the next candidate after a safety rejection and never shows that image", async () => {
    const unsafe = verified({ accepted: false, safety: true, reason: "a person was altered" });
    const { t, calls } = transport([rendered("unsafe"), rendered("safe")], [unsafe, verified()]);
    const outcome = await runForge(t, OPTIONS);
    expect(calls.render.map((r) => r.label)).toEqual(["vase", "book"]);
    expect(outcome.forged).toBe("forged-safe");
    expect(outcome.candidate.target_label).toBe("book");
    expect(entryText(outcome.timeline.find((e) => e.key === "check-1")!, false)).toContain("a person was altered");
  });

  it("keeps the most plausible attempt when the budget runs out", async () => {
    const weak = verified({ accepted: false, reason: "visible artifacts", verdict: { ...VERDICT, plausibility: 2 } });
    const better = verified({ accepted: false, reason: "visible artifacts", verdict: { ...VERDICT, plausibility: 3 } });
    const { t, calls } = transport([rendered("a"), rendered("b"), rendered("c")], [weak, better, weak]);
    const outcome = await runForge(t, OPTIONS);
    expect(calls.render).toHaveLength(MAX_RENDERS);
    expect(outcome.forged).toBe("forged-b");
    expect(outcome.timeline.some((e) => e.key === "fallback")).toBe(true);
  });

  it("fails when only unsafe results came back", async () => {
    const unsafe = verified({ accepted: false, safety: true, reason: "a person was altered" });
    const { t } = transport([rendered("a"), rendered("b")], [unsafe, unsafe]);
    await expect(runForge(t, OPTIONS)).rejects.toMatchObject({ code: "NO_CANDIDATE" });
  });

  it("uses the forgery without a verdict when the verifier is down", async () => {
    const { t } = transport([rendered("a")], [new ForgeFailure("TIMEOUT", "too slow")]);
    const outcome = await runForge(t, OPTIONS);
    expect(outcome.verdict).toBeNull();
    expect(outcome.tell).toBe("The vase has no shadow.");
    expect(outcome.timeline.find((e) => e.key === "check-1")!.status).toBe("failed");
  });

  it("stops immediately on rate limits and reports upstream failures after retries", async () => {
    const limited = transport([new ForgeFailure("RATE_LIMITED", "Slow down.")], []);
    await expect(runForge(limited.t, OPTIONS)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(limited.calls.render).toHaveLength(1);

    const down = () => new ForgeFailure("UPSTREAM", "The model provider returned an error.");
    const failing = transport([down(), down(), down()], []);
    await expect(runForge(failing.t, OPTIONS)).rejects.toMatchObject({ code: "UPSTREAM" });
    expect(failing.calls.render).toHaveLength(3);
  });

  it("propagates plan failures and marks the first step as failed", async () => {
    let last: TimelineEntry[] = [];
    const t: ForgeTransport = {
      plan: async () => {
        throw new ForgeFailure("UNSAFE", "Fake Dojo edits scenes, never people.");
      },
      render: async () => rendered("x"),
      verify: async () => verified(),
    };
    await expect(runForge(t, { ...OPTIONS, onTimeline: (e) => (last = e) })).rejects.toMatchObject({ code: "UNSAFE" });
    expect(last[0].status).toBe("failed");
  });

  it("honors cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const { t, calls } = transport([rendered("a")], [verified()]);
    await expect(runForge(t, { ...OPTIONS, signal: controller.signal })).rejects.toMatchObject({ code: "ABORTED" });
    expect(calls.render).toHaveLength(0);
  });
});
