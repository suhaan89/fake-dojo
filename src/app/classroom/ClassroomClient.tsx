"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeckNotice } from "@/components/DeckNotice";
import { useDeck } from "@/components/useDeck";
import { buildSession, cardImages, dailySeed } from "@/lib/game/deck";
import { TYPE_LABELS } from "@/lib/game/types";

const VOTE_SECONDS = 10;

/** Counts down once per mount. Remount with a `key` to restart it. */
function Countdown({ seconds, paused, onDone }: { seconds: number; paused: boolean; onDone: () => void }) {
  const [left, setLeft] = useState(seconds);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);
  useEffect(() => {
    if (paused) return;
    if (left <= 0) {
      done.current();
      return;
    }
    const timer = window.setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left, paused]);
  return (
    <span className="mono text-[clamp(3rem,min(9vw,12dvh),7.5rem)] font-semibold leading-none tabular-nums" aria-hidden>
      {left}
    </span>
  );
}

export function ClassroomClient() {
  const params = useSearchParams();
  const seedParam = params.get("seed");
  const deckState = useDeck();
  const [today] = useState(() => dailySeed());
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const seed = `classroom:${seedParam ?? today}${round ? `#${round}` : ""}`;
  const session = useMemo(
    () => (deckState.state === "ready" ? buildSession(deckState.deck, seedParam === "demo" && !round ? "demo" : seed) : []),
    [deckState, seed, seedParam, round],
  );
  const card = session[index];
  const finished = session.length > 0 && index >= session.length;

  const reveal = useCallback(() => setRevealed(true), []);

  const next = useCallback(() => {
    if (finished || !session.length) return;
    setIndex((i) => i + 1);
    setRevealed(false);
  }, [finished, session.length]);

  const restart = useCallback(() => {
    setRound((r) => r + 1);
    setIndex(0);
    setRevealed(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void root.requestFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      // Space and Enter on a focused button already trigger that button.
      const onControl = target?.closest("button, a, input, select, textarea") !== null;
      if (event.key === " " && !onControl) {
        event.preventDefault();
        if (!revealed) reveal();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (revealed) next();
        else reveal();
      } else if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, reveal, revealed, toggleFullscreen]);

  const images = card ? cardImages(card) : null;
  const edited = card?.kind === "forged";

  return (
    <div ref={rootRef} className="flex min-h-dvh flex-col bg-paper text-ink">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2 sm:px-6">
        <div className="flex items-center gap-3">
          <span aria-hidden className="inline-block h-3 w-3 bg-edited" />
          <span className="font-semibold tracking-tight">Fake Dojo Classroom</span>
          {session.length && !finished ? (
            <span className="mono text-sm text-ink-soft">
              Card {index + 1} of {session.length}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono hidden text-xs text-ink-soft md:inline">Space reveals, Right arrow next, F fullscreen</span>
          <button type="button" className="btn btn-quiet" onClick={toggleFullscreen} aria-pressed={isFullscreen}>
            {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          </button>
          <Link href="/" className="btn btn-quiet">
            Exit
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 py-5 sm:px-8">
        {deckState.state === "loading" ? <DeckNotice kind="loading" /> : null}
        {deckState.state === "error" ? <DeckNotice kind="error" /> : null}
        {deckState.state === "ready" && session.length === 0 ? <DeckNotice kind="empty" /> : null}

        {card && images ? (
          <>
            <div
              className="relative w-full overflow-hidden border border-line bg-paper-deep"
              style={{
                aspectRatio: `${card.width} / ${card.height}`,
                maxWidth: `calc(54dvh * ${card.width / card.height})`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={card.id}
                src={images.shown}
                alt="Training photo. The class decides whether it is real or edited."
                className="absolute inset-0 h-full w-full"
              />
              {revealed && images.heat ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={images.heat} alt="" className="fade-in absolute inset-0 h-full w-full" />
              ) : null}
            </div>

            {!revealed ? (
              <div className="grid w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-8">
                <div className="border-4 border-real px-3 py-4 text-center sm:py-6">
                  <p className="text-[clamp(1.75rem,min(6vw,9dvh),5rem)] font-semibold leading-none tracking-tight text-real">Real</p>
                  <p className="mt-2 text-[clamp(0.85rem,1.6vw,1.4rem)] text-ink-soft">Left hand up</p>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Countdown key={`${round}-${card.id}`} seconds={VOTE_SECONDS} paused={false} onDone={reveal} />
                  <button type="button" className="btn" onClick={reveal}>
                    Reveal
                  </button>
                </div>
                <div className="border-4 border-edited px-3 py-4 text-center sm:py-6">
                  <p className="text-[clamp(1.75rem,min(6vw,9dvh),5rem)] font-semibold leading-none tracking-tight text-edited-ink">Edited</p>
                  <p className="mt-2 text-[clamp(0.85rem,1.6vw,1.4rem)] text-ink-soft">Right hand up</p>
                </div>
                <p className="sr-only" aria-live="polite">
                  Vote now: real or edited. The answer is revealed after {VOTE_SECONDS} seconds.
                </p>
              </div>
            ) : (
              <div className="rise flex w-full max-w-6xl flex-col items-center gap-3 text-center" aria-live="assertive">
                <p
                  className={`text-[clamp(2.5rem,min(9vw,12dvh),7.5rem)] font-semibold leading-none tracking-tight ${
                    edited ? "text-edited-ink" : "text-real"
                  }`}
                >
                  {edited ? "Edited" : "Real"}
                </p>
                {edited && card.type ? (
                  <>
                    <p className="max-w-5xl text-[clamp(1.1rem,min(2.6vw,4dvh),2.4rem)] font-medium leading-snug">{card.tell}</p>
                    <p className="mono text-[clamp(0.8rem,1.3vw,1.15rem)] text-ink-soft">
                      {TYPE_LABELS[card.type]}: {card.target_description}
                    </p>
                  </>
                ) : (
                  <p className="max-w-5xl text-[clamp(1.1rem,min(2.6vw,4dvh),2.4rem)] font-medium leading-snug">
                    Nothing was changed. Not every odd detail is a fake.
                  </p>
                )}
                <button type="button" className="btn mt-1 h-14 px-8 text-lg" onClick={next}>
                  {index + 1 >= session.length ? "Finish" : "Next card"}
                </button>
              </div>
            )}
          </>
        ) : null}

        {finished ? (
          <div className="flex flex-col items-center gap-5 text-center">
            <p className="text-[clamp(2.25rem,7vw,5.5rem)] font-semibold leading-none tracking-tight">That was the deck.</p>
            <p className="max-w-3xl text-[clamp(1.05rem,2.2vw,1.9rem)] leading-snug text-ink-soft">
              Which edits fooled the most hands? Those are the ones to talk about.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" className="btn h-14 px-8 text-lg" onClick={restart}>
                Play another round
              </button>
              <Link href="/forge" className="btn btn-quiet h-14 px-8 text-lg">
                Forge a photo live
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
