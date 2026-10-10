import { ForgeFailure, type ForgeTransport } from "./run";
import type { ApiErrorBody, HealthResponse } from "./types";

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch {
    if (signal?.aborted) throw new ForgeFailure("ABORTED", "The forge was cancelled.");
    throw new ForgeFailure("NETWORK", "The connection was lost. Check your network and try again.");
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = (payload as Partial<ApiErrorBody> | null)?.error;
    if (error && typeof error.code === "string" && typeof error.message === "string") {
      throw new ForgeFailure(error.code, error.message);
    }
    // Platform-level failures (for example a function timeout) carry no JSON body.
    throw new ForgeFailure(
      response.status === 504 ? "TIMEOUT" : "UPSTREAM",
      response.status === 504 ? "The server took too long to answer." : "The server returned an error.",
    );
  }
  return payload as T;
}

/** Talks to the API routes of this app. */
export const httpTransport: ForgeTransport = {
  plan: (body, signal) => postJson("/api/forge/plan", body, signal),
  render: (body, signal) => postJson("/api/forge/render", body, signal),
  verify: (body, signal) => postJson("/api/forge/verify", body, signal),
};

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch("/api/health", { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Health check failed with status ${response.status}`);
  return (await response.json()) as HealthResponse;
}

/** Short, friendly headline per failure code for the error state. */
export function failureTitle(failure: ForgeFailure): string {
  switch (failure.code) {
    case "RATE_LIMITED":
      return "The forge needs a break";
    case "LIVE_DISABLED":
      return "Live forge is resting";
    case "UNSAFE":
      return "Not this photo";
    case "NO_CANDIDATE":
      return "No clean edit found";
    case "TIMEOUT":
      return "That took too long";
    case "BAD_INPUT":
      return "That photo did not work";
    case "NETWORK":
      return "Connection lost";
    default:
      return "The forge stumbled";
  }
}
