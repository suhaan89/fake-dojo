import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { POST as plan } from "@/app/api/forge/plan/route";
import { POST as render } from "@/app/api/forge/render/route";
import { POST as verify } from "@/app/api/forge/verify/route";
import type { ApiErrorBody, PlanResponse, RenderResponse, VerifyResponse } from "@/lib/forge/types";
import { classifyTap } from "@/lib/game/scoring";

let image = "";
const saved = { ...process.env };

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.4" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeAll(async () => {
  // A textured 1024x768 test photo.
  const width = 1024;
  const height = 768;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[i] = 90 + ((x * 7 + y * 3) % 60);
      raw[i + 1] = 120 + ((x * 2 + y * 5) % 50);
      raw[i + 2] = 80 + ((x + y) % 40);
    }
  }
  image = (await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer()).toString("base64");
});

beforeEach(() => {
  process.env.MOCK_AI = "true";
  process.env.LIVE_FORGE_ENABLED = "true";
  delete process.env.GEMINI_API_KEY;
});

afterEach(() => {
  process.env = { ...saved };
});

describe("GET /api/health", () => {
  it("reports mock mode without calling a model", async () => {
    const body = await (await health()).json();
    expect(body).toEqual({
      liveForge: true,
      mock: true,
      models: { vision: "gemini-3.8-flash", image: "gemini-nano-banana-2.1" },
    });
  });

  it("reports the kill switch", async () => {
    process.env.LIVE_FORGE_ENABLED = "false";
    const body = await (await health()).json();
    expect(body.liveForge).toBe(false);
    expect(body.reason).toBeTruthy();
  });
});

describe("forge routes with the mock provider", () => {
  it("plans, renders and verifies end to end", async () => {
    const planResponse = await plan(post("/api/forge/plan", { image, difficulty: 2, weights: { add_object: 0.3 } }));
    expect(planResponse.status).toBe(200);
    const planned = (await planResponse.json()) as PlanResponse;
    expect(planned).toMatchObject({ mock: true, width: 1024, height: 768, aspectRatio: "4:3", validCount: 3 });
    expect(planned.candidate.type).toBe("change_attribute");
    expect(planned.alternates).toHaveLength(2);
    // Left of center.
    expect((planned.candidate.box_2d[1] + planned.candidate.box_2d[3]) / 2).toBeLessThan(500);

    const renderResponse = await render(
      post("/api/forge/render", {
        image,
        candidate: planned.candidate,
        difficulty: 2,
        attempt: 1,
        ticket: planned.ticket,
      }),
    );
    expect(renderResponse.status).toBe(200);
    const rendered = (await renderResponse.json()) as RenderResponse;
    if (!rendered.ok) throw new Error(`render rejected: ${rendered.message}`);
    expect(rendered.stats.changedPct).toBeGreaterThan(4);
    expect(rendered.stats.changedPct).toBeLessThan(14);
    expect(rendered.stats.jpegQuality).toBe(95);
    expect(rendered.changeBox.x + rendered.changeBox.w / 2).toBeLessThan(0.5);

    // The forged image keeps the size, and the answer key matches the planned region.
    const forgedMeta = await sharp(Buffer.from(rendered.forged, "base64")).metadata();
    expect([forgedMeta.width, forgedMeta.height, forgedMeta.format]).toEqual([1024, 768, "jpeg"]);
    const mask = await sharp(Buffer.from(rendered.mask, "base64")).raw().toBuffer({ resolveWithObject: true });
    expect([mask.info.width, mask.info.height]).toEqual([1024, 768]);
    const bits = new Uint8Array(mask.info.width * mask.info.height);
    for (let i = 0; i < bits.length; i++) bits[i] = mask.data[i * mask.info.channels] > 127 ? 1 : 0;
    const [ymin, xmin, ymax, xmax] = planned.candidate.box_2d;
    const cx = ((xmin + xmax) / 2000) * 1024;
    const cy = ((ymin + ymax) / 2000) * 768;
    expect(classifyTap(bits, 1024, 768, cx, cy)).toBe("hit");
    expect(classifyTap(bits, 1024, 768, 1000, 20)).toBe("miss");
    const heat = await sharp(Buffer.from(rendered.heat, "base64")).metadata();
    expect([heat.width, heat.height, heat.channels]).toEqual([1024, 768, 4]);

    const verifyResponse = await verify(
      post("/api/forge/verify", {
        original: image,
        forged: rendered.forged,
        candidate: planned.candidate,
        difficulty: 2,
        ticket: planned.ticket,
      }),
    );
    expect(verifyResponse.status).toBe(200);
    const verified = (await verifyResponse.json()) as VerifyResponse;
    expect(verified).toMatchObject({ accepted: true, safety: false, reason: null });
    expect(verified.verdict.tell).toBe(planned.candidate.tell);
  });

  it("hides traces at high difficulty", async () => {
    const planned = (await (await plan(post("/api/forge/plan", { image, difficulty: 5 }))).json()) as PlanResponse;
    const rendered = (await (
      await render(post("/api/forge/render", { image, candidate: planned.candidate, difficulty: 5, attempt: 1, ticket: planned.ticket }))
    ).json()) as RenderResponse;
    if (!rendered.ok) throw new Error("render rejected");
    expect(rendered.stats).toMatchObject({ jpegQuality: 85, noiseSigma: 1.2 });
    expect(rendered.stats.changedPct).toBeLessThan(4);
  });

  it("rejects render calls without a valid ticket or with a changed instruction", async () => {
    const planned = (await (await plan(post("/api/forge/plan", { image, difficulty: 2 }))).json()) as PlanResponse;
    const forgedTicket = await render(
      post("/api/forge/render", { image, candidate: planned.candidate, difficulty: 2, attempt: 1, ticket: "x".repeat(40) }),
    );
    expect(forgedTicket.status).toBe(400);
    const tampered = await render(
      post("/api/forge/render", {
        image,
        candidate: { ...planned.candidate, edit_instruction: "Replace the whole scene with something else." },
        difficulty: 2,
        attempt: 1,
        ticket: planned.ticket,
      }),
    );
    expect(tampered.status).toBe(400);
    expect(((await tampered.json()) as ApiErrorBody).error.code).toBe("BAD_INPUT");
  });

  it("answers bad input with BAD_INPUT", async () => {
    const cases = [
      post("/api/forge/plan", "{not json"),
      post("/api/forge/plan", { image, difficulty: 7 }),
      post("/api/forge/plan", { difficulty: 2 }),
      post("/api/forge/plan", { image: "A".repeat(400), difficulty: 2 }),
      post("/api/forge/plan", { image: `data:image/jpeg;base64,${image}`, difficulty: 2 }),
    ];
    for (const request of cases) {
      const response = await plan(request);
      expect(response.status).toBe(400);
      expect(((await response.json()) as ApiErrorBody).error.code).toBe("BAD_INPUT");
    }
  });

  it("answers LIVE_DISABLED when the kill switch is off or the key is missing in production", async () => {
    process.env.LIVE_FORGE_ENABLED = "false";
    const off = await plan(post("/api/forge/plan", { image, difficulty: 2 }));
    expect(off.status).toBe(503);
    expect(((await off.json()) as ApiErrorBody).error.code).toBe("LIVE_DISABLED");

    process.env.LIVE_FORGE_ENABLED = "true";
    process.env.MOCK_AI = "false";
    Object.assign(process.env, { NODE_ENV: "production" });
    const noKey = await plan(post("/api/forge/plan", { image, difficulty: 2 }));
    expect(noKey.status).toBe(503);
  });
});
