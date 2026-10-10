// In-memory rate limiting. State lives in the memory of one server instance, so on a
// serverless platform with several instances the effective limits are per instance.
// That is acceptable for a weekend project; the kill switch LIVE_FORGE_ENABLED is the hard stop.

const HOUR_MS = 60 * 60 * 1000;

export interface LimiterConfig {
  perIpPerHour: number;
  dailyCap: number;
  now?: () => number;
}

export type LimitDecision =
  | { ok: true; remainingForIp: number; remainingToday: number }
  | { ok: false; reason: "ip" | "daily"; retryAfterSec: number };

export class ForgeLimiter {
  private readonly hits = new Map<string, number[]>();
  private day = "";
  private dayCount = 0;
  private readonly now: () => number;

  constructor(private readonly config: LimiterConfig) {
    this.now = config.now ?? Date.now;
  }

  private rollDay(now: number): void {
    const today = new Date(now).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.dayCount = 0;
    }
  }

  /** Counts one forge for `ip` if both limits allow it. */
  take(ip: string): LimitDecision {
    const now = this.now();
    this.rollDay(now);
    const recent = (this.hits.get(ip) ?? []).filter((t) => now - t < HOUR_MS);

    if (this.dayCount >= this.config.dailyCap) {
      this.hits.set(ip, recent);
      const midnight = Date.parse(`${this.day}T00:00:00.000Z`) + 24 * HOUR_MS;
      return { ok: false, reason: "daily", retryAfterSec: Math.max(1, Math.ceil((midnight - now) / 1000)) };
    }
    if (recent.length >= this.config.perIpPerHour) {
      this.hits.set(ip, recent);
      const oldest = recent[0] ?? now;
      return { ok: false, reason: "ip", retryAfterSec: Math.max(1, Math.ceil((oldest + HOUR_MS - now) / 1000)) };
    }

    recent.push(now);
    this.hits.set(ip, recent);
    this.dayCount++;
    this.prune(now);
    return {
      ok: true,
      remainingForIp: this.config.perIpPerHour - recent.length,
      remainingToday: this.config.dailyCap - this.dayCount,
    };
  }

  /** Drops addresses with no recent forge so the map cannot grow without bound. */
  private prune(now: number): void {
    if (this.hits.size < 2000) return;
    for (const [ip, times] of this.hits) {
      if (!times.some((t) => now - t < HOUR_MS)) this.hits.delete(ip);
    }
  }

  get countedToday(): number {
    this.rollDay(this.now());
    return this.dayCount;
  }
}

/** First entry of x-forwarded-for, which is the client address behind the platform proxy. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "local";
}

const globalKey = Symbol.for("fakedojo.limiter");
type GlobalStore = { [globalKey]?: { key: string; limiter: ForgeLimiter } };

/** One limiter per server instance, rebuilt only when the configured limits change. */
export function sharedLimiter(config: { perIpPerHour: number; dailyCap: number }): ForgeLimiter {
  const store = globalThis as GlobalStore;
  const key = `${config.perIpPerHour}:${config.dailyCap}`;
  const existing = store[globalKey];
  if (existing && existing.key === key) return existing.limiter;
  const limiter = new ForgeLimiter(config);
  store[globalKey] = { key, limiter };
  return limiter;
}
