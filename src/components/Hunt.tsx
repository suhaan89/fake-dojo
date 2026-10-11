"use client";

import { useEffect, useRef, useState } from "react";
import { ImageStage, type StageMarker } from "@/components/ImageStage";
import { LensSwitcher } from "@/components/LensSwitcher";
import { useLenses } from "@/components/useLenses";
import { LAB_TOOLS_FROM } from "@/lib/game/difficulty";
import { classifyTap, HINT_COST, huntPoints, LAB_TOOL_COST, MAX_GUESSES } from "@/lib/game/scoring";
import { loadMask } from "@/lib/image/prepare";

export interface HuntResult {
  hitOnGuess: 1 | 2 | null;
  guesses: number;
  hints: number;
  labUses: number;
  points: number;
  markers: StageMarker[];
  gaveUp: boolean;
}

interface HuntProps {
  imageUrl: string;
  maskUrl: string;
  width: number;
  height: number;
  difficulty: number;
  hint: string;
  onDone: (result: HuntResult) => void;
  /** Label of the give-up button. */
  revealLabel?: string;
  /** Shown above the hunt panel, for example the result of the call that led here. */
  banner?: React.ReactNode;
}

/** The player sees only the forged image and gets two taps to find the edit. */
export function Hunt({ imageUrl, maskUrl, width, height, difficulty, hint, onDone, revealLabel = "Reveal the answer", banner }: HuntProps) {
  const [mask, setMask] = useState<Uint8Array | null>(null);
  const [maskError, setMaskError] = useState(false);
  const [markers, setMarkers] = useState<StageMarker[]>([]);
  const [hintShown, setHintShown] = useState(false);
  const [labUses, setLabUses] = useState(0);
  const [loupe, setLoupe] = useState(false);
  const [message, setMessage] = useState("Tap where you think the photo was edited.");
  const finished = useRef(false);
  const labTools = difficulty >= LAB_TOOLS_FROM;
  const lenses = useLenses(imageUrl, () => setLabUses((n) => n + 1));

  useEffect(() => {
    let cancelled = false;
    loadMask(maskUrl).then(
      (loaded) => {
        if (!cancelled) setMask(loaded.mask);
      },
      () => {
        if (!cancelled) setMaskError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [maskUrl]);

  const hints = hintShown ? 1 : 0;
  const guessNumber = (markers.length + 1) as 1 | 2;
  const worth = huntPoints({ difficulty, hitOnGuess: guessNumber, hints, labUses });
  const left = MAX_GUESSES - markers.length;

  const finish = (hitOnGuess: 1 | 2 | null, all: StageMarker[], gaveUp: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onDone({
      hitOnGuess,
      guesses: all.length,
      hints,
      labUses,
      points: huntPoints({ difficulty, hitOnGuess, hints, labUses }),
      markers: all,
      gaveUp,
    });
  };

  const onPick = (x: number, y: number) => {
    if (!mask || finished.current || markers.length >= MAX_GUESSES) return;
    const result = classifyTap(mask, width, height, x, y);
    const all = [...markers, { x, y, result }];
    setMarkers(all);
    if (result === "hit") {
      setMessage("Hit.");
      finish(all.length as 1 | 2, all, false);
      return;
    }
    if (all.length >= MAX_GUESSES) {
      setMessage(result === "close" ? "Close, but not on it." : "Miss.");
      finish(null, all, false);
      return;
    }
    setMessage(
      result === "close"
        ? "Close. The edit is very near that spot. One guess left."
        : "Miss. Nothing was changed there. One guess left.",
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <ImageStage
        src={lenses.src}
        width={width}
        height={height}
        alt="Photo with one hidden edit"
        onPick={mask ? onPick : undefined}
        markers={markers}
        loupe={loupe}
        fill
        toolbar={
          <button
            type="button"
            className={`btn ${loupe ? "" : "btn-quiet"}`}
            aria-pressed={loupe}
            onClick={() => setLoupe((on) => !on)}
          >
            Loupe 3x
          </button>
        }
      />

      <div className="flex flex-col gap-4">
        {banner}
        <div className="panel p-4">
          <p className="label">The hunt</p>
          <p className="mt-2 text-lg font-medium leading-snug" aria-live="assertive">
            {maskError ? "The answer key could not be loaded." : message}
          </p>
          <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-4">
            <div>
              <p className="label">A hit is worth</p>
              <p key={worth} className="bump mono mt-1 text-5xl font-semibold leading-none">
                {worth}
              </p>
            </div>
            <div className="text-right">
              <p className="label">Guesses</p>
              <p className="mt-2 flex justify-end gap-1.5" aria-label={`${left} guesses left`}>
                {Array.from({ length: MAX_GUESSES }, (_, i) => (
                  <span key={i} className={`block h-5 w-5 border-2 border-ink ${i < left ? "bg-ink" : "bg-transparent"}`} />
                ))}
              </p>
            </div>
          </div>
          <p className="mono mt-3 text-xs text-ink-soft">Difficulty {difficulty} of 5</p>
        </div>

        <div className="panel p-4">
          <p className="label">Hint</p>
          {hintShown ? (
            <p className="mt-2 leading-relaxed">{hint}</p>
          ) : (
            <button type="button" className="btn btn-quiet mt-2 w-full" onClick={() => setHintShown(true)}>
              Hint, costs {HINT_COST} points
            </button>
          )}
        </div>

        {labTools ? (
          <div className="panel p-4">
            <p className="label">Lab tools</p>
            <p className="mb-3 mt-2 text-sm text-ink-soft">Each lens costs {LAB_TOOL_COST} points once.</p>
            <LensSwitcher
              value={lenses.lens}
              onChange={lenses.select}
              busy={lenses.busy}
              label="Lab tools"
              costLabel={(id) => (id === "photo" || lenses.used.has(id) ? null : `${LAB_TOOL_COST} points`)}
            />
            {lenses.error ? <p className="mt-2 text-sm text-edited-ink">{lenses.error}</p> : null}
          </div>
        ) : null}

        <button type="button" className="btn btn-quiet" onClick={() => finish(null, markers, true)}>
          {revealLabel}
        </button>
      </div>
    </div>
  );
}
