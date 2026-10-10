"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { DeckNotice } from "@/components/DeckNotice";
import { Hunt, type HuntResult } from "@/components/Hunt";
import { ImageStage } from "@/components/ImageStage";
import { Reveal } from "@/components/Reveal";
import { useDeck } from "@/components/useDeck";
import { buildSession, cardImages, dailySeed, type DeckCard } from "@/lib/game/deck";
import { CALL_POINTS, callPoints } from "@/lib/game/scoring";
import { recordRound } from "@/lib/game/store";
import { MANIPULATION_TYPES, TYPE_LABELS, type ManipulationType } from "@/lib/game/types";

type Call = "real" | "edited";

interface CardResult {
  card: DeckCard;
  call: Call;
  callCorrect: boolean;
  /** Null when the card was real or the player never hunted. */
  located: boolean | null;
  points: number;
}

type Stage =
  | { name: "call" }
  | { name: "hunt" }
  | { name: "reveal"; hunt: HuntResult | null; call: Call }
  | { name: "real"; call: Call };

function summarize(results: readonly CardResult[]) {
  const perType = new Map<ManipulationType, { seen: number; caught: number; located: number }>();
  for (const result of results) {
    const type = result.card.type;
    if (!type) continue;
    const row = perType.get(type) ?? { seen: 0, caught: 0, located: 0 };
    row.seen++;
    if (result.callCorrect) row.caught++;
    if (result.located) row.located++;
    perType.set(type, row);
  }
  let weakest: ManipulationType | null = null;
  let lowest = Infinity;
  for (const type of MANIPULATION_TYPES) {
    const row = perType.get(type);
    if (!row) continue;
    // Locating counts double: spotting that something is off is easier than finding it.
    const rate = (row.caught + 2 * row.located) / (3 * row.seen);
    if (rate < lowest) {
      lowest = rate;
      weakest = type;
    }
  }
  const realCards = results.filter((r) => r.card.kind === "real");
  return {
    perType,
    weakest: lowest < 1 ? weakest : null,
    score: results.reduce((sum, r) => sum + r.points, 0),
    callsCorrect: results.filter((r) => r.callCorrect).length,
    realCorrect: realCards.filter((r) => r.callCorrect).length,
    realSeen: realCards.length,
  };
}

