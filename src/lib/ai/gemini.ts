import { GoogleGenAI } from "@google/genai";
import type { ServerEnv } from "../server/env";
import { outputImage, outputText, type InteractionLike } from "./output";
import { editorPrompt, plannerPrompt, verifierPrompt } from "./prompts";
import type { AIProvider, EditInput, EditOutput, PlanInput, PlanOutput, VerifyInput, VerifyOutput } from "./provider";
import { AiError, callWithRetry, statusOf, TIMEOUTS, VISION_RETRIES, VISION_TRY_TIMEOUT } from "./retry";
import { modelSchema, parsePlan, parseVerify, PlanSchema, VerifySchema } from "./schemas";

/** How long a vision model is skipped after an overload or after its quota ran out. */
const OVERLOAD_REST_MS = 90_000;
const QUOTA_REST_MS = 60 * 60_000;
const restingUntil = new Map<string, number>();

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

  /** Vision models in the order they should be tried right now, skipping ones that are resting. */
  private visionOrder(): string[] {
    const now = Date.now();
    const all = [this.env.visionModel, ...this.env.visionFallbackModels];
    const unique = all.filter((id, index) => all.indexOf(id) === index);
    const awake = unique.filter((id) => (restingUntil.get(id) ?? 0) <= now);
    return awake.length ? awake : unique;
  }

  /**
   * A vision call. Each try uses the next model in line, so an overloaded or exhausted model
   * does not stop the forge. A model that failed or stalled rests for a while: 90 seconds
   * after an overload, an hour after its quota ran out.
   */
  private async json(label: string, timeoutMs: number, params: Params): Promise<string> {
    const order = this.visionOrder();
    const interaction = await callWithRetry(
      async (signal, remaining, attempt) => {
        const model = order[Math.min(attempt, order.length - 1)];
        const rest = (ms: number) => restingUntil.set(model, Date.now() + ms);
        const onAbort = () => rest(OVERLOAD_REST_MS);
        signal.addEventListener("abort", onAbort, { once: true });
        try {
          return await this.create({ ...params, model }, signal, remaining);
        } catch (error) {
          rest(statusOf(error) === 429 ? QUOTA_REST_MS : OVERLOAD_REST_MS);
          throw error;
        } finally {
          signal.removeEventListener("abort", onAbort);
        }
      },
      { label, timeoutMs, tryTimeoutMs: VISION_TRY_TIMEOUT, maxRetries: VISION_RETRIES, baseDelayMs: 300 },
    );
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
