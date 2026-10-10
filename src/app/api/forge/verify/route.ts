import { errorResponse, logRequest, toApiError } from "@/lib/server/errors";
import { readJson, requireLive, requireTicket } from "@/lib/server/guard";
import { getProvider, verifyStep } from "@/lib/server/pipeline";
import { VerifyBodySchema } from "@/lib/server/validate";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const env = requireLive();
    const body = VerifyBodySchema.parse(await readJson(request, MAX_BODY));
    requireTicket(env, body.ticket, body.original, body.candidate, "verify");
    const result = await verifyStep(getProvider(env), body);
    logRequest("forge/verify", startedAt, "OK");
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    logRequest("forge/verify", startedAt, toApiError(error).code);
    return errorResponse(error);
  }
}
