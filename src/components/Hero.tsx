"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useDeck } from "@/components/useDeck";
import { Verdict } from "@/components/Verdict";
import { cardImages, DEMO_SEED, heroForgedOnLeft, pickHeroCard } from "@/lib/game/deck";

/**
 * Landing hero: two versions of one photo from the committed deck, one real and one forged.
 * Clicking answers and reveals the heatmap instantly, without any API call.
 */
export function Hero() {
  const params = useSearchParams();
  const demo = params.get("demo") === "1";
  const deckState = useDeck();
  const [visit] = useState(() => Math.random().toString(36).slice(2));
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<"left" | "right" | null>(null);

  const seed = demo && attempt === 0 ? DEMO_SEED : `${visit}:${attempt}`;
  const card = deckState.state === "ready" ? pickHeroCard(deckState.deck, seed) : null;

  if (deckState.state === "loading") {
    return <section className="mx-auto min-h-[70vh] max-w-6xl px-4 sm:px-6" aria-busy="true" />;
  }

  if (!card) {
    return (
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-12 sm:px-6 sm:pt-20">
        <p className="label">Media literacy training for the age of AI images</p>
        <h1 className="mt-3 max-w-4xl text-[clamp(2.4rem,7vw,5rem)] font-semibold leading-[1.02] tracking-tight">
          Train your eye for AI fakes. On your own photos.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">
          An AI agent hides one realistic edit in a real photo. You hunt for it. Then a forensic reveal shows exactly
          which pixels changed and how you could have caught it.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/forge" className="btn h-14 px-7 text-base">
            Forge your photo
          </Link>
          <Link href="/how-it-works" className="btn btn-quiet h-14 px-7 text-base">
            How it works
          </Link>
        </div>
      </section>
    );
  }

  const images = cardImages(card);
  const forgedLeft = heroForgedOnLeft(seed);
  const forgedSide = forgedLeft ? "left" : "right";
  const correct = picked === forgedSide;
  const sides = [
    { side: "left" as const, forged: forgedLeft },
    { side: "right" as const, forged: !forgedLeft },
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 sm:pt-10">
      <p className="label">Train your eye for AI fakes. On your own photos.</p>
      <h1 className="mt-3 max-w-5xl text-[clamp(2.1rem,6.2vw,4.5rem)] font-semibold leading-[1.03] tracking-tight">
        One of these photos was edited by AI. Which one?
      </h1>

      <div
        className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4"
        style={{ maxWidth: `max(560px, calc(${(2 * card.width) / card.height} * 66vh))` }}
      >
        {sides.map(({ side, forged }) => {
          const chosen = picked === side;
          return (
            <button
              key={`${card.id}-${side}`}
              type="button"
              disabled={picked !== null}
              onClick={() => setPicked(side)}
              aria-label={`${side === "left" ? "First" : "Second"} photo. Choose this one as the edited photo.`}
              className={`group relative block overflow-hidden border bg-paper-deep text-left ${
                picked === null
                  ? "border-line hover:border-ink"
                  : forged
                    ? "border-edited outline outline-2 outline-edited"
                    : "border-real"
              }`}
              style={{ aspectRatio: `${card.width} / ${card.height}` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={forged ? images.forged! : images.original}
                alt=""
                className="absolute inset-0 h-full w-full"
                fetchPriority="high"
              />
              {picked !== null && forged && images.heat ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={images.heat} alt="" className="fade-in absolute inset-0 h-full w-full" />
              ) : null}
              <span
                className={`label absolute left-2 top-2 px-2 py-1 ${
                  picked === null
                    ? "bg-paper/90 text-ink"
                    : forged
                      ? "bg-edited-ink text-white"
                      : "bg-real text-white"
                }`}
              >
                {picked === null ? (side === "left" ? "Photo A" : "Photo B") : forged ? "Edited by AI" : "Real"}
              </span>
              {chosen ? (
                <span className="label absolute bottom-2 left-2 bg-ink px-2 py-1 text-paper">Your pick</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-5 min-h-[7.5rem]" aria-live="polite">
        {picked === null ? (
          <p className="max-w-2xl text-lg text-ink-soft">Same scene, one difference. Tap the fake.</p>
        ) : (
          <div className="rise">
            <div className="max-w-3xl">
              <Verdict
                compact
                tone={correct ? "win" : "lose"}
                title={correct ? "Right. That is the fake." : "Fooled. The other one is the fake."}
              />
            </div>
            <p className="mt-3 max-w-3xl text-lg leading-snug">{card.tell}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/forge" className="btn">
                Try it on your own photo
              </Link>
              <Link href={demo ? "/dojo?seed=demo" : "/dojo"} className="btn btn-quiet">
                Play the Daily Dojo
              </Link>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  setAttempt((n) => n + 1);
                  setPicked(null);
                }}
              >
                Another pair
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
