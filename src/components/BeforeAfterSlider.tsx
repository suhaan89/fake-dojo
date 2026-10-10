"use client";

import { useRef, useState, type PointerEvent } from "react";

interface BeforeAfterSliderProps {
  before: string;
  after: string;
  width: number;
  height: number;
  beforeLabel?: string;
  afterLabel?: string;
}

/** Drag or use the arrow keys to wipe between the original and the forged image. */
export function BeforeAfterSlider({
  before,
  after,
  width,
  height,
  beforeLabel = "Original",
  afterLabel = "Forged",
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = (clientX: number) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveTo(event.clientX);
  };

  return (
    <div>
      <div
        ref={frameRef}
        className="relative w-full touch-pan-y select-none overflow-hidden border border-line bg-paper-deep"
        style={{ aspectRatio: `${width} / ${height}` }}
        onPointerDown={onPointerDown}
        onPointerMove={(event) => dragging.current && moveTo(event.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after} alt={`${afterLabel} image`} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={before}
          alt={`${beforeLabel} image`}
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        />
        <span className="label pointer-events-none absolute left-2 top-2 bg-paper/90 px-2 py-1 text-ink">{beforeLabel}</span>
        <span className="label pointer-events-none absolute right-2 top-2 bg-paper/90 px-2 py-1 text-ink">{afterLabel}</span>
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-paper shadow-[0_0_0_1px_rgba(18,18,18,0.6)]"
          style={{ left: `${position}%`, transform: "translateX(-50%)" }}
        >
          <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center border border-ink bg-paper">
            <svg width="18" height="12" viewBox="0 0 18 12" fill="none" aria-hidden>
              <path d="M6 1 1 6l5 5M12 1l5 5-5 5" stroke="#121212" strokeWidth="1.6" />
            </svg>
          </div>
        </div>
      </div>
      <label className="mt-2 flex items-center gap-3 text-sm text-ink-soft">
        <span className="shrink-0">{beforeLabel}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(position)}
          onChange={(event) => setPosition(Number(event.target.value))}
          aria-label={`Comparison position, ${beforeLabel} on the left, ${afterLabel} on the right`}
          className="h-11 w-full accent-[#121212]"
        />
        <span className="shrink-0">{afterLabel}</span>
      </label>
    </div>
  );
}
