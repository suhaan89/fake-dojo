// Reads text and image output from an Interactions API response. The SDK offers the
// convenience properties `output_text` and `output_image`; when they are missing the
// same data is found in the `model_output` steps.

interface ContentBlock {
  type?: unknown;
  text?: unknown;
  data?: unknown;
  mime_type?: unknown;
}

interface Step {
  type?: unknown;
  content?: unknown;
}

export interface InteractionLike {
  output_text?: unknown;
  output_image?: unknown;
  steps?: unknown;
  outputs?: unknown;
  status?: unknown;
}

export interface OutputImage {
  data: string;
  mimeType: string;
}

function blocksOf(interaction: InteractionLike): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  if (Array.isArray(interaction.steps)) {
    for (const step of interaction.steps as Step[]) {
      if (step?.type === "model_output" && Array.isArray(step.content)) {
        blocks.push(...(step.content as ContentBlock[]));
      }
    }
  }
  // Older response shape: a flat list of content blocks.
  if (!blocks.length && Array.isArray(interaction.outputs)) {
    blocks.push(...(interaction.outputs as ContentBlock[]));
  }
  return blocks;
}

/** All text output joined, or null when the model produced none. */
export function outputText(interaction: InteractionLike): string | null {
  if (typeof interaction.output_text === "string" && interaction.output_text.trim()) {
    return interaction.output_text;
  }
  const parts = blocksOf(interaction)
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string);
  const joined = parts.join("");
  return joined.trim() ? joined : null;
}

/** The last generated image, or null when the model produced none. */
export function outputImage(interaction: InteractionLike): OutputImage | null {
  const direct = interaction.output_image as ContentBlock | undefined;
  if (direct && typeof direct.data === "string" && direct.data.length > 0) {
    return { data: direct.data, mimeType: typeof direct.mime_type === "string" ? direct.mime_type : "image/png" };
  }
  const images = blocksOf(interaction).filter(
    (block) => block?.type === "image" && typeof block.data === "string" && (block.data as string).length > 0,
  );
  const last = images[images.length - 1];
  if (!last) return null;
  return {
    data: last.data as string,
    mimeType: typeof last.mime_type === "string" ? last.mime_type : "image/png",
  };
}
