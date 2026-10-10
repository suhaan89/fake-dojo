import type { ServerEnv } from "../server/env";
import { plannerPrompt, verifierPrompt } from "./prompts";
import type { PlanInput, PlanOutput, VerifyInput, VerifyOutput } from "./provider";
import { AiError, callWithRetry, TIMEOUTS, VISION_RETRIES } from "./retry";
import { modelSchema, parsePlan, parseVerify, PlanSchema, VerifySchema } from "./schemas";

interface ChatResponse {
  choices?: { message?: { content?: unknown } }[];
  error?: { code?: unknown; message?: unknown };
}

type Fetcher = typeof fetch;
type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

function jpeg(data: string): Part {
  return { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data}` } };
}

/** The chat endpoint does not bind the answer to a schema, so the schema travels in the prompt. */
function jsonOnly(schema: unknown): string {
  return `Answer with one JSON object and nothing else: no markdown, no code fence, no commentary. It must match this JSON Schema:\n${JSON.stringify(schema)}`;
}

/** Text of an OpenAI-style chat answer, whether the content is a string or a list of parts. */
export function chatText(payload: ChatResponse): string | null {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim() ? content : null;
  if (Array.isArray(content)) {
    const joined = content
      .map((part: { text?: unknown } | null) => (typeof part?.text === "string" ? part.text : ""))
      .join("");
    return joined.trim() ? joined : null;
  }
  return null;
}

/**
 * Reading, planning and verifying through a vision model on BytePlus ModelArk
 * (OpenAI-style chat completions). Uses the same prompts and schemas as the Gemini path,
 * and its answers pass through the same server-side validation.
 */
export class ArkVision {
  constructor(
    private readonly env: ServerEnv,
    private readonly fetcher: Fetcher = fetch,
  ) {
    if (!env.arkApiKey) throw new AiError("upstream", "ARK_API_KEY is not configured");
  }

  /** The request body for one vision call. Exposed so the shape can be tested without a network call. */
  requestBody(prompt: string, schema: unknown, images: string[]): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.env.arkVisionModel,
      messages: [
        { role: "user", content: [{ type: "text", text: `${prompt}\n\n${jsonOnly(schema)}` }, ...images.map(jpeg)] },
      ],
      temperature: 0.6,
      max_tokens: 4096,
    };
    if (this.env.arkVisionThinking !== "off") body.thinking = { type: this.env.arkVisionThinking };
    return body;
  }

  private async json(label: string, timeoutMs: number, prompt: string, schema: unknown, images: string[]): Promise<string> {
    const body = JSON.stringify(this.requestBody(prompt, schema, images));
    const payload = await callWithRetry<ChatResponse>(
      async (signal) => {
        const response = await this.fetcher(`${this.env.arkBaseUrl}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.env.arkApiKey}` },
          body,
          signal,
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw Object.assign(new Error(detail.slice(0, 300) || response.statusText), { status: response.status });
        }
        return (await response.json()) as ChatResponse;
      },
      { label, timeoutMs, maxRetries: VISION_RETRIES },
    );
    const text = chatText(payload);
    if (!text) throw new AiError("bad_output", `${label} returned no text`);
    return text;
  }

  async plan(input: PlanInput): Promise<PlanOutput> {
    const text = await this.json("Planning", TIMEOUTS.plan, plannerPrompt(input), modelSchema(PlanSchema), [input.image]);
    try {
      return parsePlan(text);
    } catch {
      throw new AiError("bad_output", "The planner returned a plan that does not match the schema");
    }
  }

  async verify(input: VerifyInput): Promise<VerifyOutput> {
    const prompt = verifierPrompt(input.candidate.type, input.candidate.edit_instruction);
    const text = await this.json("Checking realism", TIMEOUTS.verify, prompt, modelSchema(VerifySchema), [
      input.original,
      input.forged,
    ]);
    try {
      return parseVerify(text);
    } catch {
      throw new AiError("bad_output", "The verifier returned a verdict that does not match the schema");
    }
  }
}
