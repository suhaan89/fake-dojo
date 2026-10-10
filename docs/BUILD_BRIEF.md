# Fake Dojo: Build Brief for Claude Code

Banana Hacks 2026. Builder: Suhan Nawaz (solo). This brief is the single source of truth for the build.

THEME (announced by the organizers): image everything
EXTRA CHALLENGE DETAILS FROM THE OPENING CEREMONY (the human fills this in if there are any): none

---

## 0. How you (Claude Code) work on this

You are the tech lead and senior full-stack engineer. Build the project described here autonomously, milestone by milestone, inside the current git repository.

1. Read this entire brief before writing any code.
2. Create `CLAUDE.md` in the repo root: a compact summary (max 60 lines) of the hard rules (section 1), the stack, the commands, the conventions and the current milestone. Keep it updated so a fresh session can continue seamlessly.
3. Create a task list from section 16 and work through it in order.
4. Decide yourself. Do not ask for confirmation on routine choices. Log non-obvious decisions as one-liners in `docs/DECISIONS.md`.
5. Stop and ask the human ONLY for things only he can do (section 18). Ask briefly, then keep working on something else while you wait.
6. Talk to the human in German, short and direct, no em-dashes. Code, comments, UI copy and docs are in English.
7. After each milestone run `npm run typecheck`, `npm test` and `npm run build`. Fix everything. Then commit and push.
8. Scope discipline: a polished core loop beats many half-finished features. No accounts, no database, no auth.
9. No placeholders in the final code: no TODO comments, no dead buttons, no lorem ipsum, no fake data presented as real.

---

## 1. Context and hard rules

Event: Banana Hacks 2026, a free online hackathon for students about generative AI and image creation. Theme: "image everything".

Hacking window and deadline:
- The window opened at the opening ceremony (Oct 10, 2026, 00:00 UTC).
- Treat Sunday Oct 11, 23:59 EDT (= Monday Oct 12, 03:59 UTC = 05:59 in Germany) as the hard deadline. The official site also mentions 23:59 AoE; we use the earlier time.
- Plan: feature complete Saturday night (German time), polish and submit on Sunday.

Rules that must never be broken:
- All code is written and committed inside the hacking window. The organizers check commit timestamps. Commit small and often (at least every 30 to 60 minutes of work) with clear conventional-commit messages. Push regularly.
- Never rewrite history: no squashing, no rebasing pushed commits, no force push, no changed commit dates.
- The repo is public. Never commit secrets. `.env*` is gitignored except `.env.example`.
- Credit every open-source library, API, pre-trained model and photo source in the README.
- AI disclosure: Claude Code wrote most of the code under Suhan's direction; Gemini models run at runtime. State this in README.md and DEVPOST.md.
- The submission needs: project name, one-paragraph description, GitHub link, demo video of max 3 minutes, optional live URL (judges will poke at it).

Judging: five equally weighted criteria, each scored 1 to 5:
1. Technical execution and difficulty: real engineering with image AI, computer vision or generative models, thoughtful model choice, non-trivial integration. Thin API wrappers score lower.
2. Innovation and creativity: fresh angle, unexpected combination of tools. Generic clones score lower.
3. Use of the image AI theme ("image everything"): image AI must be the core. If it could be removed without breaking the experience, it scores lower.
4. Impact and usefulness: real problem, clear user, clear benefit, plausible path to real use after the weekend.
5. Design, presentation and demo: clean UI, polished output, clear demo video and write-up.

Extra awards: Best creative tool (a gen-AI tool someone would actually keep using), Best fine-tune, Most surprising output, People's choice.

---

## 2. The idea and why it wins

