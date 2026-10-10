import { liveStatus } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Reports whether live forging is available. Makes no model call. */
export async function GET() {
  return Response.json(liveStatus(), { headers: { "cache-control": "no-store" } });
}
