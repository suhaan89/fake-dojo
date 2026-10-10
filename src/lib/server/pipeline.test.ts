import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { MockProvider } from "../ai/mock";
import type { AIProvider } from "../ai/provider";
import { AiError } from "../ai/retry";
import type { Plan } from "../ai/schemas";
import { toApiError, UNSAFE_MESSAGE } from "./errors";
import { planStep, renderStep, verifyStep } from "./pipeline";

let image = "";
const mock = new MockProvider();

beforeAll(async () => {
  const width = 1024;
  const height = 768;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      // Smooth, non-repeating structure so that a shift has exactly one best registration.
      raw[i] = 128 + 60 * Math.sin(x * 0.43 + Math.sin(y * 0.07) * 2) + 40 * Math.sin(y * 0.51 + x * 0.05);
      raw[i + 1] = 120 + 55 * Math.sin(x * 0.39 + y * 0.11) + 35 * Math.cos(y * 0.47 - x * 0.03);
      raw[i + 2] = 110 + 50 * Math.cos(x * 0.45 - y * 0.06) + 30 * Math.sin((x + y) * 0.37);
    }
  }
  image = (await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer()).toString("base64");
});

function withPlan(change: (plan: Plan, call: number) => Plan): AIProvider {
  let calls = 0;
  return {
    name: "mock",
    plan: async (input) => change(await mock.plan(input), ++calls),
    edit: (input) => mock.edit(input),
    verify: (input) => mock.verify(input),
  };
}

const PLAN_INPUT = { difficulty: 2, weights: {}, avoid: [] };

describe("plan step guardrails", () => {
  it("refuses sensitive documents and refused plans with the friendly message", async () => {
    const sensitive = withPlan((plan) => ({ ...plan, safety: { ...plan.safety, is_sensitive_document: true } }));
    await expect(planStep(sensitive, { image, ...PLAN_INPUT })).rejects.toMatchObject({ code: "UNSAFE", message: UNSAFE_MESSAGE });
    const refused = withPlan((plan) => ({ ...plan, safety: { ...plan.safety, refuse: true, refuse_reason: "selfie" } }));
    await expect(planStep(refused, { image, ...PLAN_INPUT })).rejects.toMatchObject({ code: "UNSAFE" });
  });

  it("refuses photos that are mostly a person", async () => {
    const portrait = withPlan((plan) => ({
      ...plan,
      safety: { ...plan.safety, contains_people: true, people_boxes: [[50, 100, 1000, 900]] },
    }));
    await expect(planStep(portrait, { image, ...PLAN_INPUT })).rejects.toMatchObject({ code: "UNSAFE" });
  });

  it("drops candidates that touch a person and keeps the others", async () => {
    // A person standing exactly where the first mock candidate is.
    const crowded = withPlan((plan) => ({
      ...plan,
      safety: { ...plan.safety, contains_people: true, people_boxes: [plan.candidates[0].box_2d] },
    }));
    const result = await planStep(crowded, { image, ...PLAN_INPUT });
    expect(result.containsPeople).toBe(true);
    expect(result.validCount).toBeLessThan(3);
    expect(result.candidates.every((c) => c.target_description !== "the area left of center")).toBe(true);
  });

  it("plans again once when no candidate is valid, then gives up with NO_CANDIDATE", async () => {
    const seenAvoid: string[][] = [];
    const tooBig: AIProvider = {
      name: "mock",
      plan: async (input) => {
        seenAvoid.push([...input.avoid]);
        const plan = await mock.plan(input);
        return { ...plan, candidates: plan.candidates.map((c) => ({ ...c, box_2d: [0, 0, 900, 900] })) };
      },
      edit: (input) => mock.edit(input),
      verify: (input) => mock.verify(input),
    };
    await expect(planStep(tooBig, { image, ...PLAN_INPUT })).rejects.toMatchObject({ code: "NO_CANDIDATE" });
    expect(seenAvoid).toHaveLength(2);
    expect(seenAvoid[0]).toEqual([]);
    expect(seenAvoid[1][0]).toContain("may cover at most 10%");

    const recovers = withPlan((plan, call) =>
      call === 1 ? { ...plan, candidates: plan.candidates.map((c) => ({ ...c, box_2d: [0, 0, 900, 900] })) } : plan,
    );
    const second = await planStep(recovers, { image, ...PLAN_INPUT });
    expect(second.replanned).toBe(true);
    expect(second.validCount).toBe(3);
  });
});

