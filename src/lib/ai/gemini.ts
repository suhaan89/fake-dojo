import { GoogleGenAI } from "@google/genai";
import type { ServerEnv } from "../server/env";
import { outputImage, outputText, type InteractionLike } from "./output";
import { editorPrompt, plannerPrompt, verifierPrompt } from "./prompts";
import type { AIProvider, EditInput, EditOutput, PlanInput, PlanOutput, VerifyInput, VerifyOutput } from "./provider";
import { AiError, callWithRetry, statusOf, TIMEOUTS } from "./retry";
import { modelSchema, parsePlan, parseVerify, PlanSchema, VerifySchema } from "./schemas";

const REST_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

type Params = Record<string, unknown>;
type CreateFn = (params: Params, options?: { timeout?: number; maxRetries?: number; signal?: AbortSignal }) => Promise<InteractionLike>;

function jpeg(data: string) {
  return { type: "image", mime_type: "image/jpeg", data };
}

/** Real calls to the Gemini Interactions API. */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;
  private readonly ai: GoogleGenAI;

  constructor(private readonly env: ServerEnv) {
    if (!env.apiKey) throw new AiError("upstream", "GEMINI_API_KEY is not configured");
    this.ai = new GoogleGenAI({ apiKey: env.apiKey });
  }

  /** One request through the SDK, or through REST when the SDK has no Interactions client. */
  private async create(params: Params, signal: AbortSignal, timeoutMs: number): Promise<InteractionLike> {
    const client = (this.ai as unknown as { interactions?: { create?: CreateFn } }).interactions;
    if (client && typeof client.create === "function") {
      return client.create.call(client, params, { timeout: timeoutMs, maxRetries: 0, signal });
    }
    const response = await fetch(REST_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.env.apiKey ?? "" },
      body: JSON.stringify(params),
      signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw Object.assign(new Error(body.slice(0, 300) || response.statusText), { status: response.status });
    }
    return (await response.json()) as InteractionLike;
  }

  private call(label: string, timeoutMs: number, params: Params): Promise<InteractionLike> {
    return callWithRetry((signal, remaining) => this.create(params, signal, remaining), { label, timeoutMs });
  }

  private async json(label: string, timeoutMs: number, params: Params): Promise<string> {
    const interaction = await this.call(label, timeoutMs, params);
    const text = outputText(interaction);
    if (!text) throw new AiError("bad_output", `${label} returned no text`);
    return text;
  }

  async plan(input: PlanInput): Promise<PlanOutput> {
    const text = await this.json("Planning", TIMEOUTS.plan, {
      model: this.env.visionModel,
      input: [
        { type: "text", text: plannerPrompt(input) },
        jpeg(input.image),
      ],
      response_format: { type: "text", mime_type: "application/json", schema: modelSchema(PlanSchema) },
      generation_config: { thinking_level: this.env.visionThinking },
    });
    try {
      return parsePlan(text);
    } catch {
      throw new AiError("bad_output", "The planner returned a plan that does not match the schema");
    }
  }

  async edit(input: EditInput): Promise<EditOutput> {
    const params = (mimeType: string): Params => ({
      model: this.env.geminiImageModel,
      input: [
        { type: "text", text: editorPrompt(input.candidate.edit_instruction, input.attempt) },
        jpeg(input.image),
      ],
      response_format: { type: "image", mime_type: mimeType, aspect_ratio: input.aspectRatio, image_size: "1K" },
      generation_config: { thinking_level: this.env.imageThinking },
    });
    let interaction: InteractionLike;
    try {
      interaction = await this.call("Forging", TIMEOUTS.edit, params("image/png"));
    } catch (error) {
      // Some model versions only emit JPEG. A 400 on the PNG request is retried once as JPEG.
      if (error instanceof AiError && error.kind === "upstream" && statusOf(error) === 400) {
        interaction = await this.call("Forging", TIMEOUTS.edit, params("image/jpeg"));
      } else {
        throw error;
      }
    }
    const image = outputImage(interaction);
    if (!image) {
      const text = outputText(interaction);
      throw new AiError(
        "blocked",
        text ? `The image model declined: ${text.slice(0, 200)}` : "The image model returned no image",
      );
    }
    return { image: image.data, mimeType: image.mimeType };
  }

  async verify(input: VerifyInput): Promise<VerifyOutput> {
    const text = await this.json("Checking realism", TIMEOUTS.verify, {
      model: this.env.visionModel,
      input: [
        { type: "text", text: verifierPrompt(input.candidate.type, input.candidate.edit_instruction) },
        jpeg(input.original),
        jpeg(input.forged),
      ],
      response_format: { type: "text", mime_type: "application/json", schema: modelSchema(VerifySchema) },
      generation_config: { thinking_level: this.env.visionThinking },
    });
    try {
      return parseVerify(text);
    } catch {
      throw new AiError("bad_output", "The verifier returned a verdict that does not match the schema");
    }
  }
}
