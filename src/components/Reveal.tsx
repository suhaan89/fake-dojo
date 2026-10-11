"use client";

import { useState } from "react";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import type { HuntResult } from "@/components/Hunt";
import { ImageStage } from "@/components/ImageStage";
import { LensSwitcher } from "@/components/LensSwitcher";
import { ResultCard, type ResultFacts } from "@/components/ResultCard";
import { useLenses } from "@/components/useLenses";
import { Verdict } from "@/components/Verdict";
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
  if (hunt.hitOnGuess === 1) return "Found it. First guess.";
  if (hunt.hitOnGuess === 2) return "Found it. Second guess.";
  if (hunt.gaveUp && hunt.guesses === 0) return "Here is the edit you were looking for.";
  return "Missed it.";
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
      <Verdict
        tone={hit === true ? "win" : "lose"}
        title={headline ?? verdictLine(hunt)}
        points={points}
        detail={
          [
            hunt && hunt.hints > 0 ? "Hint used" : "",
            hunt && hunt.labUses > 0 ? `${hunt.labUses} lab tool${hunt.labUses === 1 ? "" : "s"} used` : "",
          ]
            .filter(Boolean)
            .join(", ") || undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
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
          <p className="text-sm text-ink-soft">Red marks every pixel that differs from the original. Measured, not guessed.</p>
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
        <div className="mt-3 max-w-4xl">
          <BeforeAfterSlider before={originalUrl} after={forgedUrl} width={width} height={height} />
        </div>
      </section>
    </div>
  );
}