export function DojoClient() {
  const params = useSearchParams();
  const seedParam = params.get("seed");
  const deckState = useDeck();
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>({ name: "call" });
  const [results, setResults] = useState<CardResult[]>([]);
  const topRef = useRef<HTMLDivElement>(null);

  const [today] = useState(() => dailySeed());
  // The first session of the day is the same for everyone; later ones get their own order.
  const seed = round === 0 ? (seedParam ?? today) : `${seedParam ?? today}#${round}`;
  const session = useMemo(
    () => (deckState.state === "ready" ? buildSession(deckState.deck, seed) : []),
    [deckState, seed],
  );

  const card = session[index] as DeckCard | undefined;
  const finished = session.length > 0 && index >= session.length;
  const scrollTop = () => topRef.current?.scrollIntoView({ block: "start" });

  const finishCard = (target: DeckCard, call: Call, hunt: HuntResult | null) => {
    const forged = target.kind === "forged";
    const callCorrect = forged ? call === "edited" : call === "real";
    const located = forged && hunt ? hunt.hitOnGuess !== null : forged ? false : null;
    const points = callPoints(callCorrect) + (hunt?.points ?? 0);
    setResults((list) => [...list, { card: target, call, callCorrect, located, points }]);
    recordRound({
      at: Date.now(),
      mode: "dojo",
      type: target.type,
      difficulty: target.difficulty ?? 1,
      hit: forged ? located === true : callCorrect,
      points,
      guesses: hunt?.guesses ?? 0,
      hints: hunt?.hints ?? 0,
      labUses: hunt?.labUses ?? 0,
    });
  };

  const onCall = (call: Call) => {
    if (!card) return;
    if (card.kind === "real") {
      finishCard(card, call, null);
      setStage({ name: "real", call });
    } else if (call === "edited") {
      setStage({ name: "hunt" });
    } else {
      finishCard(card, call, null);
      setStage({ name: "reveal", hunt: null, call });
    }
    scrollTop();
  };

  const next = () => {
    setIndex((i) => i + 1);
    setStage({ name: "call" });
    scrollTop();
  };

  const restart = () => {
    setRound((r) => r + 1);
    setIndex(0);
    setResults([]);
    setStage({ name: "call" });
    scrollTop();
  };

  const running = results.reduce((sum, r) => sum + r.points, 0);
  const images = card ? cardImages(card) : null;
  const last = index + 1 >= session.length;

  return (
    <div ref={topRef} className="mx-auto max-w-6xl scroll-mt-4 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Daily Dojo</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            {finished ? "Session complete" : "Real or edited?"}
          </h1>
        </div>
        {session.length > 0 && !finished ? (
          <p className="mono text-sm text-ink-soft" aria-live="polite">
            Card {index + 1} of {session.length}, {running} points
          </p>
        ) : null}
      </div>

      <div className="mt-8">
        {deckState.state === "loading" ? <DeckNotice kind="loading" /> : null}
        {deckState.state === "error" ? <DeckNotice kind="error" /> : null}
        {deckState.state === "ready" && session.length === 0 ? <DeckNotice kind="empty" /> : null}

        {card && images && stage.name === "call" ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <ImageStage
              key={card.id}
              src={images.shown}
              width={card.width}
              height={card.height}
              alt="Training photo. It is either untouched or has one AI edit."
              loupe
            />
            <div className="flex flex-col gap-4">
              <div className="panel p-4">
                <p className="label">Your call</p>
                <p className="mt-2 text-lg font-medium leading-snug">
                  Is this photo untouched, or did an AI change one thing in it?
                </p>
                <p className="mt-2 text-sm text-ink-soft">
                  A correct call is worth {CALL_POINTS} points. If it is edited, you can then locate the edit for more.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" className="btn btn-real h-14 text-base" onClick={() => onCall("real")}>
                    Real
                  </button>
                  <button type="button" className="btn btn-edited h-14 text-base" onClick={() => onCall("edited")}>
                    Edited
                  </button>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-ink-soft">
                Zoom in, pan around, hover or press and hold for the loupe. Take your time: about three in ten photos
                are untouched.
              </p>
            </div>
          </div>
        ) : null}

        {card && images && stage.name === "hunt" && images.mask ? (
          <div className="flex flex-col gap-4">
            <p className="border-l-4 border-real bg-card px-4 py-3 text-lg font-medium" aria-live="polite">
              Correct, it was edited. {CALL_POINTS} points. Now find the edit.
            </p>
            <Hunt
              key={card.id}
              imageUrl={images.shown}
              maskUrl={images.mask}
              width={card.width}
              height={card.height}
              difficulty={card.difficulty ?? 1}
              hint={card.hint}
              onDone={(hunt) => {
                finishCard(card, "edited", hunt);
                setStage({ name: "reveal", hunt, call: "edited" });
                scrollTop();
              }}
            />
          </div>
        ) : null}

        {card && images && stage.name === "reveal" && images.forged && images.heat && card.changeBox && card.type ? (
          <Reveal
            key={card.id}
            originalUrl={images.original}
            forgedUrl={images.forged}
            heatUrl={images.heat}
            width={card.width}
            height={card.height}
            changeBox={card.changeBox}
            hunt={stage.hunt}
            bonusPoints={stage.call === "edited" ? CALL_POINTS : 0}
            headline={stage.call === "real" ? "This one was edited. It got past you." : undefined}
            facts={{
              type: card.type,
              difficulty: card.difficulty ?? 1,
              targetDescription: card.target_description,
              description: card.description,
              tell: card.tell,
              changedPct: card.stats?.changedPct ?? null,
              plausibility: card.verify?.plausibility ?? null,
              obviousness: card.verify?.obviousness ?? null,
            }}
          >
            <button type="button" className="btn h-14 text-base" onClick={next}>
              {last ? "See your results" : "Next card"}
            </button>
          </Reveal>
        ) : null}

        {card && images && stage.name === "real" ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <ImageStage key={card.id} src={images.original} width={card.width} height={card.height} alt="Untouched photo" />
            <div className="flex flex-col gap-4">
              <div
                className={`rise border-l-4 bg-card px-4 py-4 ${stage.call === "real" ? "border-real" : "border-edited"}`}
                aria-live="polite"
              >
                <p className="text-2xl font-semibold tracking-tight">
                  {stage.call === "real" ? "Correct. This photo is untouched." : "This one was real."}
                </p>
                <p className="mono mt-1.5 text-sm text-ink-soft">{callPoints(stage.call === "real")} points</p>
              </div>
              <p className="leading-relaxed text-ink-soft">
                {stage.call === "real"
                  ? "Nothing was changed here. Trusting a real photo is half of the skill."
                  : "Nothing was changed here. Once you expect fakes, real photos start to look suspicious too. Odd details are normal in real scenes."}
              </p>
              <button type="button" className="btn h-14 text-base" onClick={next}>
                {last ? "See your results" : "Next card"}
              </button>
            </div>
          </div>
        ) : null}

        {finished ? <Summary results={results} onRestart={restart} /> : null}
      </div>
    </div>
  );
}

