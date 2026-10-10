import type { ManipulationType } from "./types";

/** General advice per manipulation type, shown on the reveal next to the specific tell. */
export const TELLS: Record<ManipulationType, string> = {
  remove_object:
    "Look for repeated textures, smudged patterns and shadows without an owner. When something is erased, the model has to invent what was behind it, and invented ground, walls or foliage often look a little too smooth or repeat a nearby pattern.",
  add_object:
    "Check whether the object belongs to the light in the scene. Its shadow should fall the same way as the others, its edges should be as sharp or as soft as things at the same distance, and its size should fit the perspective.",
  replace_object:
    "Compare the object with its neighbors. A swapped item often has a slightly different sharpness, grain or color temperature than the things next to it, and where it touches the surface below the contact shadow can look painted on.",
  alter_text:
    "Read every sign, label and display. Edited text tends to have letters that are too even, spacing that drifts, or a font weight that does not match the rest of the sign. Ask whether the number or word still makes sense in context.",
  change_attribute:
    "Question colors and states. A recolored surface can lose its natural texture or reflect a color that nothing nearby explains, and a door, lamp or switch in a new state should change the light and shadows around it too.",
  lighting_shadow:
    "Follow the light. Every shadow in a scene should point away from the same source and have a similar softness. Reflections must show what is really opposite them. One shadow or highlight that disagrees is a strong clue.",
};
