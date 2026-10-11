import type { Metadata } from "next";
import Link from "next/link";
import { GITHUB_URL, SiteFooter } from "@/components/SiteFooter";
import { ELA_CAPTION } from "@/lib/forensics/ela";
import { FORENSICS_DISCLAIMER } from "@/lib/forensics";
import { NOISE_CAPTION } from "@/lib/forensics/noise";
import { SOBEL_CAPTION } from "@/lib/forensics/sobel";
import { IMAGE_COST_USD } from "@/lib/forge/types";
import { AREA_RANGES } from "@/lib/game/difficulty";
import { TELLS } from "@/lib/game/tells";
import { MANIPULATION_TYPES, TYPE_LABELS } from "@/lib/game/types";
import { readEnv } from "@/lib/server/env";

export const metadata: Metadata = {
  title: "How it works",
  description: "The forge pipeline, the forensic lenses, the guardrails and the credits.",
};

interface Stage {
  step: string;
  who: string;
  title: string;
  text: string;
  ours: boolean;
}

function Arrow() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      aria-hidden
      className="my-1 shrink-0 rotate-90 self-center lg:mx-1 lg:my-0 lg:rotate-0"
    >
      <path d="M3 14h20M16 7l7 7-7 7" fill="none" stroke="#121212" strokeWidth="1.6" />
    </svg>
  );
}

function Diagram({ stages }: { stages: Stage[] }) {
  return (
    <ol className="grid lg:grid-cols-4 lg:gap-y-5">
      {stages.map((stage, index) => (
        <li key={stage.step} className="flex flex-col lg:flex-row">
          <div className={`flex-1 border border-ink p-4 ${stage.ours ? "bg-card" : "bg-ink text-paper"}`}>
            <p className={`mono text-[11px] uppercase tracking-wider ${stage.ours ? "text-ink-soft" : "text-paper/70"}`}>
              Step {stage.step}, {stage.who}
            </p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight">{stage.title}</h3>
            <p className={`mt-1.5 text-sm leading-relaxed ${stage.ours ? "text-ink-soft" : "text-paper/85"}`}>{stage.text}</p>
          </div>
          {index < stages.length - 1 ? <Arrow /> : null}
        </li>
      ))}
    </ol>
  );
}

