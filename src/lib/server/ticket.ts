import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Candidate } from "../ai/schemas";

// A forge ticket is issued by the plan route and required by the render and verify routes.
// It is a signed, stateless token that binds the follow-up calls to the photo and to the
// candidates the server itself validated. Without it the render route would be an open
// image-editing proxy that accepts arbitrary instructions.

export const TICKET_TTL_MS = 15 * 60 * 1000;
/** Renders and verifications one ticket may spend on this instance. */
export const TICKET_MAX_USES = 6;

interface TicketPayload {
  t: number;
  img: string;
  c: string[];
}

export function fingerprint(text: string): string {
  return createHash("sha256").update(text).digest("base64url").slice(0, 22);
}

export function candidateFingerprint(candidate: Candidate): string {
  return fingerprint(
    JSON.stringify([candidate.type, candidate.box_2d, candidate.polygon, candidate.edit_instruction]),
  );
}

const secretKey = Symbol.for("fakedojo.ticketSecret");
const usesKey = Symbol.for("fakedojo.ticketUses");
type GlobalStore = { [secretKey]?: Buffer; [usesKey]?: Map<string, { n: number; t: number }> };

function secret(apiKey: string | null): Buffer {
  if (apiKey) return createHash("sha256").update(`fakedojo-ticket:${apiKey}`).digest();
  // Mock mode has no key to derive from, so a per-process random secret is used.
  const store = globalThis as GlobalStore;
  store[secretKey] ??= randomBytes(32);
  return store[secretKey];
}

function sign(body: string, apiKey: string | null): string {
  return createHmac("sha256", secret(apiKey)).update(body).digest("base64url");
}

export function issueTicket(
  apiKey: string | null,
  image: string,
  candidates: readonly Candidate[],
  now = Date.now(),
): string {
  const payload: TicketPayload = { t: now, img: fingerprint(image), c: candidates.map(candidateFingerprint) };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, apiKey)}`;
}

export type TicketCheck = { ok: true } | { ok: false; reason: "invalid" | "expired" | "mismatch" | "spent" };

/** Checks signature, age, the bound photo and candidate, and counts the use. */
export function redeemTicket(
  apiKey: string | null,
  ticket: string,
  image: string,
  candidate: Candidate,
  purpose: "render" | "verify",
  now = Date.now(),
): TicketCheck {
  const [body, mac] = ticket.split(".");
  if (!body || !mac) return { ok: false, reason: "invalid" };
  const expected = Buffer.from(sign(body, apiKey));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "invalid" };
  }
  let payload: TicketPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TicketPayload;
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (typeof payload.t !== "number" || now - payload.t > TICKET_TTL_MS || payload.t - now > 60_000) {
    return { ok: false, reason: "expired" };
  }
  if (payload.img !== fingerprint(image) || !payload.c?.includes(candidateFingerprint(candidate))) {
    return { ok: false, reason: "mismatch" };
  }

  const store = globalThis as GlobalStore;
  const uses = (store[usesKey] ??= new Map());
  if (uses.size > 5000) {
    for (const [key, entry] of uses) if (now - entry.t > TICKET_TTL_MS) uses.delete(key);
  }
  const key = `${purpose}:${mac}`;
  const entry = uses.get(key) ?? { n: 0, t: payload.t };
  if (entry.n >= TICKET_MAX_USES) return { ok: false, reason: "spent" };
  entry.n++;
  uses.set(key, entry);
  return { ok: true };
}
