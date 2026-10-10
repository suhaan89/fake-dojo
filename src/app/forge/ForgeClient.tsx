"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AgentTimeline } from "@/components/AgentTimeline";
import { Hunt, type HuntResult } from "@/components/Hunt";
import { Reveal } from "@/components/Reveal";
import { isLive, StatusPill, useLiveStatus } from "@/components/StatusPill";
import { useToast } from "@/components/Toasts";
import { editSummary } from "@/lib/ai/prompts";
import { failureTitle, httpTransport } from "@/lib/forge/client";
import { ForgeFailure, runForge, type ForgeOutcome, type TimelineEntry } from "@/lib/forge/run";
import { cardImages, loadDeck, type DeckCard } from "@/lib/game/deck";
import { DIFFICULTY_NAMES, toDifficulty } from "@/lib/game/difficulty";
import { weakestType, weaknessWeights } from "@/lib/game/progression";
import { isProfilePersisted, recordRound, useHydrated, useProfile } from "@/lib/game/store";
import { isManipulationType, MANIPULATION_TYPES, TYPE_LABELS, type Difficulty, type ManipulationType } from "@/lib/game/types";
import type { PreparedImage } from "@/lib/image/crop";
import { ACCEPT_ATTRIBUTE, jpegUrl, pngUrl, prepareImage, PrepareError } from "@/lib/image/prepare";

type Phase =
  | { name: "pick" }
  | { name: "forging"; original: PreparedImage }
  | { name: "hunt"; original: PreparedImage; outcome: ForgeOutcome }
  | { name: "reveal"; original: PreparedImage; outcome: ForgeOutcome; hunt: HuntResult; playedAt: Difficulty }
  | { name: "error"; original: PreparedImage | null; failure: ForgeFailure };

/** Weakness weights, optionally tilted toward one type the player asked to train. */
function planWeights(base: Record<ManipulationType, number>, focus: ManipulationType | null) {
  if (!focus) return base;
  const out = {} as Record<ManipulationType, number>;
  for (const type of MANIPULATION_TYPES) out[type] = type === focus ? 0.6 : base[type] * 0.4;
  const total = MANIPULATION_TYPES.reduce((sum, type) => sum + out[type], 0);
  for (const type of MANIPULATION_TYPES) out[type] = out[type] / total;
  return out;
}

function Elapsed({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [running]);
  return <span className="mono">{seconds} s</span>;
}

