import Link from "next/link";
import { Suspense } from "react";
import { Hero } from "@/components/Hero";
import { SiteFooter } from "@/components/SiteFooter";

const MODES = [
  {
    href: "/forge",
    label: "Live",
    title: "Forge your photo",
    text: "An AI hides one edit in your own photo. Two taps to find it.",
    action: "Open Forge",
  },
  {
    href: "/dojo",
    label: "Ten cards",
    title: "Daily Dojo",
    text: "Real or edited? Call it, then find the edit for bonus points.",
    action: "Play the deck",
  },
  {
    href: "/classroom",
    label: "Projector",
    title: "Classroom",
    text: "Projector mode. The class votes by raising hands, and the camera counts them.",
    action: "Start a class round",
  },
];

const STEPS = [
  {
    title: "The agent forges",
    text: "An AI agent plans one small edit, renders it and checks its own work.",
  },
  {
    title: "You hunt",
    text: "You see only the forged photo. Two taps to find the edit.",
  },
  {
    title: "The reveal teaches",
    text: "A pixel-exact heatmap, before and after, and the tell you could have spotted.",
  },
];

export default function Home() {
  return (
    <>
      <Suspense fallback={<div className="mx-auto min-h-[60vh] max-w-6xl px-4 sm:px-6" aria-busy="true" />}>
        <Hero />
      </Suspense>

      <section aria-labelledby="modes" className="border-t border-line">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
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
          <ul className="grid gap-3 text-lg leading-snug">
            <li className="border-l-4 border-ink pl-4">People are never edited.</li>
            <li className="border-l-4 border-ink pl-4">IDs, receipts and chats are refused.</li>
            <li className="border-l-4 border-ink pl-4">Nothing is stored. Forgeries cannot be downloaded.</li>
          </ul>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
