import { errorResponse, logRequest, toApiError } from "@/lib/server/errors";
import { readJson, requireLive, requireTicket } from "@/lib/server/guard";
import { getProvider, renderStep } from "@/lib/server/pipeline";
import { RenderBodySchema } from "@/lib/server/validate";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const env = requireLive();
    const body = RenderBodySchema.parse(await readJson(request, MAX_BODY));
    requireTicket(env, body.ticket, body.image, body.candidate, "render");
    const result = await renderStep(getProvider(env), body);
    logRequest("forge/render", startedAt, "OK");
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    logRequest("forge/render", startedAt, toApiError(error).code);
    return errorResponse(error);
  }
}