describe("render step", () => {
  it("rejects an edit that changed nothing", async () => {
    const plan = await planStep(mock, { image, ...PLAN_INPUT });
    const lazy: AIProvider = { ...mock, name: "mock", plan: mock.plan, verify: mock.verify, edit: async () => ({ image, mimeType: "image/jpeg" }) };
    const result = await renderStep(lazy, { image, candidate: plan.candidates[0], difficulty: 2, attempt: 1 });
    expect(result).toMatchObject({ ok: false, reason: "not_applied" });
  });

  it("registers a shifted edit and keeps everything outside the region identical", async () => {
    const plan = await planStep(mock, { image, ...PLAN_INPUT });
    const candidate = plan.candidates[0];
    const shifted: AIProvider = {
      name: "mock",
      plan: mock.plan,
      verify: mock.verify,
      edit: async (input) => {
        const edited = await mock.edit(input);
        // Simulate model drift: the whole frame moves by 4 px right and 2 px down.
        // Two passes, because sharp always applies extract before extend within one pipeline.
        const padded = await sharp(Buffer.from(edited.image, "base64"))
          .extend({ left: 4, top: 2, extendWith: "copy" })
          .png()
          .toBuffer();
        const moved = await sharp(padded)
          .extract({ left: 0, top: 0, width: input.width, height: input.height })
          .png()
          .toBuffer();
        return { image: moved.toString("base64"), mimeType: "image/png" };
      },
    };
    const result = await renderStep(shifted, { image, candidate, difficulty: 1, attempt: 1 });
    if (!result.ok) throw new Error(`rejected: ${result.message}`);
    expect(result.stats.shift).toEqual([-4, -2]);
    expect(result.stats.alignAfter).toBeLessThan(result.stats.alignBefore);
    // The measured change stays close to the planned region instead of covering the frame.
    expect(result.stats.changedPct).toBeLessThan(14);
    expect(result.changeBox.x + result.changeBox.w).toBeLessThan(0.62);
  });

  it("reports model failures as upstream or timeout errors", async () => {
    const plan = await planStep(mock, { image, ...PLAN_INPUT });
    const failing = (error: Error): AIProvider => ({
      name: "mock",
      plan: mock.plan,
      verify: mock.verify,
      edit: async () => {
        throw error;
      },
    });
    const input = { image, candidate: plan.candidates[0], difficulty: 2, attempt: 1 };
    const upstream = await renderStep(failing(new AiError("upstream", "boom", 503)), input).catch(toApiError);
    expect(upstream).toMatchObject({ code: "UPSTREAM", status: 502 });
    const timeout = await renderStep(failing(new AiError("timeout", "slow")), input).catch(toApiError);
    expect(timeout).toMatchObject({ code: "TIMEOUT", status: 504 });
    const garbage: AIProvider = { ...failing(new Error("unused")), edit: async () => ({ image: "AAAA", mimeType: "image/png" }) };
    await expect(renderStep(garbage, input)).rejects.toMatchObject({ code: "UPSTREAM" });
  });
});

describe("verify step", () => {
  it("rejects when a person was altered", async () => {
    const plan = await planStep(mock, { image, ...PLAN_INPUT });
    const strict: AIProvider = {
      name: "mock",
      plan: mock.plan,
      edit: mock.edit,
      verify: async (input) => ({ ...(await mock.verify(input)), people_altered: true }),
    };
    const result = await verifyStep(strict, { original: image, forged: image, candidate: plan.candidates[0], difficulty: 2 });
    expect(result).toMatchObject({ accepted: false, safety: true });
  });
});
