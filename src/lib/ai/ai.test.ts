import { describe, expect, it } from "vitest";
import { outputImage, outputText } from "./output";
import { editorPrompt, formatWeights, KEEP_IDENTICAL, plannerPrompt, verifierPrompt } from "./prompts";
import { AiError, callWithRetry, isRetryable, statusOf, withTimeout } from "./retry";
import { modelSchema, parseModelJson, parsePlan, parseVerify, PlanSchema, VerifySchema } from "./schemas";

const SAMPLE_PLAN = {
  scene_summary: "A harbor promenade with benches, a kiosk and moored boats under an overcast sky.",
  safety: {
    contains_people: true,
    people_boxes: [[410, 820, 640, 880]],
    is_sensitive_document: false,
    refuse: false,
    refuse_reason: "",
  },
  objects: [
    { label: "bench", box_2d: [600, 100, 720, 300] },
    { label: "kiosk sign", box_2d: [300, 420, 380, 560] },
  ],
  candidates: [
    {
      type: "alter_text",
      target_label: "kiosk sign",
      target_description: "the opening hours on the sign above the kiosk window",
      box_2d: [300, 420, 380, 560],
      polygon: [[420, 300], [560, 300], [560, 380], [420, 380]],
      edit_instruction: `Change the closing time on the kiosk sign from 18:00 to 19:00. ${KEEP_IDENTICAL}`,
      plausibility_rationale: "Opening hours vary and the font is simple.",
      tell: "The digit 9 is slightly heavier than the other digits.",
      hint: "Read the signs.",
      subtlety: 4,
    },
    {
      type: "remove_object",
      target_label: "bollard",
      target_description: "the second bollard from the left on the quay",
      box_2d: [640, 300, 720, 340],
      polygon: [],
      edit_instruction: `Remove the second bollard from the left. ${KEEP_IDENTICAL}`,
      plausibility_rationale: "Bollards are evenly spaced, a gap is plausible.",
      tell: "The spacing between the bollards is uneven.",
      hint: "Count things along the water.",
      subtlety: 7.4,
    },
  ],
  chosen_index: 0,
};

const SAMPLE_VERIFY = {
  edit_applied: true,
  matches_intent: true,
  artifacts_visible: false,
  artifact_notes: "",
  people_altered: false,
  inappropriate: false,
  plausibility: 4.4,
  obviousness: 0,
  tell: "The digit is heavier than its neighbors.",
  hint: "Read the signs.",
};

describe("schemas", () => {
  it("parses a sample plan and clamps scores", () => {
    const plan = parsePlan(JSON.stringify(SAMPLE_PLAN));
    expect(plan.candidates).toHaveLength(2);
    expect(plan.candidates[0].type).toBe("alter_text");
    expect(plan.candidates[1].subtlety).toBe(5);
    expect(plan.safety.people_boxes).toHaveLength(1);
  });

  it("parses fenced and prefixed model output", () => {
    const fenced = "```json\n" + JSON.stringify(SAMPLE_VERIFY) + "\n```";
    expect(parseVerify(fenced)).toMatchObject({ plausibility: 4, obviousness: 1, edit_applied: true });
    expect(parseModelJson('Here you go: {"a": 1} thanks')).toEqual({ a: 1 });
    expect(() => parseModelJson("no json here")).toThrow();
  });

  it("rejects plans with unknown types or missing fields", () => {
    const badType = structuredClone(SAMPLE_PLAN);
    badType.candidates[0].type = "swap_face";
    expect(() => parsePlan(JSON.stringify(badType))).toThrow();
    const missing = structuredClone(SAMPLE_PLAN) as Record<string, unknown>;
    delete missing.safety;
    expect(() => parsePlan(JSON.stringify(missing))).toThrow();
    const shortBox = structuredClone(SAMPLE_PLAN);
    shortBox.candidates[0].box_2d = [1, 2, 3];
    expect(() => parsePlan(JSON.stringify(shortBox))).toThrow();
  });

  it("trims long summaries and object lists", () => {
    const big = structuredClone(SAMPLE_PLAN);
    big.scene_summary = "x".repeat(900);
    big.objects = Array.from({ length: 40 }, () => ({ label: "thing", box_2d: [0, 0, 10, 10] }));
    const plan = parsePlan(JSON.stringify(big));
    expect(plan.scene_summary).toHaveLength(240);
    expect(plan.objects).toHaveLength(20);
  });

  it("produces a model schema without unsupported keywords", () => {
    for (const schema of [PlanSchema, VerifySchema]) {
      const text = JSON.stringify(modelSchema(schema));
      expect(text).not.toContain("$schema");
      expect(text).not.toContain("additionalProperties");
      expect(text).toContain('"type":"object"');
    }
    const plan = modelSchema(PlanSchema) as { properties: { candidates: { items: { properties: { type: { enum: string[] } } } } } };
    expect(plan.properties.candidates.items.properties.type.enum).toContain("lighting_shadow");
  });
});

