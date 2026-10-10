import { describe, expect, it } from "vitest";
import { AiError } from "../ai/retry";
import type { Candidate, Plan, Verify } from "../ai/schemas";
import { judge } from "../forge/types";
import { liveStatus, readEnv } from "./env";
import { ApiError, errorResponse, toApiError } from "./errors";
import { clientIp, ForgeLimiter } from "./ratelimit";
import { issueTicket, redeemTicket, TICKET_MAX_USES, TICKET_TTL_MS } from "./ticket";
import { avoidFromRejections, peopleCoverage, PlanBodySchema, validateCandidates } from "./validate";

function candidate(partial: Partial<Candidate> = {}): Candidate {
  return {
    type: "remove_object",
    target_label: "cup",
    target_description: "the cup on the left side of the table",
    box_2d: [400, 100, 650, 350],
    polygon: [],
    edit_instruction: "Remove the cup on the left side of the table.",
    plausibility_rationale: "Tables are often empty.",
    tell: "The wood grain repeats.",
    hint: "Look at the table.",
    subtlety: 3,
    ...partial,
  };
}

function plan(candidates: Candidate[], people: number[][] = [], chosen = 0): Plan {
  return {
    scene_summary: "A table.",
    safety: {
      contains_people: people.length > 0,
      people_boxes: people,
      is_sensitive_document: false,
      refuse: false,
      refuse_reason: "",
    },
    objects: [],
    candidates,
    chosen_index: chosen,
  };
}

describe("env", () => {
  it("applies defaults", () => {
    const env = readEnv({ NODE_ENV: "production", GEMINI_API_KEY: " key " });
    expect(env).toMatchObject({
      apiKey: "key",
      visionModel: "gemini-3.8-flash",
      imageModel: "gemini-nano-banana-2.1",
      imageThinking: "medium",
      liveForgeEnabled: true,
      dailyCap: 150,
      perIpPerHour: 8,
      mock: false,
    });
  });

  it("uses the mock without a key in development but not in production", () => {
    expect(readEnv({ NODE_ENV: "development" }).mock).toBe(true);
    expect(readEnv({ NODE_ENV: "production" }).mock).toBe(false);
    expect(readEnv({ NODE_ENV: "production", MOCK_AI: "true" }).mock).toBe(true);
  });

  it("reports live status", () => {
    expect(liveStatus(readEnv({ NODE_ENV: "production", GEMINI_API_KEY: "k" }))).toMatchObject({ liveForge: true, mock: false });
    expect(liveStatus(readEnv({ NODE_ENV: "production" }))).toMatchObject({ liveForge: false, mock: false });
    expect(liveStatus(readEnv({ GEMINI_API_KEY: "k", LIVE_FORGE_ENABLED: "false" })).liveForge).toBe(false);
    expect(liveStatus(readEnv({ NODE_ENV: "development" }))).toMatchObject({ liveForge: true, mock: true });
    expect(liveStatus(readEnv({ GEMINI_IMAGE_MODEL: "x", GEMINI_VISION_MODEL: "y" })).models).toEqual({ vision: "y", image: "x" });
  });
});

describe("errors", () => {
  it("maps failures to codes and statuses", async () => {
    expect(toApiError(new AiError("timeout", "t"))).toMatchObject({ code: "TIMEOUT", status: 504 });
    expect(toApiError(new AiError("upstream", "u", 500))).toMatchObject({ code: "UPSTREAM", status: 502 });
    expect(toApiError(new SyntaxError("bad"))).toMatchObject({ code: "BAD_INPUT", status: 400 });
    expect(toApiError(new Error("secret internals")).message).not.toContain("secret");
    const parsed = PlanBodySchema.safeParse({ image: "x", difficulty: 9 });
    expect(toApiError(parsed.error)).toMatchObject({ code: "BAD_INPUT" });

    const response = errorResponse(new ApiError("RATE_LIMITED", "Slow down.", 120));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("120");
    expect(await response.json()).toEqual({ error: { code: "RATE_LIMITED", message: "Slow down." } });
    expect(new ApiError("UNSAFE", "x").status).toBe(422);
    expect(new ApiError("NO_CANDIDATE", "x").status).toBe(422);
    expect(new ApiError("LIVE_DISABLED", "x").status).toBe(503);
  });
});

