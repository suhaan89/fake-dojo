"use client";

import { FORENSICS_DISCLAIMER, LENSES, lensCaption, type LensId } from "@/lib/forensics";

interface LensSwitcherProps {
  value: LensId;
  onChange: (lens: LensId) => void;
  /** Lens that is being computed right now, if any. */
  busy?: LensId | null;
  /** Shown next to forensic lenses, for example "20 points" during the hunt. */
  costLabel?: (lens: LensId) => string | null;
  label?: string;
}

/** Photo, ELA, Noise, Edges. Always states that forensics give clues, not proof. */
export function LensSwitcher({ value, onChange, busy = null, costLabel, label = "Lens" }: LensSwitcherProps) {
  return (
    <div>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap">
        {LENSES.map((lens) => {
          const active = lens.id === value;
          const cost = costLabel?.(lens.id) ?? null;
          return (
            <button
              key={lens.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(lens.id)}
              className={`-ml-px min-h-[44px] border px-3.5 text-sm first:ml-0 ${
                active
                  ? "z-[1] border-ink bg-ink text-paper"
                  : "border-line bg-card text-ink hover:border-ink"
              }`}
            >
              {lens.label}
              {busy === lens.id ? <span className="mono ml-1.5 text-xs">...</span> : null}
              {cost ? <span className={`mono ml-2 text-xs ${active ? "text-paper/80" : "text-ink-soft"}`}>{cost}</span> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft" aria-live="polite">
        {value === "photo" ? null : <>{lensCaption(value)} </>}
        <span className="font-medium text-ink">{FORENSICS_DISCLAIMER}</span>
      </p>
    </div>
  );
}