describe("prompts", () => {
  it("puts the difficulty range, weights and avoid list into the planner prompt", () => {
    const prompt = plannerPrompt({ difficulty: 4, weights: { alter_text: 0.4 }, avoid: ["a candidate near the bench"] });
    expect(prompt).toContain("Difficulty 4 of 5");
    expect(prompt).toContain("1% to 4%");
    expect(prompt).toContain("alter_text 0.40");
    expect(prompt).toContain("a candidate near the bench");
    expect(prompt).toContain("Never involve people");
    expect(prompt).toContain("[ymin, xmin, ymax, xmax]");
    expect(plannerPrompt({ difficulty: 5, weights: {}, avoid: [] })).toContain("0.5% to 3%");
  });

  it("formats all six weights with a fallback", () => {
    const text = formatWeights({ add_object: 0.5 });
    expect(text.split(", ")).toHaveLength(6);
    expect(text).toContain("add_object 0.50");
    expect(text).toContain("remove_object 0.17");
  });

  it("builds editor and verifier prompts", () => {
    const first = editorPrompt("Remove the cup.");
    expect(first.startsWith("Edit this photograph. Remove the cup.")).toBe(true);
    expect(first).toContain("Do not modify any person");
    expect(editorPrompt("Remove the cup.", 2).length).toBeGreaterThan(first.length);
    expect(verifierPrompt("remove_object", "Remove the cup.")).toContain("remove_object: Remove the cup.");
  });
});

describe("output helper", () => {
  it("prefers the convenience properties", () => {
    expect(outputText({ output_text: "hello" })).toBe("hello");
    expect(outputImage({ output_image: { data: "QUJD", mime_type: "image/png" } })).toEqual({
      data: "QUJD",
      mimeType: "image/png",
    });
  });

  it("falls back to model_output steps", () => {
    const interaction = {
      steps: [
        { type: "thought", summary: [{ type: "text", text: "thinking" }] },
        {
          type: "model_output",
          content: [
            { type: "text", text: '{"a":' },
            { type: "image", data: "Zmlyc3Q=", mime_type: "image/png" },
            { type: "text", text: "1}" },
          ],
        },
        { type: "model_output", content: [{ type: "image", data: "bGFzdA==", mime_type: "image/jpeg" }] },
      ],
    };
    expect(outputText(interaction)).toBe('{"a":1}');
    expect(outputImage(interaction)).toEqual({ data: "bGFzdA==", mimeType: "image/jpeg" });
  });

  it("returns null when nothing was produced", () => {
    expect(outputText({ steps: [] })).toBeNull();
    expect(outputImage({ output_text: "I cannot do that" })).toBeNull();
    expect(outputText({ output_text: "   " })).toBeNull();
  });
});

describe("retry", () => {
  const fast = { label: "Test", timeoutMs: 2000, baseDelayMs: 1, sleep: async () => {} };
  const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

  it("reads statuses and classifies retryable errors", () => {
    expect(statusOf(httpError(503))).toBe(503);
    expect(statusOf({ code: 429 })).toBe(429);
    expect(statusOf(new Error("x"))).toBeUndefined();
    expect(isRetryable(httpError(429))).toBe(true);
    expect(isRetryable(httpError(500))).toBe(true);
    expect(isRetryable(httpError(400))).toBe(false);
  });

  it("retries 429, 500 and 503 up to two times", async () => {
    let calls = 0;
    const result = await callWithRetry(async () => {
      calls++;
      if (calls < 3) throw httpError(calls === 1 ? 429 : 503);
      return "ok";
    }, fast);
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("gives up after the retry budget with an upstream error", async () => {
    let calls = 0;
    const failure = callWithRetry(async () => {
      calls++;
      throw httpError(500);
    }, fast);
    await expect(failure).rejects.toMatchObject({ name: "AiError", kind: "upstream", status: 500 });
    expect(calls).toBe(3);
  });

  it("does not retry client errors", async () => {
    let calls = 0;
    await expect(
      callWithRetry(async () => {
        calls++;
        throw httpError(400);
      }, fast),
    ).rejects.toMatchObject({ kind: "upstream", status: 400 });
    expect(calls).toBe(1);
  });

  it("times out slow calls and aborts them", async () => {
    let aborted = false;
    const slow = withTimeout(
      (signal) =>
        new Promise<string>((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
          });
          setTimeout(() => resolve("late"), 500);
        }),
      20,
      "Slow",
    );
    await expect(slow).rejects.toBeInstanceOf(AiError);
    await expect(slow).rejects.toMatchObject({ kind: "timeout" });
    expect(aborted).toBe(true);
  });
});
