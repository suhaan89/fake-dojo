import { describe, expect, it } from "vitest";
import { liveStatus, missingKeys, readEnv } from "../server/env";
import { getProvider } from "../server/pipeline";
import type { EditInput } from "./provider";
import { SeedreamEditor, SeedreamForgeProvider, seedreamSize } from "./seedream";

const ENV = readEnv({
  NODE_ENV: "production",
  GEMINI_API_KEY: "gemini-key",
  IMAGE_PROVIDER: "seedream",
  ARK_API_KEY: "ark-key",
});

const INPUT: EditInput = {
  image: "QUJDRA==",
  width: 1024,
  height: 768,
  aspectRatio: "4:3",
  attempt: 1,
  candidate: {
    type: "remove_object",
    target_label: "cup",
    target_description: "the cup on the left",
    box_2d: [400, 100, 650, 350],
    polygon: [],
    edit_instruction: "Remove the cup on the left.",
    plausibility_rationale: "",
    tell: "",
    hint: "",
    subtlety: 3,
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("environment", () => {
  it("selects Seedream for the edit and keeps Gemini for vision", () => {
    expect(ENV).toMatchObject({
      imageProvider: "seedream",
      imageModel: "seedream-4-0-250828",
      geminiImageModel: "gemini-nano-banana-2.1",
      visionModel: "gemini-3.8-flash",
      arkBaseUrl: "https://ark.ap-southeast.bytepluses.com/api/v3",
      mock: false,
    });
    expect(liveStatus(ENV)).toMatchObject({ liveForge: true, models: { image: "seedream-4-0-250828" } });
    expect(getProvider(ENV)).toBeInstanceOf(SeedreamForgeProvider);
  });

  it("defaults to Gemini and ignores unknown provider names", () => {
    expect(readEnv({ GEMINI_API_KEY: "k" }).imageProvider).toBe("gemini");
    expect(readEnv({ GEMINI_API_KEY: "k", IMAGE_PROVIDER: "something" }).imageProvider).toBe("gemini");
    expect(readEnv({ GEMINI_API_KEY: "k", IMAGE_PROVIDER: "Seedream", SEEDREAM_MODEL: "x", ARK_BASE_URL: "https://h.test/v3/" })).toMatchObject({
      imageModel: "x",
      arkBaseUrl: "https://h.test/v3",
    });
  });

  it("needs both keys for Seedream", () => {
    const noArk = readEnv({ NODE_ENV: "production", GEMINI_API_KEY: "k", IMAGE_PROVIDER: "seedream" });
    expect(missingKeys(noArk)).toEqual(["ARK_API_KEY"]);
    expect(liveStatus(noArk).liveForge).toBe(false);
    const noGemini = readEnv({ NODE_ENV: "production", ARK_API_KEY: "a", IMAGE_PROVIDER: "seedream" });
    expect(missingKeys(noGemini)).toEqual(["GEMINI_API_KEY"]);
    // In development a missing key means mock mode instead of a broken forge.
    expect(readEnv({ NODE_ENV: "development", GEMINI_API_KEY: "k", IMAGE_PROVIDER: "seedream" }).mock).toBe(true);
  });
});

describe("Seedream editor", () => {
  it("keeps the aspect ratio and stays above the minimum pixel count", () => {
    expect(seedreamSize(1024, 768)).toBe("1536x1152");
    expect(seedreamSize(768, 1024)).toBe("1152x1536");
    expect(seedreamSize(1024, 576)).toBe("1536x864");
    for (const [w, h] of [[1024, 1024], [1024, 683], [1024, 439], [576, 1024], [819, 1024]]) {
      const [ow, oh] = seedreamSize(w, h).split("x").map(Number);
      expect(ow * oh).toBeGreaterThanOrEqual(1280 * 720);
      expect(Math.abs(ow / oh - w / h)).toBeLessThan(0.01);
    }
  });

  it("sends the photo, the instruction and the key, and returns the image", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const editor = new SeedreamEditor(ENV, async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return json({ data: [{ b64_json: "RURJVEVE" }] });
    });
    const result = await editor.edit(INPUT);
    expect(result).toEqual({ image: "RURJVEVE", mimeType: "image/jpeg" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://ark.ap-southeast.bytepluses.com/api/v3/images/generations");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer ark-key");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({
      model: "seedream-4-0-250828",
      image: "data:image/jpeg;base64,QUJDRA==",
      size: "1536x1152",
      sequential_image_generation: "disabled",
      response_format: "b64_json",
      watermark: false,
    });
    expect(body.prompt).toContain("Remove the cup on the left.");
    expect(body.prompt).toContain("Do not modify any person");
  });

  it("retries a rate limit and reports other failures as upstream errors", async () => {
    let calls = 0;
    const flaky = new SeedreamEditor(ENV, async () => {
      calls++;
      return calls === 1 ? json({ error: { message: "slow down" } }, 429) : json({ data: [{ b64_json: "T0s=" }] });
    });
    expect((await flaky.edit(INPUT)).image).toBe("T0s=");
    expect(calls).toBe(2);

    const denied = new SeedreamEditor(ENV, async () => json({ error: { message: "invalid key" } }, 401));
    await expect(denied.edit(INPUT)).rejects.toMatchObject({ kind: "upstream", status: 401 });
  }, 15000);

  it("treats an answer without an image as declined", async () => {
    const empty = new SeedreamEditor(ENV, async () => json({ data: [] }));
    await expect(empty.edit(INPUT)).rejects.toMatchObject({ kind: "blocked" });
    const urlOnly = new SeedreamEditor(ENV, async () => json({ data: [{ url: "https://example.test/a.jpg" }] }));
    await expect(urlOnly.edit(INPUT)).rejects.toMatchObject({ kind: "blocked" });
  });

  it("refuses to start without a key", () => {
    expect(() => new SeedreamEditor(readEnv({ NODE_ENV: "production", GEMINI_API_KEY: "k", IMAGE_PROVIDER: "seedream" }))).toThrow();
  });
});