Fake Dojo is a training gym for the AI image era. An AI agent forges one subtle, realistic edit into a real photo (the player's own or a curated one). The player hunts for the forgery. Then a forensic reveal shows exactly which pixels changed, how a careful eye could have caught it, and what forensic tools would have shown. The dojo adapts to the player's weak spots and gets harder.

Pitch line: "When AI can image everything, seeing is no longer believing. Fake Dojo turns image AI against itself to train the human eye."

Analogy for judges: companies train employees with simulated phishing emails. Nobody trains people with simulated image fakes. Fake Dojo does, personalized and adaptive.

Rubric mapping (keep these visible in the product and the docs):
- Technical: agentic forge pipeline (plan, edit, composite, verify, self-correcting retries); pixel-exact ground-truth masks through our own compositing; alignment search and tone matching; forensic lenses (ELA, noise residual, Sobel) implemented from scratch in a Web Worker; adaptive difficulty model; export of a pixel-labeled forgery dataset.
- Innovation: the generator is used to train humans, not to deceive them; the fakes are made from the player's own photos.
- Theme: image AI is the entire product. Vision models read and plan, an image model forges, CV measures. Remove it and nothing remains.
- Impact: media literacy for everyone. Concrete first users: Suhan leads the AI club at his high school in Germany (students from grade 8, weekly sessions on using AI wisely and responsibly). Classroom Mode is built for exactly that and needs no accounts.
- Demo: a magic moment within 20 seconds: "One of these photos was edited by AI. Which one?" followed by the heatmap reveal.

---

## 3. Product specification

Name: Fake Dojo. Tagline: "Train your eye for AI fakes. On your own photos."

### 3.1 Core loop (Forge mode)
1. Choose a photo: upload, camera capture on mobile (`accept="image/*"`, offer `capture="environment"`), or pick a sample from the deck.
2. Forge: the agent creates one localized edit. The UI shows the agent timeline (3.3).
3. Hunt: the player sees ONLY the forged image, never the original. Zoom and pan (wheel, pinch, buttons), optional loupe. Tap where you think the edit is. Max 2 guesses. Optional hint (costs points). A "Reveal" button to give up.
4. Reveal: hit or miss with points; before/after slider; ground-truth heatmap overlay; "What changed" (type, target, one-sentence description); "The tell" (how a careful viewer could notice); forensic lenses; the un-redacted agent log.
5. Adapt: update the skill profile. The next forge targets weak manipulation types and adjusts the difficulty.

### 3.2 Modes
- Forge (live, needs the API).
- Daily Dojo: a deck of 10 cards from `public/deck/deck.json`, about 70% forged and 30% untouched real photos. For each card the player first decides "Real" or "Edited". If the card is edited and the player is right, they locate the edit for bonus points. End screen: score, accuracy per type, weakest type, and a "Train this in Forge" button. Zero API calls. This is also the fallback whenever live forging is unavailable.
- Classroom: projector-friendly full-screen deck. Huge image, big "Real" and "Edited" labels, a 10-second countdown so the class can vote by raising hands, then a big reveal with the tell in large type. Keyboard: Space reveals, Right arrow goes to the next card, F toggles fullscreen. No accounts, nothing stored.

### 3.3 Agent timeline with redaction (signature UX)
- Steps: Reading the scene, Planning the forgery, Forging, Checking realism, Ready.
- Show real data with durations in monospace, but redact anything that would spoil the answer until the reveal. Example: "Scene: harbor promenade, 11 objects found." and "Plan: [redacted] on [redacted], subtlety 4 of 5." Redactions are solid ink-black bars.
- After the reveal the bars slide away and the full log is readable.
- Rejected attempts are shown openly, for example: "Attempt 1 rejected by the verifier: visible seam. Retrying with a smaller region." This makes the agent loop visible to the judges.

### 3.4 Manipulation types (`ManipulationType`)
- `remove_object`: remove a small or medium object.
- `add_object`: insert a plausible new object.
- `replace_object`: swap an object for a similar but different one.
- `alter_text`: change neutral text on a sign, label or display (numbers, opening hours, prices, generic words). Only if legible text exists.
- `change_attribute`: change color, material or state (door open or closed, lamp on or off).
- `lighting_shadow`: alter, add or remove a shadow or a reflection.

`src/lib/game/tells.ts` holds 2 to 3 sentences of general advice per type (for example remove_object: look for repeated textures, smudged patterns and shadows without an owner).

### 3.5 Difficulty 1 to 5
- 1: edit region covers 8 to 15% of the image, obvious change, forensic traces left in (no re-compression).
- 2: 5 to 10%.
- 3: 3 to 8%, mild re-compression.
- 4: 1 to 4%, subtle change, traces hidden.
- 5: 0.5 to 3%, very subtle (text, shadow, attribute), traces hidden.
These ranges go into the planner prompt and into the server validation.

### 3.6 Progression
- Points: hit on the first guess = 100 x difficulty, on the second guess = 60 x difficulty, minus 30 per hint, minus 20 per lab-tool use during the hunt. A correct Real/Edited call = 50.
- Belts by total points: White 0, Yellow 500, Orange 1500, Green 3000, Blue 5000, Brown 8000, Black 12000.
- Skill per type: mean of Beta(1 + hits, 1 + misses). Weakness weight = 1 minus that mean, normalized; sent to the planner.
- Difficulty: start at 2; +1 after two hits in a row; -1 after a miss; clamp to 1..5.
- Store everything in localStorage under `fakedojo.profile.v1`, always inside try/catch. The app must work when storage fails.
- Profile page: belt, points bar, radar chart of the 6 types (hand-rolled SVG), recent rounds, reset button.

---

## 4. Architecture

Stack (latest stable versions, check before installing):
- Next.js (App Router, TypeScript strict, `src/` dir, import alias `@/*`), Tailwind CSS.
- `@google/genai` (Gemini SDK), `zod` v4, `sharp` (server-side image ops), `vitest`, `tsx` (scripts).
- No other heavy dependencies: no UI kits, no chart libraries, no state libraries, no database.
- Node 20 or newer.

Principles:
- Server: Route Handlers in `src/app/api/...` with `export const runtime = "nodejs"` and `export const maxDuration = 60`.
- The client orchestrates a forge as three calls (plan, render, verify). Each request stays far below serverless limits and the UI can show real progress.
- Images travel as base64 JPEG inside JSON (prepared images are about 200 to 400 KB). The server rejects decoded images over 5 MB.
- Image math lives in pure TypeScript in `src/lib/cv` and `src/lib/forensics`, operating on `{ width, height, data: Uint8ClampedArray }` (RGBA). The server decodes and encodes with sharp, the browser uses canvas ImageData. Same functions, unit-tested.
- Model ids are only read in `src/lib/server/env.ts`, never hardcoded elsewhere.

`.env.example`:
```
GEMINI_API_KEY=
GEMINI_VISION_MODEL=gemini-3.8-flash
GEMINI_IMAGE_MODEL=gemini-nano-banana-2.1
GEMINI_IMAGE_THINKING=medium
LIVE_FORGE_ENABLED=true
LIVE_FORGE_DAILY_CAP=150
LIVE_FORGE_PER_IP_PER_HOUR=8
MOCK_AI=false
```

API:
- `GET /api/health` returns `{ liveForge: boolean, reason?: string, mock: boolean, models: { vision, image } }`. No AI call.
- `POST /api/forge/plan` with body `{ image, difficulty, weights, avoid? }` returns the validated plan including the chosen candidate.
- `POST /api/forge/render` with body `{ image, candidate, difficulty, attempt }` returns `{ forged, mask, heat, changeBox, stats }` (images as base64).
- `POST /api/forge/verify` with body `{ original, forged, candidate }` returns the verifier verdict.
- Errors: `{ error: { code, message } }` with codes `RATE_LIMITED`, `LIVE_DISABLED`, `UPSTREAM`, `TIMEOUT`, `UNSAFE`, `NO_CANDIDATE`, `BAD_INPUT` and matching HTTP status codes.
- Rate limiting counts a forge at the plan call: an in-memory per-IP sliding window (`LIVE_FORGE_PER_IP_PER_HOUR`) plus a global daily counter (`LIVE_FORGE_DAILY_CAP`). Per-instance memory is acceptable; document the limitation. Take the IP from the first entry of `x-forwarded-for`.

---

## 5. AI integration (exact API usage)

Use the Gemini Interactions API, the currently recommended API. Read these two pages before implementing. If they disagree with this brief, the live docs win:
- https://ai.google.dev/gemini-api/docs/image-generation
- https://ai.google.dev/gemini-api/docs/image-understanding

Models (configurable via env):
- Vision, planning, verification: `gemini-3.8-flash` (a free tier exists).
- Image editing: `gemini-nano-banana-2.1` (Nano Banana 2.1). No free tier, needs a paid key, about 0.034 USD per 1K output image. All outputs carry an invisible SynthID watermark.

Reference usage (JavaScript, adapted from the docs):
```ts
import { GoogleGenAI } from "@google/genai";
import * as z from "zod";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Vision with structured JSON output
const planInteraction = await ai.interactions.create({
  model: process.env.GEMINI_VISION_MODEL ?? "gemini-3.8-flash",
  input: [
    { type: "text", text: plannerPrompt },             // text BEFORE the image
    { type: "image", mime_type: "image/jpeg", data: imageBase64 },
  ],
  response_format: {
    type: "text",
    mime_type: "application/json",
    schema: z.toJSONSchema(PlanSchema),
  },
  generation_config: { thinking_level: "minimal" },   // recommended for detection and segmentation
});
const plan = PlanSchema.parse(JSON.parse(planInteraction.output_text));

// Image editing
const editInteraction = await ai.interactions.create({
  model: process.env.GEMINI_IMAGE_MODEL ?? "gemini-nano-banana-2.1",
  input: [
    { type: "text", text: editPrompt },
    { type: "image", mime_type: "image/jpeg", data: imageBase64 },
  ],
  response_format: { type: "image", mime_type: "image/png", aspect_ratio: "4:3", image_size: "1K" },
  generation_config: { thinking_level: process.env.GEMINI_IMAGE_THINKING ?? "medium" },
});
const editedBase64 = editInteraction.output_image?.data;
```

Notes:
- `output_text` and `output_image` are SDK convenience properties. If they are missing, iterate `interaction.steps`, take steps with `type === "model_output"` and read the content blocks with `type === "text"` or `type === "image"` (`data` is base64). Write one helper (`src/lib/ai/output.ts`) that handles both.
- If the installed SDK lacks `ai.interactions`, upgrade it. If that still fails, call REST `POST https://generativelanguage.googleapis.com/v1beta/interactions` with header `x-goog-api-key` and the same body.
- Bounding boxes are `box_2d = [ymin, xmin, ymax, xmax]`, normalized to 0..1000. Segmentation polygons are `[[x, y], ...]`, normalized to 0..1000.
- `image_size` needs an uppercase K ("1K").
- Supported aspect ratios: 1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9. Every input is pre-cropped to one of these (6.1) and the same ratio is requested, so the edit aligns with the original.
- If the API rejects the JSON schema, simplify it (strip `$schema` and `additionalProperties`, avoid unions, use plain string enums).
- Every call gets a timeout (plan 25 s, edit 55 s, verify 25 s) and retries on 429, 500 and 503 with exponential backoff and jitter (max 2 retries).

Provider abstraction in `src/lib/ai/provider.ts`:
```ts
interface AIProvider {
  plan(input: PlanInput): Promise<PlanOutput>;
  edit(input: EditInput): Promise<EditOutput>;
  verify(input: VerifyInput): Promise<VerifyOutput>;
}
```
- `GeminiProvider`: the real calls.
- `MockProvider`: no network, deterministic. Plan picks a fixed region left of center with type `change_attribute`; edit shifts the hue and darkens that region with sharp; verify accepts. Used when `MOCK_AI=true` or when the key is missing in development, so the full pipeline (composite, diff, heat, scoring, reveal) is testable for free. The UI shows a small "Mock mode" label.

Schemas (`src/lib/ai/schemas.ts`):
```
PlanSchema {
  scene_summary: string                        // max ~200 chars
  safety: {
    contains_people: boolean
    people_boxes: number[][]                   // box_2d each
    is_sensitive_document: boolean             // IDs, receipts, chat screenshots, news, medical or legal documents
    refuse: boolean
    refuse_reason: string                      // empty if not refused
  }
  objects: { label: string, box_2d: number[] }[]   // up to 20 prominent items
  candidates: {                                // exactly 3, diverse
    type: ManipulationType
    target_label: string
    target_description: string                 // where it is, in words
    box_2d: number[]                           // region to edit
    polygon: number[][]                        // segmentation of the target, empty for add_object
    edit_instruction: string                   // precise instruction for the image model
    plausibility_rationale: string
    tell: string                               // what gives it away to a careful viewer
    hint: string                               // vague location hint that does not spoil
    subtlety: number                           // 1..5
  }[]
  chosen_index: number
}

VerifySchema {
  edit_applied: boolean
  matches_intent: boolean
  artifacts_visible: boolean
  artifact_notes: string
  people_altered: boolean
  inappropriate: boolean
  plausibility: number      // 1..5
  obviousness: number       // 1..5
  tell: string              // best clue for a careful viewer, one sentence
  hint: string              // vague, non-spoiling
}
```

Prompts (`src/lib/ai/prompts.ts`). Refine the wording, keep the rules.

Planner:
```
You are the Forger in Fake Dojo, a media-literacy training game. A player will try to find a single edit in this photo. Plan ONE realistic, localized manipulation that a careful player could still find.
Rules:
- Never involve people. Do not edit, add, remove or touch any person, face, body, clothing or anything a person holds. Keep the edit region at least 5% of the image width away from any person.
- Never create harmful, sexual, violent, political, defamatory or hateful content. Text edits only with neutral content such as numbers, opening hours, prices or generic words.
- If the image is a sensitive document (ID, receipt, chat screenshot, news article, medical or legal document) or is mostly a person, set refuse to true and explain briefly.
- The edit must be photorealistic and physically plausible: scale, perspective, lighting direction and shadows must fit the scene.
- Difficulty {difficulty} of 5: the edit region must cover {minPct}% to {maxPct}% of the image area.
- Preferred manipulation types with weights: {weights}. Avoid: {avoid}.
- Return exactly 3 diverse candidates and choose the best one in chosen_index.
- edit_instruction must be a precise, self-contained instruction for an image-editing model: state exactly what to change and where (relative position plus a description of the target), and end with: "Keep everything else in the image exactly identical: framing, perspective, lighting, colors, sharpness, grain and all other objects."
- Bounding boxes as [ymin, xmin, ymax, xmax] normalized to 0-1000. Polygons as [[x, y], ...] normalized to 0-1000.
```

Editor:
```
Edit this photograph. {edit_instruction}
The change must look as if it was captured by the same camera: match perspective, scale, lighting direction, color temperature, depth of field, motion blur, sensor noise and JPEG texture. Do not modify any person. Do not change anything outside the described region. Do not add text overlays, borders, captions, logos or watermarks. Return the full image with identical framing.
```

Verifier (input order: this text, then image 1 = original, then image 2 = edited):
```
Image 1 is an original photo. Image 2 is an edited version of it. The intended edit was: {type}: {edit_instruction}.
Judge strictly and fill every field: was the edit applied, does it match the intent, are artifacts visible (seams, smudges, warped lines, mismatched lighting), was any person altered, is anything inappropriate, plausibility 1-5, obviousness 1-5, the single best tell for a careful viewer, and a vague hint that does not reveal the location precisely.
```

---

## 6. Image pipeline and computer vision

### 6.1 Prepare (client: `src/lib/image/prepare.ts`; Node twin for scripts: `src/lib/image/prepare-node.ts`)
- Accept JPEG, PNG, WebP (and HEIC if the browser can decode it). Max 15 MB input.
- Apply EXIF orientation (`createImageBitmap(file, { imageOrientation: "from-image" })`).
- Center-crop to the supported aspect ratio with the smallest error, then resize so the long edge is 1024 px.
- Encode as JPEG quality 0.92 through canvas. This strips EXIF including GPS (a privacy win, mention it in the UI and README).
- Return `{ data, mimeType, width, height, aspectRatio }`.
- The crop-rectangle math is one shared pure function (`src/lib/image/crop.ts`) used by the browser and the Node version.

### 6.2 Plan validation (server)
- Clamp boxes to 0..1000 and convert them to pixels.
- Reject candidates whose area is outside the difficulty range (30% tolerance), that intersect people boxes expanded by 5% of the image width, or that have degenerate polygons.
- Use the chosen candidate if valid, else the next valid one. If none is valid, re-plan once with feedback in `avoid`. If there is still none, return `NO_CANDIDATE` (or `UNSAFE` if refused); the client then offers a deck card.

### 6.3 Render and composite (server: `src/lib/cv/*`)
1. Call the image model with the prepared original and the editor prompt, requesting the same aspect ratio.
2. Decode the output and resize it to exactly the original W x H (sharp, fit "fill").
3. Alignment: compute the mean absolute luma difference in a 24 px ring around the dilated target region. If it is above 12/255, search integer shifts dx, dy in [-8, 8] (coarse step 2, then refine with step 1) that minimize this difference and apply the best one. If it is still poor, flag it so the route retries once.
4. Tone matching: inside the mask, match the per-channel mean and standard deviation of the edited pixels to the original's ring statistics (local color transfer). This removes visible seams caused by global color drift of the model.
5. Mask: rasterize the polygon if present, else the box; dilate by max(12 px, 3% of min(W, H)); feather with a separable Gaussian blur (sigma 6 to 10 px) into alpha in [0, 1].
6. Composite: out = orig * (1 - alpha) + edit * alpha, per channel.
7. Ground-truth change map: per-pixel luma |out - orig|, 3x3 box blur, threshold at 10/255, two iterations of morphological opening to remove specks. Compute the changed-area percentage and the change bounding box (normalized 0..1). This mask is the answer key, and it is exact because we composited it ourselves.
8. Failure checks: a changed area below 0.1% means the edit was not applied. Retry once with a more explicit instruction, then try the next candidate.
9. Post-processing by difficulty: 1 to 2 encode JPEG q 95 (the compression mismatch stays visible to ELA); 3 encode q 90; 4 to 5 add subtle global Gaussian noise (sigma about 1.2) and encode q 85 (hides ELA traces). The reveal explains this.
10. Heat overlay PNG: red #E5484D with alpha proportional to the blurred change magnitude, transparent elsewhere.
11. Return the base64 forged image, mask PNG, heat PNG, changeBox and stats (changed %, mean delta, alignment shift, attempt, timings).

### 6.4 Hit testing (client)
- A tap is a hit if it lands inside the change mask dilated by 2% of min(W, H). It is "close" if within 8%.
- Convert tap coordinates into natural image space, accounting for zoom, pan and object-fit.

---

## 7. Forensic lenses (client, Web Worker, `src/lib/forensics`)

Implement from scratch on ImageData, no libraries. Run in `src/workers/forensics.worker.ts` (`new Worker(new URL("../workers/forensics.worker.ts", import.meta.url), { type: "module" })`) with a main-thread fallback.
- ELA (Error Level Analysis): re-encode as JPEG quality 0.90 (OffscreenCanvas `convertToBlob`), decode, per-channel absolute difference, amplify x20, clamp. Caption: "Areas saved a different number of times compress differently. Bright patches can hint at pasted content. Edges and fine textures are naturally brighter, so this is a clue, not proof."
- Noise residual: luma minus 3x3 median, absolute value, local standard deviation over 8x8 blocks, normalized and colorized with a hand-written color ramp. Caption: "Every camera leaves a noise fingerprint. Generated patches are often smoother or noisier than their surroundings."
- Edges: Sobel gradient magnitude. Caption: "Seams and unnaturally clean edges around inserted objects."
- Loupe: 3x magnifier following the pointer or finger.
- UI: a lens switcher (Photo, ELA, Noise, Edges) on the reveal screen; during the hunt at difficulty 3 and above as optional "Lab tools" that cost 20 points. Compute each lens once and cache it. Always show: "Forensics give clues, not proof."
- Tests: a flat gray synthetic image with a pasted noisy square must yield clearly higher ELA and noise values inside the square.

---

## 8. Game logic (`src/lib/game`)

`types.ts`, `scoring.ts`, `progression.ts` (belts, Beta skill model), `difficulty.ts`, `tells.ts`, `deck.ts` (load, shuffle with a seeded RNG, `?seed=` support), `rng.ts`. All pure and unit-tested.

---

## 9. Pages and components

- `/` Landing: headline "One of these photos was edited by AI. Which one?" with two deck images (one real, one forged) side by side. Clicking one answers and reveals the heatmap instantly (no API). Below: three mode cards (Forge your photo, Daily Dojo, Classroom), "How it works" in three steps, a short ethics note, and a footer with the GitHub link and "Built at Banana Hacks 2026".
- `/forge`: upload, agent timeline, hunt, reveal, next round.
- `/dojo`: Daily Dojo deck with end summary.
- `/classroom`: projector mode.
- `/profile`: belt, points, radar, history, reset.
- `/how-it-works`: pipeline diagram (plain HTML/SVG boxes and arrows), forensic methods, safety and privacy, models and credits. Doubles as material for the video.
- Shared components: `ImageStage` (zoom, pan, tap, crosshair, loupe), `BeforeAfterSlider`, `HeatOverlay`, `LensSwitcher`, `AgentTimeline` with `Redacted`, `ResultCard`, `BeltBadge`, `SkillRadar`, `StatusPill`, toasts and error states.

---

## 10. Safety, privacy, ethics

- People are never edited: planner rules, server validation against people boxes, and the verifier flag `people_altered` (if true, discard and retry).
- Refuse sensitive documents and selfies with a friendly message: "Fake Dojo edits scenes, never people. Try a photo of a street, a room or a table."
- No storage: images exist only in memory during a request. Production logs contain timings and error codes only, never image data or plan text.
- EXIF and GPS data are stripped on the client before upload.
- No download of live forgeries. Any saved or shared card gets a burned-in visible label "FAKE DOJO TRAINING IMAGE: EDITED".
- Gemini outputs carry SynthID; mention it on How it works.
- README.md and How it works contain an ethics section: why a forgery trainer is net positive (same logic as phishing simulations) and the guardrails above.

---

## 11. Demo safety and cost control

- The app must look great with zero API calls: landing, Daily Dojo and Classroom run from the committed deck.
- `/api/health` drives a status pill: "Live forge online" or "Live forge resting, try the Daily Dojo".
- Every forge failure shows a friendly message plus a one-click "Play a pre-forged card instead".
- Caps: per-IP per hour, daily global cap, and the `LIVE_FORGE_ENABLED` kill switch. The API key lives only on the server, never in a `NEXT_PUBLIC_` variable.
- Cost note in the README: one forge = one image output (about 0.034 USD) plus two cheap vision calls.
- Recording mode: `/?demo=1` and `/dojo?seed=demo` load a fixed, curated card order so the demo video is reproducible.
- Keep cold starts fast: import sharp only where it is needed.

---

## 12. Design direction

- Concept: forensic lab notebook. Paper background #F6F4EF, ink text #121212, hairline borders #D9D5CC, signal red #E5484D for "edited", calm green #1F7A5A for "real". Dark mode only if time remains.
- Typography via next/font: Geist Sans (or Inter) for UI, Geist Mono (or JetBrains Mono) for the agent log, measurements and timings. Big confident headlines, generous whitespace.
- Avoid generic AI aesthetics: no purple or blue gradients, no glowing blobs, no glassmorphism, no sparkle icons, no emoji decoration, no circled-number badges, no "·" separators, no "+50"-style badges (write "50 points"). Plain, precise text. The builder explicitly dislikes AI-looking design.
- Motion only with purpose: redaction bars sliding away, heatmap fade-in, the slider. Respect `prefers-reduced-motion`.
- Mobile first: everything works at 375 px width; pinch-zoom and tap in the hunt; touch targets at least 44 px.
- Accessibility: keyboard hunt (arrow keys move a crosshair, Enter guesses), visible focus, AA contrast, `aria-live` for results, alt texts.
- Copy: English, short, confident, no unexplained jargon.

---

## 13. Target file structure

```
CLAUDE.md
README.md
DEVPOST.md
DEMO_SCRIPT.md
PITCH_QA.md
.env.example
docs/BUILD_BRIEF.md          (this file)
docs/DECISIONS.md
docs/QA.md
seed/photos/                 (the human adds his own photos)
scripts/seed-deck.ts
scripts/smoke.ts
public/deck/                 (generated deck.json and card images)
src/app/...                  (pages)
src/app/api/health/route.ts
src/app/api/forge/plan/route.ts
src/app/api/forge/render/route.ts
src/app/api/forge/verify/route.ts
src/components/...
src/lib/ai/         provider.ts gemini.ts mock.ts prompts.ts schemas.ts retry.ts output.ts
src/lib/cv/         types.ts polygon.ts mask.ts blur.ts align.ts tone.ts composite.ts diff.ts
src/lib/image/      prepare.ts prepare-node.ts crop.ts
src/lib/forensics/  ela.ts noise.ts sobel.ts colormap.ts
src/lib/game/       types.ts scoring.ts progression.ts difficulty.ts tells.ts deck.ts rng.ts
src/lib/server/     env.ts ratelimit.ts errors.ts validate.ts
src/workers/forensics.worker.ts
```

---

## 14. Scripts

- `npm run dev`, `build`, `start`, `test` (vitest run), `lint`, `typecheck`.
- `npm run smoke -- <photo>`: runs plan, render and verify from Node against the configured provider, writes the outputs to `tmp/smoke/`, prints timings and the estimated cost. Use it to prove the AI integration before building the UI.
- `npm run seed`: builds the deck from `seed/photos/*`.
  - Per photo: prepare (Node twin), then 1 to 2 forged cards at varied difficulties, balanced across the 6 types; about 30% of the photos also become untouched "real" cards.
  - Writes `public/deck/<id>/original.jpg`, `forged.jpg`, `mask.png`, `heat.png` and `public/deck/deck.json` (id, kind "forged" or "real", type, difficulty, target_description, tell, hint, changeBox, stats, verify summary, createdAt).
  - Resumable (skips existing ids), concurrency 2, flags `--limit` and `--dry-run`, prints estimated and actual cost.
  - Also writes `dataset/manifest.jsonl` (image path, mask path, type, difficulty): a pixel-exact labeled forgery-localization dataset. Mention it in the README as a research by-product. Do not commit large dataset copies; the deck folder already holds the files.
  - If `seed/photos` is empty, print clear instructions and exit with code 0.
- Commit the generated `public/deck` (keep it under 25 MB).

---

## 15. Testing and quality gates

- Vitest unit tests: cv (crop math, polygon raster, feather, composite, diff, alignment on a shifted synthetic image, tone matching), forensics, game logic, schema parsing of sample model outputs, rate limiter.
- Route tests for `/api/forge/*` with the MockProvider (call the handlers directly).
- `npm run typecheck`, `npm test` and `npm run build` are green at every milestone.
- `docs/QA.md` is a checklist that you tick yourself: 375 px mobile, keyboard hunt, no-key mode, rate-limit message, upstream failure (simulate it), slow-network loading states, Classroom on a 1920 px screen.
- No console noise in production. No TODO comments. No dead UI.

---

## 16. Milestones (commit and push after each)

- M0 Scaffold (about 30 min): create-next-app non-interactively (TypeScript, Tailwind, ESLint, App Router, src dir, alias `@/*`, npm). If it refuses because the folder is not empty (it contains `.git` and `docs/`), scaffold into a temp folder and move the files up without touching `.git` and `docs/`. Add vitest, zod, sharp, @google/genai, tsx. Env handling, design tokens, base layout, CLAUDE.md, .env.example, docs/DECISIONS.md, README skeleton. Check `git remote -v`; if there is no remote, tell the human (section 18).
- M1 Core logic (about 90 min): cv, forensics and game modules with tests.
- M2 AI layer (about 60 min): providers, schemas, prompts, routes, rate limiting, smoke script. Run the smoke test with the mock, then with the real key. Ask for the key only now if `.env.local` lacks it, and continue with the mock meanwhile.
- M3 Forge UI end to end: upload, timeline with redaction, hunt, reveal with slider, heatmap, lenses and log. Commit in slices.
- M4 Deck: seed script, Daily Dojo, Classroom, landing hero from the deck. Ask for photos if `seed/photos` is empty and keep working meanwhile.
- M5 Progression, profile, How it works, polish, accessibility, responsive checks, error states.
- M6 Docs and release: README.md, DEVPOST.md, DEMO_SCRIPT.md, PITCH_QA.md, QA pass, final build, push.

Target: M0 to M3 within the first 6 hours of work.

---

## 17. Documents to write

README.md:
- Title, tagline, a clearly marked line for the live URL and one for the video link (the human fills them in after deploying and uploading; remind him).
- A screenshot at `docs/screenshot.png` (capture one yourself if you can, otherwise remind the human).
- The problem, what it does, how it works (Mermaid diagram of the pipeline), forensic methods, safety and ethics, tech stack, models used, running cost.
- Run locally in one command: `npm install && npm run dev` (mock mode works without a key), how to seed the deck, how to deploy on Vercel step by step.
- Project structure, limitations and what's next (teacher dashboards, C2PA provenance, browser extension, more manipulation types, training a localization model on the generated dataset).
- Credits and licenses (libraries, models, photos by Suhan Nawaz), AI disclosure, "Built during Banana Hacks 2026 (Oct 10 to 11, 2026)".

DEVPOST.md:
- Name, tagline, one-paragraph description (max 80 words).
- Write-up of max 500 words: Inspiration, What it does, How we built it, Challenges, Accomplishments, What we learned, What's next.
- Built-with list and AI disclosure.

DEMO_SCRIPT.md (2:45 total, exact clicks and English voice-over lines):
- 0:00 to 0:15 Hook: two photos, "One of these was edited by AI ten seconds ago. Which one?" Reveal the heatmap.
- 0:15 to 0:35 Problem: anyone can edit any photo in seconds now; media literacy is taught with static examples people memorize; nobody trains with personal, adaptive fakes. Phishing-simulation analogy.
- 0:35 to 1:35 Live forge on Suhan's own photo: upload, agent timeline with redaction (ideally showing one rejected attempt), hunt with one miss, reveal with slider, heatmap, the tell, ELA and noise lenses, un-redacted log.
- 1:35 to 2:00 Adaptive training: profile radar and belt; the next round targets the weak type.
- 2:00 to 2:20 Classroom mode on a big screen: "I lead my school's AI club. We will train with this."
- 2:20 to 2:40 How it works: Gemini 3.8 Flash reads and plans, Nano Banana 2.1 forges, our compositing makes the answer key pixel-exact, the forensics are written from scratch, people are never edited.
- 2:40 to 2:50 Close: "When AI can image everything, train your eye. Fake Dojo."

PITCH_QA.md: crisp answers to at least 10 likely judge questions, including: Isn't this a fake generator? Why not just build a detector? How do you know exactly where the edit is? What does it cost to run? What happens to my photos? How is this more than an API wrapper? Who will use it after the weekend? What was the hardest technical problem? How do you stop misuse? What would you build next?

---

## 18. What only the human can do (ask briefly, keep working meanwhile)

- Put `GEMINI_API_KEY` (billing enabled) into `.env.local`. Never ask him to paste the key into the chat; tell him to edit the file himself.
- Add 15 to 25 of his own photos to `seed/photos/` (scenes without recognizable faces, no readable license plates, nothing that reveals his home address).
- Fix GitHub authentication if a push fails (give him the exact command).
- Deploy on Vercel and set the env vars (the README has the steps).
- Record the demo video and submit on the official portal.

---

## 19. Stretch goals (only after the Definition of Done)

- S1 Copy-move (clone) detection lens via block hashing.
- S2 Share a deck card: `/dojo?card=<id>`.
- S3 Daily streak with a date-seeded daily deck.
- S4 Research add-on aimed at "Best fine-tune": train a tiny forgery-localization model on `dataset/` in `research/` (notebook) and report IoU against an ELA baseline. Only on Sunday and only if everything else is done.
- S5 German UI toggle.

---

## 20. Definition of Done

- Live forge works end to end with a real key; the median forge takes under 45 s.
- Daily Dojo, Classroom and the landing page work with zero API calls from a committed deck of at least 15 cards.
- Hunt scoring is correct; the reveal shows the exact mask; the lenses work on desktop and mobile.
- Guardrails are active: people are never edited, sensitive documents are refused, rate limits and the kill switch work.
- Typecheck, tests and build are green; no secrets in the repo; commits are spread across the hacking window.
- README.md, DEVPOST.md, DEMO_SCRIPT.md and PITCH_QA.md are complete.
