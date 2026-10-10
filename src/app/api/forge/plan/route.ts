import type { PlanResponse } from "@/lib/forge/types";
import { errorResponse, logRequest, toApiError } from "@/lib/server/errors";
import { countForge, readJson, requireLive } from "@/lib/server/guard";
import { getProvider, planStep } from "@/lib/server/pipeline";
import { issueTicket } from "@/lib/server/ticket";
import { PlanBodySchema } from "@/lib/server/validate";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const env = requireLive();
    const body = PlanBodySchema.parse(await readJson(request, MAX_BODY));
    // A forge is counted here, once, before any model call is made.
    countForge(request, env);
    const { candidates, ...plan } = await planStep(getProvider(env), body);
    const response: PlanResponse = {
      ...plan,
      ticket: issueTicket(env.apiKey, body.image, candidates),
      candidate: candidates[0],
      alternates: candidates.slice(1),
    };
    logRequest("forge/plan", startedAt, "OK");
    return Response.json(response, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    logRequest("forge/plan", startedAt, toApiError(error).code);
    return errorResponse(error);
  }
}
