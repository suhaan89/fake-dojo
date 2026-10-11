"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeckNotice } from "@/components/DeckNotice";
import { useDeck } from "@/components/useDeck";
import { useHandVote } from "@/components/useHandVote";
import { Verdict } from "@/components/Verdict";
import { decide, type VoteSide } from "@/lib/vision/votes";
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
  const {
    status: cameraStatus,
    error: cameraError,
    live,
    videoRef,
    start: startCamera,
    stop: stopCamera,
    total: cameraTotal,
    reset: cameraReset,
  } = useHandVote();
  /** The class vote for the current card: a side, null for "no clear vote", undefined without camera. */
  const [vote, setVote] = useState<VoteSide | null | undefined>(undefined);
  const [score, setScore] = useState({ right: 0, voted: 0 });

  const seed = `classroom:${seedParam ?? today}${round ? `#${round}` : ""}`;
  const session = useMemo(
    () => (deckState.state === "ready" ? buildSession(deckState.deck, seedParam === "demo" && !round ? "demo" : seed) : []),
    [deckState, seed, seedParam, round],
  );
  const card = session[index];
  const finished = session.length > 0 && index >= session.length;

  const cameraOn = cameraStatus === "on";
  const answer: VoteSide | null = card ? (card.kind === "forged" ? "edited" : "real") : null;

  const reveal = useCallback(() => {
    if (revealed) return;
    if (cameraOn && answer) {
      const decided = decide(cameraTotal());
      setVote(decided);
      if (decided) setScore((s) => ({ right: s.right + (decided === answer ? 1 : 0), voted: s.voted + 1 }));
    } else {
      setVote(undefined);
    }
    setRevealed(true);
  }, [answer, cameraOn, cameraTotal, revealed]);

  const next = useCallback(() => {
    if (finished || !session.length) return;
    cameraReset();
    setIndex((i) => i + 1);
    setRevealed(false);
  }, [cameraReset, finished, session.length]);

  const restart = useCallback(() => {
    cameraReset();
    setScore({ right: 0, voted: 0 });
    setRound((r) => r + 1);
    setIndex(0);
    setRevealed(false);
  }, [cameraReset]);

  const toggleCamera = useCallback(() => {
    if (cameraStatus === "off" || cameraStatus === "error") void startCamera();
    else stopCamera();
  }, [cameraStatus, startCamera, stopCamera]);

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
    <div ref={rootRef} className="relative flex min-h-dvh flex-col bg-paper text-ink">
      <div
        className={`absolute bottom-3 right-3 z-10 w-[min(26vw,260px)] border-2 border-ink bg-ink ${
          cameraStatus === "on" || cameraStatus === "starting" ? "" : "hidden"
        }`}
      >
        <video ref={videoRef} muted playsInline className="block w-full -scale-x-100" aria-label="Camera preview for hand voting" />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-paper/70" />
        <p className="mono bg-ink px-2 py-1 text-[11px] text-paper">Video stays on this device</p>
      </div>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2 sm:px-6">
        <div className="flex items-center gap-3">
          <span aria-hidden className="inline-block h-3 w-3 bg-edited" />
          <span className="font-semibold tracking-tight">Fake Dojo Classroom</span>
          {session.length && !finished ? (
            <span className="mono text-sm text-ink-soft">
              Card {index + 1} of {session.length}
            </span>
          ) : null}
          {score.voted > 0 ? (
            <span key={score.right} className="bump mono bg-ink px-2 py-1 text-sm font-semibold text-paper">
              Class {score.right} of {score.voted}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono hidden text-xs text-ink-soft lg:inline">Space reveals, Right arrow next, F fullscreen</span>
          <button
            type="button"
            className={`btn ${cameraOn ? "btn-real" : "btn-quiet"}`}
            onClick={toggleCamera}
            aria-pressed={cameraOn}
            disabled={cameraStatus === "starting"}
          >
            {cameraStatus === "starting" ? "Starting camera" : cameraOn ? "Camera vote on" : "Vote by camera"}
          </button>
          <button type="button" className="btn btn-quiet" onClick={toggleFullscreen} aria-pressed={isFullscreen}>
            {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          </button>
          <Link href="/" className="btn btn-quiet">
            Exit
          </Link>
        </div>
      </header>

      {cameraStatus === "error" && cameraError ? (
        <p role="alert" className="border-b border-line bg-card px-4 py-2 text-center text-sm text-edited-ink">
          {cameraError} Voting by show of hands still works.
        </p>
      ) : null}

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
                maxWidth: `calc(60dvh * ${card.width / card.height})`,
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
                <div
                  className={`border-4 border-real px-3 py-4 text-center transition-colors sm:py-6 ${
                    live.real > 0 ? "vote-lit bg-real text-white" : "text-real"
                  }`}
                >
                  <p className="text-[clamp(1.75rem,min(6vw,9dvh),5rem)] font-semibold leading-none tracking-tight">Real</p>
                  <p className={`mt-2 text-[clamp(0.85rem,1.6vw,1.4rem)] ${live.real > 0 ? "text-white" : "text-ink-soft"}`}>
                    {live.real > 0 ? `${live.real} hand${live.real === 1 ? "" : "s"} up` : "Left hand up"}
                  </p>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Countdown
                    key={`${round}-${card.id}`}
                    seconds={VOTE_SECONDS}
                    paused={cameraStatus === "starting"}
                    onDone={reveal}
                  />
                  <button type="button" className="btn" onClick={reveal}>
                    Reveal
                  </button>
                </div>
                <div
                  className={`border-4 border-edited px-3 py-4 text-center transition-colors sm:py-6 ${
                    live.edited > 0 ? "vote-lit bg-edited-ink text-white" : "text-edited-ink"
                  }`}
                >
                  <p className="text-[clamp(1.75rem,min(6vw,9dvh),5rem)] font-semibold leading-none tracking-tight">Edited</p>
                  <p className={`mt-2 text-[clamp(0.85rem,1.6vw,1.4rem)] ${live.edited > 0 ? "text-white" : "text-ink-soft"}`}>
                    {live.edited > 0 ? `${live.edited} hand${live.edited === 1 ? "" : "s"} up` : "Right hand up"}
                  </p>
                </div>
                <p className="sr-only" aria-live="polite">
                  Vote now: real or edited. The answer is revealed after {VOTE_SECONDS} seconds.
                </p>
              </div>
            ) : (
              <div className="rise flex w-full max-w-6xl flex-col items-center gap-3 text-center" aria-live="assertive">
                {vote !== undefined && answer ? (
                  <div className="w-full max-w-3xl text-left">
                    <Verdict
                      compact
                      tone={vote === null ? "info" : vote === answer ? "win" : "lose"}
                      title={
                        vote === null
                          ? "No clear vote."
                          : vote === answer
                            ? `Correct. The class said ${vote === "real" ? "Real" : "Edited"}.`
                            : `Wrong. The class said ${vote === "real" ? "Real" : "Edited"}.`
                      }
                    />
                  </div>
                ) : null}
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
            <p className="text-[clamp(2.25rem,7vw,5.5rem)] font-semibold leading-none tracking-tight">
              {score.voted > 0 ? `The class got ${score.right} of ${score.voted}.` : "That was the deck."}
            </p>
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
