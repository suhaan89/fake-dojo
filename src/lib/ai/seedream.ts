import type { ServerEnv } from "../server/env";
import { editorPrompt } from "./prompts";
import type { AIProvider, EditInput, EditOutput, PlanInput, PlanOutput, VerifyInput, VerifyOutput } from "./provider";
import { AiError, callWithRetry, TIMEOUTS } from "./retry";

/** Seedream 4.0 needs at least 1280 x 720 pixels in total, so the edit is requested above our working size. */
export const SEEDREAM_SCALE = 1.5;

/** Output size for an input size: same aspect ratio, 1.5 times the edge length, even numbers. */
export function seedreamSize(width: number, height: number): string {
  const even = (value: number) => Math.round((value * SEEDREAM_SCALE) / 2) * 2;
  return `${even(width)}x${even(height)}`;
}

interface ImagesResponse {
  data?: { b64_json?: unknown; url?: unknown }[];
  error?: { code?: unknown; message?: unknown };
}

type Fetcher = typeof fetch;

/**
 * Image editing through Seedream 4.0 on BytePlus ModelArk (OpenAI-style images endpoint).
 * Only the edit step uses it. The result goes through the same registration, tone matching
 * and masked compositing as any other model output.
 */
export class SeedreamEditor {
  constructor(
    private readonly env: ServerEnv,
    private readonly fetcher: Fetcher = fetch,
  ) {
    if (!env.arkApiKey) throw new AiError("upstream", "ARK_API_KEY is not configured");
  }

  /** The request body for one edit. Exposed so the shape can be tested without a network call. */
  requestBody(input: EditInput): Record<string, unknown> {
    return {
      model: this.env.seedreamModel,
      prompt: editorPrompt(input.candidate.edit_instruction, input.attempt),
      image: `data:image/jpeg;base64,${input.image}`,
      size: seedreamSize(input.width, input.height),
      sequential_image_generation: "disabled",
      response_format: "b64_json",
      watermark: false,
    };
  }

  async edit(input: EditInput): Promise<EditOutput> {
    const body = JSON.stringify(this.requestBody(input));
    const payload = await callWithRetry<ImagesResponse>(
      async (signal) => {
        const response = await this.fetcher(`${this.env.arkBaseUrl}/images/generations`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.env.arkApiKey}` },
          body,
          signal,
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw Object.assign(new Error(detail.slice(0, 300) || response.statusText), { status: response.status });
        }
        return (await response.json()) as ImagesResponse;
      },
      { label: "Forging", timeoutMs: TIMEOUTS.edit },
    );

    const first = payload.data?.[0];
    if (first && typeof first.b64_json === "string" && first.b64_json.length > 0) {
      return { image: first.b64_json, mimeType: "image/jpeg" };
    }
    const reason = typeof payload.error?.message === "string" ? payload.error.message.slice(0, 200) : null;
    throw new AiError("blocked", reason ? `The image model declined: ${reason}` : "The image model returned no image");
  }
}

/** Gemini reads, plans and verifies; Seedream performs the edit. */
export class SeedreamForgeProvider implements AIProvider {
  readonly name = "gemini" as const;

  constructor(
    private readonly vision: Pick<AIProvider, "plan" | "verify">,
    private readonly editor: SeedreamEditor,
  ) {}

  plan(input: PlanInput): Promise<PlanOutput> {
    return this.vision.plan(input);
  }

  edit(input: EditInput): Promise<EditOutput> {
    return this.editor.edit(input);
  }

  verify(input: VerifyInput): Promise<VerifyOutput> {
    return this.vision.verify(input);
  }
}