function Summary({ results, onRestart }: { results: readonly CardResult[]; onRestart: () => void }) {
  const summary = summarize(results);
  const types = MANIPULATION_TYPES.filter((type) => summary.perType.has(type));
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="panel self-start">
        <div className="border-b border-line px-5 py-5">
          <p className="label">Score</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight">{summary.score} points</p>
          <p className="mono mt-2 text-sm text-ink-soft">
            {summary.callsCorrect} of {results.length} calls correct
            {summary.realSeen ? `, ${summary.realCorrect} of ${summary.realSeen} real photos trusted` : ""}
          </p>
        </div>
        {types.length ? (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Accuracy per manipulation type</caption>
            <thead>
              <tr className="label border-b border-line">
                <th scope="col" className="px-5 py-3 font-normal">Type</th>
                <th scope="col" className="px-3 py-3 text-right font-normal">Spotted</th>
                <th scope="col" className="px-5 py-3 text-right font-normal">Located</th>
              </tr>
            </thead>
            <tbody className="mono">
              {types.map((type) => {
                const row = summary.perType.get(type)!;
                return (
                  <tr key={type} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-5 py-3 font-sans font-normal">{TYPE_LABELS[type]}</th>
                    <td className="px-3 py-3 text-right">{row.caught} of {row.seen}</td>
                    <td className="px-5 py-3 text-right">{row.located} of {row.seen}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
      <div className="flex flex-col gap-4">
        <div className="panel p-4">
          <p className="label">Weakest type</p>
          {summary.weakest ? (
            <>
              <p className="mt-2 text-xl font-semibold tracking-tight">{TYPE_LABELS[summary.weakest]}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                This is where edits got past you most often. Forge mode can build fresh examples of exactly this type on
                your own photos.
              </p>
              <Link href={`/forge?type=${summary.weakest}`} className="btn mt-4 w-full">
                Train this in Forge
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 leading-relaxed">
                No weak spot in this session. Forge mode raises the difficulty until you find one.
              </p>
              <Link href="/forge" className="btn mt-4 w-full">
                Open Forge
              </Link>
            </>
          )}
        </div>
        <button type="button" className="btn btn-quiet" onClick={onRestart}>
          Play another session
        </button>
        <Link href="/profile" className="btn btn-quiet">
          See your profile
        </Link>
      </div>
    </div>
  );
}
