export type AiErrorKind = "timeout" | "upstream" | "bad_output" | "blocked";

/** Failure of a model call, already classified for the API layer. */
export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly status?: number;

  constructor(kind: AiErrorKind, message: string, status?: number) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
    this.status = status;
  }
}

export const TIMEOUTS = { plan: 55_000, edit: 55_000, verify: 40_000 } as const;
/** One vision try may take this long before the next try (possibly on the fallback model) starts. */
export const VISION_TRY_TIMEOUT = 20_000;
export const VISION_RETRIES = 4;
export const MAX_RETRIES = 2;
const RETRYABLE = new Set([429, 500, 503]);

/** Reads an HTTP status from the error shapes the SDK and fetch produce. */
export function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as { status?: unknown; statusCode?: unknown; code?: unknown };
  for (const value of [e.status, e.statusCode, e.code]) {
    if (typeof value === "number" && value >= 100 && value < 600) return value;
  }
  return undefined;
}

export function isRetryable(error: unknown): boolean {
  const status = statusOf(error);
  return status !== undefined && RETRYABLE.has(status);
}

/** Rejects with a timeout AiError when `work` takes longer than `ms`. */
export function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number, label: string): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AiError("timeout", `${label} timed out after ${Math.round(ms / 1000)} s`));
    }, ms);
  });
  return Promise.race([work(controller.signal), timeout]).finally(() => clearTimeout(timer));
}

export interface RetryOptions {
  label: string;
  /** Total time budget for all tries together. */
  timeoutMs: number;
  maxRetries?: number;
  /** Upper limit for a single try. A try that hits it is retried while the total budget lasts. */
  tryTimeoutMs?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs a model call with a deadline and retries on 429, 500 and 503 using exponential
 * backoff with jitter. The deadline covers all tries so a request never outlives its budget.
 */
export async function callWithRetry<T>(
  work: (signal: AbortSignal, remainingMs: number, attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    label,
    timeoutMs,
    maxRetries = MAX_RETRIES,
    tryTimeoutMs = Infinity,
    baseDelayMs = 600,
    sleep = defaultSleep,
    random = Math.random,
    now = Date.now,
  } = options;
  const deadline = now() + timeoutMs;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const remaining = deadline - now();
    if (remaining <= 0) break;
    const budget = Math.min(remaining, tryTimeoutMs);
    try {
      return await withTimeout((signal) => work(signal, budget, attempt), budget, label);
    } catch (error) {
      if (error instanceof AiError && error.kind === "timeout") {
        // A single slow try may be retried; the loop ends when the total budget is spent.
        lastError = undefined;
        continue;
      }
      lastError = error;
      if (error instanceof AiError) throw error;
      if (!isRetryable(error) || attempt === maxRetries) break;
      const delay = baseDelayMs * 2 ** attempt * (0.5 + random());
      if (now() + delay >= deadline) break;
      await sleep(delay);
    }
  }
  if (lastError === undefined) {
    throw new AiError("timeout", `${label} timed out after ${Math.round(timeoutMs / 1000)} s`);
  }
  const status = statusOf(lastError);
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new AiError("upstream", `${label} failed${status ? ` (HTTP ${status})` : ""}: ${detail.slice(0, 300)}`, status);
}