function Section({ id, label, title, children }: { id: string; label: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <p className="label">{label}</p>
        <h2 id={id} className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

export default function HowItWorksPage() {
  const env = readEnv();

  const stages: Stage[] = [
    {
      step: "1",
      who: "Browser",
      title: "Prepare",
      text: "Apply orientation, center-crop to a supported aspect ratio, resize to 1024 px, re-encode. EXIF and GPS are gone before upload.",
      ours: true,
    },
    {
      step: "2",
      who: "Vision model",
      title: "Read and plan",
      text: "Describes the scene, lists objects and people, and proposes three candidate edits with region, instruction, tell and hint.",
      ours: false,
    },
    {
      step: "3",
      who: "Server",
      title: "Validate",
      text: "Region size must fit the difficulty, stay clear of every person and have a sane outline. Otherwise the plan is rejected and planned again.",
      ours: true,
    },
    {
      step: "4",
      who: "Image model",
      title: "Forge",
      text: "Edits the full photo following one precise instruction. It tends to drift slightly in framing and color everywhere.",
      ours: false,
    },
    {
      step: "5",
      who: "Server",
      title: "Composite",
      text: "Register by shift search, match tone from a ring around the region, blend through a feathered mask. Only the planned region changes.",
      ours: true,
    },
    {
      step: "6",
      who: "Server",
      title: "Measure",
      text: "Diff the result against the original: blur, threshold, morphological opening. That mask is the answer key and the heatmap.",
      ours: true,
    },
    {
      step: "7",
      who: "Vision model",
      title: "Verify",
      text: "Compares original and forgery: applied, on target, artifacts, people untouched, plausibility. A rejection triggers a retry.",
      ours: false,
    },
  ];

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <p className="label">How it works</p>
        <h1 className="mt-1 max-w-4xl text-3xl font-semibold tracking-tight sm:text-5xl">
          An agent that forges, a compositor that keeps it honest.
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-soft">
          Image AI is the whole product: vision models read, plan and verify, an image model forges, and computer vision
          written for this project measures exactly what changed. Dark boxes are model calls, light boxes are our own
          code.
        </p>
        <div className="mt-8">
          <Diagram stages={stages} />
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-soft">
          The loop is self-correcting. If no visible change comes back, if the framing cannot be registered, or if the
          verifier sees a flaw, the attempt is rejected and the agent retries with a stricter instruction or moves to
          the next candidate. At most three image calls are spent per forge, and every rejection is shown in the agent
          log.
        </p>
      </div>

      <Section id="exact" label="The answer key" title="Why the heatmap is exact, not estimated">
        <div className="grid gap-6 md:grid-cols-2">
          <p className="leading-relaxed">
            Image models repaint the whole picture, so a plain difference between input and output lights up everywhere.
            Fake Dojo never shows the raw model output. It takes only the planned region from it and blends that into
            your untouched original with a feathered mask. Every pixel outside the mask is your original pixel, bit for
            bit, until the final save.
          </p>
          <p className="leading-relaxed">
            Because we did the compositing ourselves, the difference between the original and the forgery is the ground
            truth. That mask scores your taps, draws the red heatmap, and as a by-product labels every deck card for a
            forgery-localization dataset (image, mask, type, difficulty).
          </p>
        </div>
        <dl className="mono mt-6 grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
          <div className="flex justify-between border-b border-line py-1.5"><dt>Alignment search</dt><dd>shifts of up to 8 px, coarse then fine</dd></div>
          <div className="flex justify-between border-b border-line py-1.5"><dt>Alignment trigger</dt><dd>ring difference above 12 of 255</dd></div>
          <div className="flex justify-between border-b border-line py-1.5"><dt>Tone matching</dt><dd>per channel mean and deviation, 24 px ring</dd></div>
          <div className="flex justify-between border-b border-line py-1.5"><dt>Mask</dt><dd>dilated 12 px or 3%, Gaussian feather</dd></div>
          <div className="flex justify-between border-b border-line py-1.5"><dt>Change threshold</dt><dd>luma difference of 10 of 255</dd></div>
          <div className="flex justify-between border-b border-line py-1.5"><dt>Edit not applied</dt><dd>below 0.1% changed pixels</dd></div>
        </dl>
      </Section>

      <Section id="difficulty" label="Adaptive training" title="Five difficulty levels, six manipulation types">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Edit size and trace handling per difficulty</caption>
              <thead>
                <tr className="label border-b border-line">
                  <th scope="col" className="py-2 font-normal">Level</th>
                  <th scope="col" className="py-2 font-normal">Region size</th>
                  <th scope="col" className="py-2 font-normal">Traces</th>
                </tr>
              </thead>
              <tbody className="mono text-[13px]">
                {([1, 2, 3, 4, 5] as const).map((level) => (
                  <tr key={level} className="border-b border-line">
                    <th scope="row" className="py-2 font-normal">{level}</th>
                    <td className="py-2">
                      up to {AREA_RANGES[level][1]}%
                    </td>
                    <td className="py-2">
                      {level <= 2 ? "left in, JPEG 95" : level === 3 ? "weakened, JPEG 90" : "hidden, noise and JPEG 85"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">
              Two hits in a row raise the level, a miss lowers it. Per type we keep hits and misses and use the mean of a
              Beta distribution as skill. One minus that mean, normalized, becomes the weight the planner receives, so
              the next forgery leans toward what you miss most. Points: 100 times the level on the first guess, 60 times
              on the second, minus 30 for the hint and 20 per lab tool.
            </p>
          </div>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {MANIPULATION_TYPES.map((type) => (
              <div key={type}>
                <dt className="font-semibold">{TYPE_LABELS[type]}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-ink-soft">{TELLS[type]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Section id="forensics" label="Forensic lenses" title="Three classic methods, written from scratch">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              name: "Error level analysis",
              how: "Re-save the image as JPEG at quality 90, subtract, amplify the difference 20 times.",
              caption: ELA_CAPTION,
            },
            {
              name: "Noise residual",
              how: "Luma minus its 3 by 3 median, then the standard deviation over 8 by 8 blocks, shown on a color ramp.",
              caption: NOISE_CAPTION,
            },
            {
              name: "Edges",
              how: "Sobel gradient magnitude of the luma channel.",
              caption: SOBEL_CAPTION,
            },
          ].map((lens) => (
            <div key={lens.name} className="panel p-5">
              <h3 className="text-lg font-semibold tracking-tight">{lens.name}</h3>
              <p className="mono mt-2 text-[13px] leading-relaxed">{lens.how}</p>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{lens.caption}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 max-w-3xl leading-relaxed">
          <span className="font-semibold">{FORENSICS_DISCLAIMER}</span>{" "}
          <span className="text-ink-soft">
            The lenses run on plain pixel arrays in a Web Worker in your browser, with no library. At difficulty 4 and 5
            the forger adds noise and re-compresses the whole image, and you can watch the same lenses go quiet. That is
            the lesson: tools help, but a trained eye and a habit of doubt matter more.
          </span>
        </p>
      </Section>

      <Section id="safety" label="Safety and privacy" title="Guardrails that are enforced in code">
        <ul className="grid gap-x-10 gap-y-5 md:grid-cols-2">
          {[
            ["People are never edited", "The planner is told so, the server rejects any region within 5% of the image width of a detected person, and the verifier discards any result in which a person changed."],
            ["Sensitive documents are refused", "IDs, receipts, chat screenshots, news articles, medical and legal documents, and photos that are mostly a person are turned away before any edit is made."],
            ["Nothing is stored", "Photos exist in memory for the length of a request. Server logs contain a route, a status code and timings, never image data or plan text."],
            ["Location data never leaves your device", "The browser re-encodes your photo through a canvas before upload, which removes EXIF data including GPS coordinates."],
            ["No download of live forgeries", "The app has no save or share button for forged images, and a forgery is gone when you leave the page."],
            ["The API is not an open image editor", "Edits can only be rendered with a signed ticket that binds the request to the photo and to the instructions the server itself validated."],
            ...(env.imageProvider === "gemini"
              ? [["Watermarked at the source", "Images produced by the Gemini image model carry an invisible SynthID watermark."]]
              : []),
            ["Spending is capped", "Live forging is limited per address and per day, and one switch turns it off. The deck modes keep working without any model."],
          ].map(([title, text]) => (
            <li key={title}>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 max-w-3xl leading-relaxed">
          Is a forgery trainer a good idea at all? We think so, for the same reason companies send simulated phishing
          mails: people learn to resist a trick by meeting it in a safe place. The edits here are small, harmless and
          confined to scenes, and the product only exists to show you the answer afterwards.
        </p>
      </Section>

      <Section id="credits" label="Models and credits" title="What runs under the hood">
        <div className="grid gap-8 md:grid-cols-2">
          <dl className="mono text-[13px]">
            <div className="flex justify-between gap-4 border-b border-line py-2"><dt className="text-ink-soft">Vision, planning, verification</dt><dd>{env.visionModel}</dd></div>
            <div className="flex justify-between gap-4 border-b border-line py-2"><dt className="text-ink-soft">Image editing</dt><dd>{env.imageModel}</dd></div>
            <div className="flex justify-between gap-4 border-b border-line py-2"><dt className="text-ink-soft">APIs</dt><dd>{[
              env.visionProvider === "gemini" || env.imageProvider === "gemini" ? "Gemini Interactions" : null,
              env.visionProvider === "ark" || env.imageProvider === "seedream" ? "BytePlus ModelArk" : null,
            ].filter(Boolean).join(", ")}</dd></div>
            <div className="flex justify-between gap-4 border-b border-line py-2"><dt className="text-ink-soft">Cost per image call</dt><dd>{env.imageProvider === "seedream" ? "free quota, then per image" : `about ${IMAGE_COST_USD} USD`}</dd></div>
            <div className="flex justify-between gap-4 border-b border-line py-2"><dt className="text-ink-soft">Image calls per forge</dt><dd>1 to 3</dd></div>
          </dl>
          <div className="text-sm leading-relaxed text-ink-soft">
            <p>
              Built with Next.js, React, TypeScript, Tailwind CSS, the Google Gen AI SDK, MediaPipe Hand Landmarker, zod, sharp and Vitest. Type set
              in Geist Sans and Geist Mono. Deck photos by Suhan Nawaz and, for the cards named web, public-domain photos from Wikimedia Commons (listed in the README).
            </p>
            <p className="mt-3">
              AI disclosure: Claude Code wrote most of the code under Suhan&apos;s direction. Gemini models run at
              runtime. Built during Banana Hacks 2026, October 10 to 11, 2026.
            </p>
            <p className="mt-3">
              <a href={GITHUB_URL} className="inline-flex min-h-[44px] items-center text-ink underline underline-offset-4" rel="noreferrer">
                Read the source on GitHub
              </a>
            </p>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/forge" className="btn">
            Forge your photo
          </Link>
          <Link href="/dojo" className="btn btn-quiet">
            Play the Daily Dojo
          </Link>
        </div>
      </Section>

      <SiteFooter />
    </>
  );
}
