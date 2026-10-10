import * as z from "zod";
import { AiError } from "../ai/retry";

export const ERROR_STATUS = {
  RATE_LIMITED: 429,
  LIVE_DISABLED: 503,
  UPSTREAM: 502,
  TIMEOUT: 504,
  UNSAFE: 422,
  NO_CANDIDATE: 422,
  BAD_INPUT: 400,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export const UNSAFE_MESSAGE = "Fake Dojo edits scenes, never people. Try a photo of a street, a room or a table.";

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly retryAfterSec?: number;

  constructor(code: ErrorCode, message: string, retryAfterSec?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }
}

/** Maps any thrown value to an ApiError with a message that is safe to show to players. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof AiError) {
    if (error.kind === "timeout") return new ApiError("TIMEOUT", "The model took too long to answer. Please try again.");
    if (error.kind === "blocked") return new ApiError("UPSTREAM", "The image model returned no image for this edit.");
    if (error.kind === "bad_output") return new ApiError("UPSTREAM", "The model answered in an unexpected format.");
    if (error.status === 429) return new ApiError("UPSTREAM", "The model provider is rate limiting us right now.");
    return new ApiError("UPSTREAM", "The model provider returned an error.");
  }
  if (error instanceof z.ZodError) return new ApiError("BAD_INPUT", "The request body is not valid.");
  if (error instanceof SyntaxError) return new ApiError("BAD_INPUT", "The request body is not valid JSON.");
  return new ApiError("UPSTREAM", "Something went wrong on the server.");
}

export function errorBody(error: ApiError): { error: { code: ErrorCode; message: string } } {
  return { error: { code: error.code, message: error.message } };
}

export function errorResponse(error: unknown): Response {
  const api = toApiError(error);
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (api.retryAfterSec !== undefined) headers["retry-after"] = String(api.retryAfterSec);
  return Response.json(errorBody(api), { status: api.status, headers });
}

/**
 * One structured log line per request. Only the route, the outcome code and timings are
 * written, never image data, prompts or plan text.
 */
export function logRequest(route: string, startedAt: number, code: ErrorCode | "OK"): void {
  if (process.env.NODE_ENV === "test") return;
  console.info(JSON.stringify({ route, code, ms: Date.now() - startedAt }));
}
