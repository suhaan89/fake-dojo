import { describe, expect, it } from "vitest";
import { liveStatus, missingKeys, readEnv } from "../server/env";
import { getProvider } from "../server/pipeline";
import { ArkVision, chatText } from "./ark-vision";
import { MockProvider } from "./mock";
import { SeedreamForgeProvider } from "./seedream";

const ENV = readEnv({
  NODE_ENV: "production",
  VISION_PROVIDER: "ark",
  IMAGE_PROVIDER: "seedream",
  ARK_API_KEY: "ark-key",
});

const PLAN_INPUT = { image: "QUJDRA==", width: 1024, height: 768, difficulty: 2, weights: {}, avoid: [] };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function answer(content: unknown): Response {
  return json({ choices: [{ message: { role: "assistant", content } }] });
}

describe("environment", () => {
  it("runs vision and editing on ModelArk with the Ark key alone", () => {
    expect(ENV).toMatchObject({
      visionProvider: "ark",
      visionModel: "seed-2-0-lite-260428",
      arkVisionThinking: "disabled",
      signingKey: "ark-key",
      mock: false,
    });
    expect(missingKeys(ENV)).toEqual([]);
    expect(liveStatus(ENV)).toMatchObject({ liveForge: true, models: { vision: "seed-2-0-lite-260428" } });
    expect(getProvider(ENV)).toBeInstanceOf(SeedreamForgeProvider);
  });

  it("still needs the Gemini key when Gemini edits the image", () => {
    const env = readEnv({ NODE_ENV: "production", VISION_PROVIDER: "ark", ARK_API_KEY: "a" });
    expect(missingKeys(env)).toEqual(["GEMINI_API_KEY"]);
    expect(readEnv({ GEMINI_API_KEY: "k", VISION_PROVIDER: "other" }).visionProvider).toBe("gemini");
    expect(
      readEnv({ ARK_API_KEY: "a", VISION_PROVIDER: "ark", ARK_VISION_MODEL: "m", ARK_VISION_THINKING: "off" }),
    ).toMatchObject({ visionModel: "m", arkVisionThinking: "off" });
  });
});

describe("Ark vision", () => {
  it("sends the prompt, the schema and the photo, and parses the plan", async () => {
    const plan = await new MockProvider().plan(PLAN_INPUT);
    const calls: { url: string; init: RequestInit }[] = [];
    const vision = new ArkVision(ENV, async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return answer("```json\n" + JSON.stringify(plan) + "\n```");
    });
    const result = await vision.plan(PLAN_INPUT);
    expect(result.candidates).toHaveLength(plan.candidates.length);
    expect(calls[0].url).toBe("https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer ark-key");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ model: "seed-2-0-lite-260428", thinking: { type: "disabled" } });
    const parts = body.messages[0].content;
    expect(parts[0].text).toContain("You are the Forger");
    expect(parts[0].text).toContain('"chosen_index"');
    expect(parts[1]).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,QUJDRA==" } });
  });

  it("sends both images for verification and leaves thinking out when it is off", async () => {
    const mock = new MockProvider();
    const plan = await mock.plan(PLAN_INPUT);
    const input = { original: "QQ==", forged: "Qg==", candidate: plan.candidates[0] };
    const verdict = await mock.verify(input);
    const bodies: { thinking?: unknown; messages: { content: unknown[] }[] }[] = [];
    const env = readEnv({
      NODE_ENV: "production",
      VISION_PROVIDER: "ark",
      IMAGE_PROVIDER: "seedream",
      ARK_API_KEY: "a",
      ARK_VISION_THINKING: "off",
    });
    const vision = new ArkVision(env, async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return answer([{ type: "text", text: JSON.stringify(verdict) }]);
    });
    expect(await vision.verify(input)).toMatchObject({ edit_applied: verdict.edit_applied });
    expect(bodies[0].thinking).toBeUndefined();
    expect(bodies[0].messages[0].content).toHaveLength(3);
  });

  it("asks once more when the plan does not match the schema", async () => {
    const plan = await new MockProvider().plan(PLAN_INPUT);
    let calls = 0;
    const vision = new ArkVision(ENV, async () => (++calls === 1 ? answer('{"scene_summary":"x"}') : answer(JSON.stringify(plan))));
    expect((await vision.plan(PLAN_INPUT)).candidates.length).toBeGreaterThan(0);
    expect(calls).toBe(2);
  });

  it("reports unusable answers and provider errors", async () => {
    const prose = new ArkVision(ENV, async () => answer("I cannot help with that."));
    await expect(prose.plan(PLAN_INPUT)).rejects.toMatchObject({ kind: "bad_output" });
    const empty = new ArkVision(ENV, async () => json({ choices: [] }));
    await expect(empty.plan(PLAN_INPUT)).rejects.toMatchObject({ kind: "bad_output" });
    const closed = new ArkVision(ENV, async () => json({ error: { code: "ModelNotOpen" } }, 404));
    await expect(closed.plan(PLAN_INPUT)).rejects.toMatchObject({ kind: "upstream", status: 404 });
    expect(chatText({})).toBeNull();
  });

  it("refuses to start without a key", () => {
    expect(() => new ArkVision(readEnv({ NODE_ENV: "production", VISION_PROVIDER: "ark" }))).toThrow();
  });
});
