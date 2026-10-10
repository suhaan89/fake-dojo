"use client";

import { useState } from "react";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import type { HuntResult } from "@/components/Hunt";
import { ImageStage } from "@/components/ImageStage";
import { LensSwitcher } from "@/components/LensSwitcher";
import { ResultCard, type ResultFacts } from "@/components/ResultCard";
import { useLenses } from "@/components/useLenses";
import type { NormBox } from "@/lib/cv/types";

interface RevealProps {
  originalUrl: string;
  forgedUrl: string;
  heatUrl: string;
  width: number;
  height: number;
  changeBox: NormBox;
  facts: ResultFacts;
  /** Null when the player never hunted (for example a wrong "Real" call in the dojo). */
  hunt: HuntResult | null;
  /** Extra points shown in the headline, for example for a correct call. */
  bonusPoints?: number;
  headline?: string;
  children?: React.ReactNode;
}

function verdictLine(hunt: HuntResult | null): string {
  if (!hunt) return "Here is what was changed.";
  if (hunt.hitOnGuess === 1) return "Found it on the first guess.";
  if (hunt.hitOnGuess === 2) return "Found it on the second guess.";
  if (hunt.gaveUp && hunt.guesses === 0) return "Here is the edit you were looking for.";
  return "Missed. Here is the edit.";
}

/** The forensic reveal: exact heatmap, before and after, the tell, and the forensic lenses. */
export function Reveal({
  originalUrl,
  forgedUrl,
  heatUrl,
  width,
  height,
  changeBox,
  facts,
  hunt,
  bonusPoints = 0,
  headline,
  children,
}: RevealProps) {
  const [heat, setHeat] = useState(true);
  const lenses = useLenses(forgedUrl);
  const hit = hunt ? hunt.hitOnGuess !== null : null;
  const points = (hunt?.points ?? 0) + bonusPoints;

  return (
    <div className="flex flex-col gap-8">
      <div
        className={`rise border-l-4 bg-card px-4 py-4 sm:px-5 ${hit === false ? "border-edited" : "border-real"}`}
        aria-live="polite"
      >
        <p className="text-2xl font-semibold tracking-tight sm:text-3xl">{headline ?? verdictLine(hunt)}</p>
        <p className="mono mt-1.5 text-sm text-ink-soft">
          {points} points
          {hunt && hunt.hints > 0 ? `, hint used` : ""}
          {hunt && hunt.labUses > 0 ? `, ${hunt.labUses} lab tool${hunt.labUses === 1 ? "" : "s"} used` : ""}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <ImageStage
            src={lenses.src}
            width={width}
            height={height}
            alt="The forged photo"
            overlaySrc={heat ? heatUrl : null}
            box={heat ? null : changeBox}
            markers={hunt?.markers ?? []}
            loupe={false}
            toolbar={
              <button type="button" className={`btn ${heat ? "" : "btn-quiet"}`} aria-pressed={heat} onClick={() => setHeat((on) => !on)}>
                Heatmap
              </button>
            }
          />
          <p className="text-sm leading-relaxed text-ink-soft">
            The red heatmap is the ground truth: every pixel that differs from your original. It is exact, because the
            edit was composited into the original by our own code and then measured.
          </p>
          <LensSwitcher value={lenses.lens} onChange={lenses.select} busy={lenses.busy} label="Forensic lens" />
          {lenses.error ? <p className="text-sm text-edited-ink">{lenses.error}</p> : null}
        </div>
        <div className="flex flex-col gap-4">
          <ResultCard facts={facts} />
          {children}
        </div>
      </div>

      <section aria-label="Before and after">
        <h2 className="text-xl font-semibold tracking-tight">Before and after</h2>
        <p className="mb-3 mt-1 text-sm text-ink-soft">Drag the handle to wipe between the original and the forgery.</p>
        <div className="max-w-3xl">
          <BeforeAfterSlider before={originalUrl} after={forgedUrl} width={width} height={height} />
        </div>
      </section>
    </div>
  );
}