describe("rate limiter", () => {
  it("enforces a sliding window per address", () => {
    let now = Date.parse("2026-10-10T10:00:00Z");
    const limiter = new ForgeLimiter({ perIpPerHour: 2, dailyCap: 100, now: () => now });
    expect(limiter.take("a")).toMatchObject({ ok: true, remainingForIp: 1 });
    now += 10 * 60_000;
    expect(limiter.take("a")).toMatchObject({ ok: true, remainingForIp: 0 });
    const blocked = limiter.take("a");
    expect(blocked).toMatchObject({ ok: false, reason: "ip" });
    expect(blocked.ok === false && blocked.retryAfterSec).toBe(50 * 60);
    expect(limiter.take("b").ok).toBe(true);
    now += 51 * 60_000;
    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("a").ok).toBe(false);
  });

  it("enforces a global daily cap that resets at midnight UTC", () => {
    let now = Date.parse("2026-10-10T23:00:00Z");
    const limiter = new ForgeLimiter({ perIpPerHour: 10, dailyCap: 3, now: () => now });
    for (const ip of ["a", "b", "c"]) expect(limiter.take(ip).ok).toBe(true);
    const blocked = limiter.take("d");
    expect(blocked).toMatchObject({ ok: false, reason: "daily", retryAfterSec: 3600 });
    expect(limiter.countedToday).toBe(3);
    now = Date.parse("2026-10-11T00:00:01Z");
    expect(limiter.take("d").ok).toBe(true);
    expect(limiter.countedToday).toBe(1);
  });

  it("blocks everything when a limit is zero", () => {
    expect(new ForgeLimiter({ perIpPerHour: 0, dailyCap: 5 }).take("a").ok).toBe(false);
    expect(new ForgeLimiter({ perIpPerHour: 5, dailyCap: 0 }).take("a").ok).toBe(false);
  });

  it("takes the first forwarded address", () => {
    const request = new Request("http://x.test", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } });
    expect(clientIp(request)).toBe("203.0.113.7");
    expect(clientIp(new Request("http://x.test"))).toBe("local");
  });
});

describe("forge ticket", () => {
  const image = "A".repeat(200);
  const c = candidate();

  it("accepts the bound photo and candidate", () => {
    const ticket = issueTicket("key", image, [c]);
    expect(redeemTicket("key", ticket, image, c, "render")).toEqual({ ok: true });
    expect(redeemTicket("key", ticket, image, c, "verify")).toEqual({ ok: true });
  });

  it("rejects tampering, other photos, other candidates and other keys", () => {
    const ticket = issueTicket("key", image, [c]);
    expect(redeemTicket("key", ticket, `${image}B`, c, "render")).toEqual({ ok: false, reason: "mismatch" });
    const other = candidate({ edit_instruction: "Add a weapon to the table." });
    expect(redeemTicket("key", ticket, image, other, "render")).toEqual({ ok: false, reason: "mismatch" });
    expect(redeemTicket("other-key", ticket, image, c, "render")).toEqual({ ok: false, reason: "invalid" });
    const [body, mac] = ticket.split(".");
    expect(redeemTicket("key", `${body}x.${mac}`, image, c, "render").ok).toBe(false);
    expect(redeemTicket("key", "garbage", image, c, "render")).toEqual({ ok: false, reason: "invalid" });
  });

  it("expires and runs out of uses", () => {
    const issued = Date.parse("2026-10-10T10:00:00Z");
    const ticket = issueTicket("key2", image, [c], issued);
    expect(redeemTicket("key2", ticket, image, c, "render", issued + TICKET_TTL_MS + 1)).toEqual({
      ok: false,
      reason: "expired",
    });
    for (let i = 0; i < TICKET_MAX_USES; i++) {
      expect(redeemTicket("key2", ticket, image, c, "render", issued + 1000).ok).toBe(true);
    }
    expect(redeemTicket("key2", ticket, image, c, "render", issued + 1000)).toEqual({ ok: false, reason: "spent" });
  });

  it("works without an API key in mock mode", () => {
    const ticket = issueTicket(null, image, [c]);
    expect(redeemTicket(null, ticket, image, c, "render").ok).toBe(true);
  });
});

