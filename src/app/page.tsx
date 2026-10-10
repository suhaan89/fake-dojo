import Link from "next/link";
import { Suspense } from "react";
import { Hero } from "@/components/Hero";
import { SiteFooter } from "@/components/SiteFooter";

const MODES = [
  {
    href: "/forge",
    label: "Live",
    title: "Forge your photo",
    text: "Upload or shoot a photo. An AI agent plans and hides one realistic edit in it. You get two taps to find it.",
    action: "Open Forge",
  },
  {
    href: "/dojo",
    label: "Ten cards",
    title: "Daily Dojo",
    text: "A deck of real and forged photos. Call each one real or edited, then locate the edit for bonus points.",
    action: "Play the deck",
  },
  {
    href: "/classroom",
    label: "Projector",
    title: "Classroom",
    text: "Full screen, big type, a ten second countdown. The class votes by raising hands, then comes the reveal.",
    action: "Start a class round",
  },
];

const STEPS = [
  {
    title: "The agent forges",
    text: "A vision model reads the scene and plans one small edit. An image model carries it out. A verifier checks it and rejects sloppy attempts.",
  },
  {
    title: "You hunt",
    text: "You only see the forged photo. Zoom, pan, use the loupe, then tap where you think the edit is. Two guesses.",
  },
  {
    title: "The reveal teaches",
    text: "A pixel-exact heatmap, a before and after slider, the tell you could have spotted, and forensic lenses such as error level analysis.",
  },
];

export default function Home() {
  return (
    <>
      <Suspense fallback={<div className="mx-auto min-h-[60vh] max-w-6xl px-4 sm:px-6" aria-busy="true" />}>
        <Hero />
      </Suspense>

      <section aria-labelledby="modes" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 id="modes" className="label">
            Three ways to train
          </h2>
          <ul className="mt-5 grid gap-4 md:grid-cols-3">
            {MODES.map((mode) => (
              <li key={mode.href} className="panel flex flex-col p-5">
                <p className="label">{mode.label}</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">{mode.title}</h3>
                <p className="mt-2 flex-1 leading-relaxed text-ink-soft">{mode.text}</p>
                <Link href={mode.href} className="btn mt-5 self-start">
                  {mode.action}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="how" className="border-t border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 id="how" className="label">
            How it works
          </h2>
          <ol className="mt-5 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <p className="mono text-sm text-ink-soft">Step {index + 1}</p>
                <h3 className="mt-1 text-xl font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-soft">{step.text}</p>
              </li>
            ))}
          </ol>
          <Link href="/how-it-works" className="mt-6 inline-flex min-h-[44px] items-center underline underline-offset-4">
            See the full pipeline
          </Link>
        </div>
      </section>

      <section aria-labelledby="ethics" className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 md:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 id="ethics" className="label">
              Why a forgery trainer
            </h2>
            <p className="mt-3 text-2xl font-semibold leading-snug tracking-tight">
              Companies train staff with simulated phishing mails. Nobody trains people with simulated image fakes.
            </p>
          </div>
          <div className="leading-relaxed text-ink-soft">
            <p>
              When AI can image everything, seeing is no longer believing. Fake Dojo turns image AI against itself to
              train the human eye, with fakes made from your own photos so the lesson sticks.
            </p>
            <p className="mt-3">
              The guardrails are strict. People are never edited. IDs, receipts, chat screenshots and other sensitive
              documents are refused. Live forgeries cannot be downloaded, photos are not stored, and location data is
              removed in your browser before anything is sent.
            </p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
