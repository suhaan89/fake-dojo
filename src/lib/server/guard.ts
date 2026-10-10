import type { Candidate } from "../ai/schemas";
import { liveStatus, readEnv, type ServerEnv } from "./env";
import { ApiError } from "./errors";
import { clientIp, sharedLimiter } from "./ratelimit";
import { redeemTicket } from "./ticket";

/** Reads the JSON body with a hard size cap so oversized uploads fail fast. */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new ApiError("BAD_INPUT", "The request is too large.");
  const text = await request.text();
  if (text.length > maxBytes) throw new ApiError("BAD_INPUT", "The request is too large.");
  return JSON.parse(text);
}

/** Throws LIVE_DISABLED when the kill switch is off or no provider can answer. */
export function requireLive(env: ServerEnv = readEnv()): ServerEnv {
  const status = liveStatus(env);
  if (!status.liveForge) {
    throw new ApiError("LIVE_DISABLED", "Live forging is resting right now. Try the Daily Dojo.");
  }
  return env;
}

/** Counts one forge against the per-IP and daily limits. Mock mode is free and unlimited. */
export function countForge(request: Request, env: ServerEnv): void {
  if (env.mock) return;
  const decision = sharedLimiter({ perIpPerHour: env.perIpPerHour, dailyCap: env.dailyCap }).take(clientIp(request));
  if (decision.ok) return;
  const minutes = Math.max(1, Math.ceil(decision.retryAfterSec / 60));
  throw new ApiError(
    "RATE_LIMITED",
    decision.reason === "ip"
      ? `You have used all live forges for this hour. Try again in about ${minutes} min, or play the Daily Dojo.`
      : "The dojo has reached its live forge budget for today. The Daily Dojo is still open.",
    decision.retryAfterSec,
  );
}

export function requireTicket(
  env: ServerEnv,
  ticket: string,
  image: string,
  candidate: Candidate,
  purpose: "render" | "verify",
): void {
  const check = redeemTicket(env.signingKey, ticket, image, candidate, purpose);
  if (check.ok) return;
  if (check.reason === "spent") {
    throw new ApiError("RATE_LIMITED", "This forge has used all of its attempts. Start a new one.");
  }
  throw new ApiError("BAD_INPUT", "This forge session is no longer valid. Start a new one.");
}