export function ForgeClient() {
  const params = useSearchParams();
  const focusParam = params.get("type");
  const focus = isManipulationType(focusParam) ? focusParam : null;

  const profile = useProfile();
  const hydrated = useHydrated();
  const live = useLiveStatus();
  const toast = useToast();

  const [phase, setPhase] = useState<Phase>({ name: "pick" });
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [manual, setManual] = useState<Difficulty | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [samples, setSamples] = useState<DeckCard[]>([]);
  const abort = useRef<AbortController | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const difficulty = manual ?? profile.difficulty;
  const canForge = isLive(live);

  useEffect(() => {
    let cancelled = false;
    loadDeck().then(
      (deck) => {
        if (!cancelled) setSamples(deck.cards.slice(0, 6));
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  const start = useCallback(
    async (original: PreparedImage, avoid: string[] = []) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setTimeline([]);
      setPhase({ name: "forging", original });
      topRef.current?.scrollIntoView({ block: "start" });
      try {
        const outcome = await runForge(httpTransport, {
          image: original.data,
          difficulty,
          weights: planWeights(weaknessWeights(profile), focus),
          avoid,
          signal: controller.signal,
          onTimeline: setTimeline,
        });
        if (controller.signal.aborted) return;
        setPhase({ name: "hunt", original, outcome });
      } catch (error) {
        if (controller.signal.aborted) return;
        const failure =
          error instanceof ForgeFailure ? error : new ForgeFailure("UPSTREAM", "Something unexpected went wrong.");
        setPhase({ name: "error", original, failure });
      }
    },
    [difficulty, focus, profile],
  );

  const acceptFile = useCallback(
    async (file: Blob | null | undefined) => {
      if (!file || preparing) return;
      if (!canForge) {
        toast.show("Live forging is resting. Try the Daily Dojo.", "error");
        return;
      }
      setPreparing(true);
      try {
        const prepared = await prepareImage(file);
        await start(prepared);
      } catch (error) {
        toast.show(error instanceof PrepareError ? error.message : "That photo could not be opened.", "error");
      } finally {
        setPreparing(false);
      }
    },
    [canForge, preparing, start, toast],
  );

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    void acceptFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void acceptFile(event.dataTransfer.files?.[0]);
  };

  const forgeSample = async (card: DeckCard) => {
    try {
      const response = await fetch(cardImages(card).original);
      if (!response.ok) throw new Error("sample missing");
      await acceptFile(await response.blob());
    } catch {
      toast.show("That sample could not be loaded.", "error");
    }
  };

  const cancel = () => {
    abort.current?.abort();
    setPhase({ name: "pick" });
  };

  const onHuntDone = (original: PreparedImage, outcome: ForgeOutcome, hunt: HuntResult) => {
    const playedAt = toDifficulty(difficulty);
    recordRound({
      at: Date.now(),
      mode: "forge",
      type: outcome.candidate.type,
      difficulty: playedAt,
      hit: hunt.hitOnGuess !== null,
      points: hunt.points,
      guesses: hunt.guesses,
      hints: hunt.hints,
      labUses: hunt.labUses,
    });
    if (!isProfilePersisted()) {
      toast.show("Your browser blocks storage, so progress lasts only until you close this tab.");
    }
    setManual(null);
    setPhase({ name: "reveal", original, outcome, hunt, playedAt });
    topRef.current?.scrollIntoView({ block: "start" });
  };

  const weakest = weakestType(profile);

  return (
    <div ref={topRef} className="mx-auto max-w-6xl scroll-mt-4 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Forge mode</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            {phase.name === "pick" && "Bring a photo. We will fake it."}
            {phase.name === "forging" && "The forger is at work"}
            {phase.name === "hunt" && "One thing in this photo is fake"}
            {phase.name === "reveal" && "The reveal"}
            {phase.name === "error" && failureTitle(phase.failure)}
          </h1>
        </div>
        <StatusPill live={live} />
      </div>

      {phase.name === "pick" ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`panel flex flex-col items-start gap-5 border-dashed p-6 sm:p-8 ${
                dragging ? "border-ink bg-paper-deep" : ""
              }`}
            >
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Choose a photo of a scene</h2>
                <p className="mt-2 max-w-xl leading-relaxed text-ink-soft">
                  A street, a room, a desk, a shop window. The agent plans one small, realistic edit and you get two
                  taps to find it. Photos with clear objects and some text work best.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <label className={`btn ${!canForge || preparing ? "pointer-events-none opacity-45" : ""}`}>
                  {preparing ? "Preparing..." : "Upload a photo"}
                  <input
                    type="file"
                    accept={ACCEPT_ATTRIBUTE}
                    className="sr-only"
                    onChange={onFileInput}
                    disabled={!canForge || preparing}
                  />
                </label>
                <label className={`btn btn-quiet sm:hidden ${!canForge || preparing ? "pointer-events-none opacity-45" : ""}`}>
                  Take a photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={onFileInput}
                    disabled={!canForge || preparing}
                  />
                </label>
              </div>
              <p className="text-sm leading-relaxed text-ink-soft">
                Your photo is cropped, resized and stripped of EXIF and GPS data in your browser before it is sent.
                Nothing is stored. Fake Dojo edits scenes, never people.
              </p>
            </div>

            {live.state !== "checking" && !canForge ? (
              <div className="mt-4 border-l-4 border-edited bg-card px-4 py-4">
                <p className="font-medium">Live forging is resting right now.</p>
                <p className="mt-1 text-ink-soft">
                  {live.state === "ready" && live.health.reason ? `${live.health.reason} ` : ""}
                  The Daily Dojo runs on pre-forged cards and needs no live model.
                </p>
                <Link href="/dojo" className="btn mt-3">
                  Play the Daily Dojo
                </Link>
              </div>
            ) : null}

            {samples.length ? (
              <div className="mt-8">
                <h2 className="label">Or forge one of ours</h2>
                <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {samples.map((card) => (
                    <li key={card.id}>
                      <button
                        type="button"
                        onClick={() => void forgeSample(card)}
                        disabled={!canForge || preparing}
                        className="block w-full border border-line hover:border-ink disabled:opacity-45"
                        aria-label={`Forge sample photo: ${card.scene}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={cardImages(card).original}
                          alt=""
                          loading="lazy"
                          className="aspect-square w-full object-cover"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="panel p-4">
              <p className="label">Difficulty</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {difficulty} of 5 <span className="text-base font-normal text-ink-soft">{DIFFICULTY_NAMES[toDifficulty(difficulty)]}</span>
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                {manual === null
                  ? "Set by your results: two hits in a row raise it, a miss lowers it."
                  : "Set by hand for this round."}
              </p>
              <label className="mt-3 block text-sm">
                <span className="sr-only">Choose the difficulty</span>
                <select
                  className="h-11 w-full border border-line bg-card px-3"
                  value={manual ?? "auto"}
                  onChange={(event) =>
                    setManual(event.target.value === "auto" ? null : toDifficulty(Number(event.target.value)))
                  }
                >
                  <option value="auto">Adaptive{hydrated ? ` (now ${profile.difficulty})` : ""}</option>
                  {([1, 2, 3, 4, 5] as const).map((d) => (
                    <option key={d} value={d}>
                      {d}: {DIFFICULTY_NAMES[d]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="panel p-4">
              <p className="label">What the forger will try</p>
              <p className="mt-2 leading-relaxed">
                {focus
                  ? `You asked to train: ${TYPE_LABELS[focus]}. The planner will favor it where the photo allows.`
                  : hydrated && weakest
                    ? `Your weakest type so far is ${TYPE_LABELS[weakest].toLowerCase()}. The planner leans toward it.`
                    : "No history yet, so all six manipulation types are equally likely."}
              </p>
              <Link href="/profile" className="mt-2 inline-flex min-h-[44px] items-center text-sm underline underline-offset-4">
                See your skill profile
              </Link>
            </div>
          </aside>
        </div>
      ) : null}

      {phase.name === "forging" ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={jpegUrl(phase.original.data)}
              alt="Your photo, prepared for forging"
              className="w-full border border-line"
              style={{ aspectRatio: `${phase.original.width} / ${phase.original.height}` }}
            />
            <p className="mt-2 text-sm text-ink-soft">
              Your original. Take a good look now: during the hunt you will only see the forged version.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <AgentTimeline entries={timeline} revealed={false} />
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft">
              <p aria-live="off">
                Elapsed <Elapsed running /> , usually 20 to 45 s
              </p>
              <button type="button" className="btn btn-quiet" onClick={cancel}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {phase.name === "hunt" ? (
        <div className="mt-8 flex flex-col gap-6">
          <Hunt
            key={phase.outcome.forged.length}
            imageUrl={jpegUrl(phase.outcome.forged)}
            maskUrl={pngUrl(phase.outcome.mask)}
            width={phase.original.width}
            height={phase.original.height}
            difficulty={difficulty}
            hint={phase.outcome.hint}
            onDone={(hunt) => onHuntDone(phase.original, phase.outcome, hunt)}
          />
          <AgentTimeline entries={timeline} revealed={false} />
        </div>
      ) : null}

      {phase.name === "reveal" ? (
        <div className="mt-8 flex flex-col gap-8">
          <Reveal
            originalUrl={jpegUrl(phase.original.data)}
            forgedUrl={jpegUrl(phase.outcome.forged)}
            heatUrl={pngUrl(phase.outcome.heat)}
            width={phase.original.width}
            height={phase.original.height}
            changeBox={phase.outcome.changeBox}
            hunt={phase.hunt}
            facts={{
              type: phase.outcome.candidate.type,
              difficulty: phase.playedAt,
              targetDescription: phase.outcome.candidate.target_description,
              description: editSummary(phase.outcome.candidate.edit_instruction),
              tell: phase.outcome.tell,
              changedPct: phase.outcome.stats.changedPct,
              plausibility: phase.outcome.verdict?.plausibility ?? null,
              obviousness: phase.outcome.verdict?.obviousness ?? null,
            }}
          >
            {phase.outcome.mock ? (
              <p className="border-l-4 border-ink bg-card px-4 py-3 text-sm leading-relaxed">
                Mock mode: no model was called. The edit is a plain color shift that exercises the same compositing,
                measuring and scoring code as a real forgery.
              </p>
            ) : null}
            <div className="panel p-4">
              <p className="label">Next round</p>
              <p className="mt-2 leading-relaxed">
                Difficulty {profile.difficulty} of 5.{" "}
                {profile.difficulty > phase.playedAt
                  ? "Two hits in a row, so it gets harder."
                  : profile.difficulty < phase.playedAt
                    ? "A miss, so it gets a little easier."
                    : phase.hunt.hitOnGuess !== null
                      ? "One more hit raises it."
                      : "It stays where it is."}
                {weakest ? ` The forger will lean toward ${TYPE_LABELS[weakest].toLowerCase()}, your weakest type.` : ""}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  className="btn"
                  disabled={!canForge}
                  onClick={() =>
                    void start(phase.original, [
                      `the ${phase.outcome.candidate.target_label} (${phase.outcome.candidate.target_description}), it was used in the previous round`,
                    ])
                  }
                >
                  Forge this photo again
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => setPhase({ name: "pick" })}>
                  Choose another photo
                </button>
              </div>
            </div>
          </Reveal>
          <AgentTimeline entries={timeline} revealed title="Agent log" />
          <p className="text-sm leading-relaxed text-ink-soft">
            Live forgeries are not offered for download and are gone when you leave this page. Images made by the Gemini
            image model also carry an invisible SynthID watermark.
          </p>
        </div>
      ) : null}

      {phase.name === "error" ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="border-l-4 border-edited bg-card px-5 py-5" role="alert">
            <p className="text-lg leading-relaxed">{phase.failure.message}</p>
            <p className="mono mt-2 text-xs text-ink-soft">Code {phase.failure.code}</p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Link href="/dojo" className="btn">
                Play a pre-forged card instead
              </Link>
              {phase.original && canForge && !["UNSAFE", "RATE_LIMITED", "LIVE_DISABLED", "BAD_INPUT"].includes(phase.failure.code) ? (
                <button type="button" className="btn btn-quiet" onClick={() => phase.original && void start(phase.original)}>
                  Try this photo again
                </button>
              ) : null}
              <button type="button" className="btn btn-quiet" onClick={() => setPhase({ name: "pick" })}>
                Choose another photo
              </button>
            </div>
          </div>
          {timeline.length ? <AgentTimeline entries={timeline} revealed={false} title="What happened" /> : null}
        </div>
      ) : null}
    </div>
  );
}