describe("plan validation", () => {
  const W = 1024;
  const H = 768;

  it("keeps candidates inside the difficulty range, chosen first", () => {
    // 25% x 25% = 6.25% of the image: fits difficulty 2 (5 to 10%).
    const good = candidate();
    const tooBig = candidate({ target_label: "wall", box_2d: [0, 0, 600, 600] });
    const alsoGood = candidate({ target_label: "plate", box_2d: [100, 600, 350, 850] });
    const result = validateCandidates(plan([tooBig, good, alsoGood], [], 2), W, H, 2);
    expect(result.valid.map((c) => c.target_label)).toEqual(["plate", "cup"]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({ index: 0 });
    expect(result.rejected[0].reason).toContain("36.1%");
  });

  it("applies the 30% tolerance", () => {
    // 3.6% is below 5% but above 5% x 0.7.
    expect(validateCandidates(plan([candidate({ box_2d: [0, 0, 180, 200] })]), W, H, 2).valid).toHaveLength(1);
    expect(validateCandidates(plan([candidate({ box_2d: [0, 0, 170, 200] })]), W, H, 2).valid).toHaveLength(0);
  });

  it("rejects regions near people, including the 5% margin", () => {
    const person = [400, 370, 650, 500];
    const touching = validateCandidates(plan([candidate()], [person]), W, H, 2);
    expect(touching.valid).toHaveLength(0);
    expect(touching.rejected[0].reason).toContain("person");
    // 5% of the width is 51 px = about 50 normalized units; a person 60 units away is fine.
    const clear = validateCandidates(plan([candidate()], [[400, 412, 650, 500]]), W, H, 2);
    expect(clear.valid).toHaveLength(1);
  });

  it("rejects degenerate polygons and drops unreliable ones", () => {
    const degenerate = candidate({ polygon: [[100, 400], [200, 400]] });
    expect(validateCandidates(plan([degenerate]), W, H, 2).rejected[0].reason).toContain("degenerate");
    const elsewhere = candidate({ polygon: [[800, 50], [950, 50], [950, 200], [800, 200]] });
    const result = validateCandidates(plan([elsewhere]), W, H, 2);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].polygon).toEqual([]);
    const inside = candidate({ polygon: [[120, 420], [330, 420], [330, 630], [120, 630]] });
    expect(validateCandidates(plan([inside]), W, H, 2).valid[0].polygon).toHaveLength(4);
    const added = candidate({ type: "add_object", polygon: [[1, 1], [2, 2]] });
    expect(validateCandidates(plan([added]), W, H, 2).valid[0].polygon).toEqual([]);
  });

  it("clamps boxes and completes the instruction", () => {
    const result = validateCandidates(plan([candidate({ box_2d: [650, 350, 400, 100] })]), W, H, 2);
    expect(result.valid[0].box_2d).toEqual([400, 100, 650, 350]);
    expect(result.valid[0].edit_instruction).toContain("exactly identical");
    expect(validateCandidates(plan([candidate({ edit_instruction: "  " })]), W, H, 2).valid).toHaveLength(0);
  });

  it("measures how much of the frame people cover", () => {
    expect(peopleCoverage(plan([], []), W, H)).toBe(0);
    expect(peopleCoverage(plan([], [[0, 0, 1000, 600]]), W, H)).toBeCloseTo(0.6, 1);
    expect(peopleCoverage(plan([], [[0, 0, 1000, 600], [0, 0, 1000, 600]]), W, H)).toBeCloseTo(0.6, 1);
  });

  it("turns rejections into avoid hints", () => {
    const hints = avoidFromRejections([
      { index: 0, reason: "the region is too close to a person" },
      { index: 1, reason: "the region is too close to a person" },
    ]);
    expect(hints).toEqual(["a candidate where the region is too close to a person"]);
  });

  it("validates request bodies", () => {
    const image = "A".repeat(100);
    expect(PlanBodySchema.parse({ image, difficulty: 3 })).toMatchObject({ weights: {}, avoid: [] });
    expect(PlanBodySchema.safeParse({ image, difficulty: 0 }).success).toBe(false);
    expect(PlanBodySchema.safeParse({ image, difficulty: 2, weights: { nope: 1 } }).success).toBe(false);
    expect(PlanBodySchema.safeParse({ image: "short", difficulty: 2 }).success).toBe(false);
  });
});

describe("verifier judgement", () => {
  const ok: Verify = {
    edit_applied: true,
    matches_intent: true,
    artifacts_visible: false,
    artifact_notes: "",
    people_altered: false,
    inappropriate: false,
    plausibility: 4,
    obviousness: 2,
    tell: "t",
    hint: "h",
  };

  it("accepts a clean edit", () => {
    expect(judge(ok, 3)).toEqual({ accepted: true, safety: false, reason: null });
  });

  it("always rejects safety problems", () => {
    expect(judge({ ...ok, people_altered: true }, 1)).toMatchObject({ accepted: false, safety: true });
    expect(judge({ ...ok, inappropriate: true }, 1)).toMatchObject({ accepted: false, safety: true });
  });

  it("rejects missing, off-target and implausible edits", () => {
    expect(judge({ ...ok, edit_applied: false }, 2)).toMatchObject({ accepted: false, safety: false });
    expect(judge({ ...ok, matches_intent: false }, 2).accepted).toBe(false);
    expect(judge({ ...ok, plausibility: 2, artifact_notes: "Visible seam along the wall." }, 2)).toEqual({
      accepted: false,
      safety: false,
      reason: "visible seam along the wall",
    });
  });

  it("tolerates artifacts only at easy levels", () => {
    const flawed = { ...ok, artifacts_visible: true, plausibility: 3 };
    expect(judge(flawed, 2).accepted).toBe(true);
    expect(judge(flawed, 3)).toMatchObject({ accepted: false, reason: "visible artifacts" });
    expect(judge({ ...flawed, plausibility: 4 }, 5).accepted).toBe(true);
  });
});
