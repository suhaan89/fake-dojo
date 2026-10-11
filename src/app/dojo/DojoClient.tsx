"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { DeckNotice } from "@/components/DeckNotice";
import { Hunt, type HuntResult } from "@/components/Hunt";
import { ImageStage } from "@/components/ImageStage";
import { Reveal } from "@/components/Reveal";
import { useDeck } from "@/components/useDeck";
import { Confetti, CountUp, Verdict } from "@/components/Verdict";
import { buildSession, cardImages, dailySeed, deckForLevel, type DeckCard, type DeckLevel } from "@/lib/game/deck";
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
  const levelParam = params.get("level");
  const deckState = useDeck();
  const [level, setLevel] = useState<DeckLevel | null>(
    levelParam === "easy" || levelParam === "hard" ? levelParam : null,
  );
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>({ name: "call" });
  const [results, setResults] = useState<CardResult[]>([]);
  const topRef = useRef<HTMLDivElement>(null);

  const [today] = useState(() => dailySeed());
  // The first session of the day is the same for everyone; later ones get their own order.
  const seed = round === 0 ? (seedParam ?? today) : `${seedParam ?? today}#${round}`;
  const session = useMemo(
    () =>
      deckState.state === "ready" && level ? buildSession(deckForLevel(deckState.deck, level), `${seed}:${level}`) : [],
    [deckState, seed, level],
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

  const changeLevel = () => {
    setLevel(null);
    setIndex(0);
    setResults([]);
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

  // During the hunt the points for the correct call are already won.
  const running = results.reduce((sum, r) => sum + r.points, 0) + (stage.name === "hunt" ? CALL_POINTS : 0);
  const images = card ? cardImages(card) : null;
  const last = index + 1 >= session.length;

  return (
    <div
      ref={topRef}
      className="mx-auto max-w-7xl scroll-mt-4 px-4 pb-8 sm:px-6"
      style={{ "--stage-top": "58px" } as React.CSSProperties}
    >
      <div className="sticky top-0 z-20 flex min-h-[50px] flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-paper py-1.5">
        <h1 className="text-xl font-semibold leading-tight tracking-tight">
          <span className="label mr-3 align-middle">Daily Dojo{level ? `, ${level}` : ""}</span>
          {!level ? "Choose your level" : finished ? "Session complete" : "Real or edited?"}
        </h1>
        {session.length > 0 && !finished ? (
          <div className="flex items-center gap-4" aria-live="polite">
            <ol className="flex gap-1" aria-label={`Card ${index + 1} of ${session.length}`}>
              {session.map((entry, i) => {
                const result = results[i];
                return (
                  <li
                    key={entry.id}
                    className={`h-6 w-3.5 border border-ink ${
                      result ? (result.callCorrect ? "bg-real" : "bg-edited") : i === index ? "bg-ink" : "bg-transparent"
                    }`}
                  />
                );
              })}
            </ol>
            <p className="text-right leading-none">
              <span key={running} className="bump mono inline-block text-3xl font-semibold">
                {running}
              </span>
              <span className="label ml-2">points</span>
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        {deckState.state === "loading" ? <DeckNotice kind="loading" /> : null}
        {deckState.state === "error" ? <DeckNotice kind="error" /> : null}
        {deckState.state === "ready" && level && session.length === 0 ? <DeckNotice kind="empty" /> : null}

        {deckState.state === "ready" && !level ? (
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                { id: "easy", title: "Easy", text: "Bold edits. A color changed, an object gone.", cls: "btn-real" },
                { id: "hard", title: "Hard", text: "Subtle edits. Small signs, shadows, details.", cls: "btn-edited" },
              ] as const
            ).map((mode) => {
              const count = deckForLevel(deckState.deck, mode.id).cards.filter((c) => c.kind === "forged").length;
              return (
                <button
                  key={mode.id}
                  type="button"
                  disabled={count === 0}
                  onClick={() => {
                    setLevel(mode.id);
                    setIndex(0);
                    setResults([]);
                    setStage({ name: "call" });
                  }}
                  className="panel flex flex-col items-start gap-3 p-6 text-left hover:border-ink disabled:opacity-45 sm:p-8"
                >
                  <span className="text-[clamp(2.5rem,7vw,4.5rem)] font-semibold leading-none tracking-tight">{mode.title}</span>
                  <span className="text-lg text-ink-soft">{mode.text}</span>
                  <span className="mono text-sm text-ink-soft">{count} forged cards in the deck</span>
                  <span className={`btn ${mode.cls} mt-2 h-12 px-6 text-base`}>Play {mode.title.toLowerCase()}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {card && images && stage.name === "call" ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <ImageStage
              key={card.id}
              src={images.shown}
              width={card.width}
              height={card.height}
              alt="Training photo. It is either untouched or has one AI edit."
              loupe
              fill
            />
            <div className="flex flex-col gap-4">
              <div className="panel p-4">
                <p className="label">Your call</p>
                <p className="mt-2 text-lg font-medium leading-snug">Untouched, or did AI change one thing?</p>
                <p className="mono mt-2 text-sm text-ink-soft">{CALL_POINTS} points for the right call</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" className="btn btn-real h-14 text-base" onClick={() => onCall("real")}>
                    Real
                  </button>
                  <button type="button" className="btn btn-edited h-14 text-base" onClick={() => onCall("edited")}>
                    Edited
                  </button>
                </div>
              </div>
              <p className="text-sm text-ink-soft">Zoom, pan, hover for the loupe. About 3 in 10 photos are untouched.</p>
            </div>
          </div>
        ) : null}

        {card && images && stage.name === "hunt" && images.mask ? (
          <div className="flex flex-col gap-4">
            <Hunt
              key={card.id}
              banner={<Verdict compact tone="win" title="Correct. Edited." points={CALL_POINTS} detail="Now find the edit." />}
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
            headline={stage.call === "real" ? "Edited. It got past you." : undefined}
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
          <div className="flex flex-col gap-6">
            <Verdict
              tone={stage.call === "real" ? "win" : "lose"}
              title={stage.call === "real" ? "Correct. Untouched." : "This one was real."}
              points={callPoints(stage.call === "real")}
              detail={
                stage.call === "real"
                  ? "Trusting a real photo is half of the skill."
                  : "Once you expect fakes, real photos look suspicious too."
              }
            />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <ImageStage key={card.id} src={images.original} width={card.width} height={card.height} alt="Untouched photo" />
            <div className="flex flex-col gap-4">
              <button type="button" className="btn h-14 text-base" onClick={next}>
                {last ? "See your results" : "Next card"}
              </button>
            </div>
            </div>
          </div>
        ) : null}

        {finished ? <Summary results={results} onRestart={restart} onChangeLevel={changeLevel} /> : null}
      </div>
    </div>
  );
}

function Summary({
  results,
  onRestart,
  onChangeLevel,
}: {
  results: readonly CardResult[];
  onRestart: () => void;
  onChangeLevel: () => void;
}) {
  const summary = summarize(results);
  const types = MANIPULATION_TYPES.filter((type) => summary.perType.has(type));
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="panel self-start">
        <div className="verdict relative border-b border-line bg-ink px-5 py-7 text-paper">
          {summary.callsCorrect * 2 >= results.length ? <Confetti count={40} /> : null}
          <p className="label text-paper/70">Session score</p>
          <p className="verdict-points mt-1 text-[clamp(3.5rem,10vw,7rem)] font-semibold leading-none tracking-tight">
            <CountUp value={summary.score} />
          </p>
          <p className="mono mt-3 text-sm text-paper/80">
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
              <p className="mt-1 text-sm text-ink-soft">Edits of this type got past you most often.</p>
              <Link href={`/forge?type=${summary.weakest}`} className="btn mt-4 w-full">
                Train this in Forge
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 leading-relaxed">No weak spot in this session.</p>
              <Link href="/forge" className="btn mt-4 w-full">
                Open Forge
              </Link>
            </>
          )}
        </div>
        <button type="button" className="btn btn-quiet" onClick={onRestart}>
          Play another session
        </button>
        <button type="button" className="btn btn-quiet" onClick={onChangeLevel}>
          Change level
        </button>
        <Link href="/profile" className="btn btn-quiet">
          See your profile
        </Link>
      </div>
    </div>
  );
}
