"use client";

import { useEffect, useState } from "react";
import { playSound } from "@/lib/game/sound";

export type VerdictTone = "win" | "lose" | "info";

const CONFETTI_COLORS = ["#1f7a5a", "#e5484d", "#121212", "#e8c53a", "#2f5f9e"];
const CONFETTI_COUNT = 28;

/** Paper confetti: flat squares that fly out and fall. Positions follow from the index, not from chance. */
export function Confetti({ count = CONFETTI_COUNT }: { count?: number }) {
  return (
    <span aria-hidden className="confetti">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.4;
        const reach = 90 + ((i * 53) % 150);
        return (
          <i
            key={i}
            style={
              {
                "--dx": `${Math.round(Math.cos(angle) * reach)}px`,
                "--dy": `${Math.round(Math.sin(angle) * reach * 0.7 - 60)}px`,
                "--rot": `${(i * 97) % 720}deg`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${(i % 7) * 18}ms`,
                width: `${7 + (i % 3) * 3}px`,
                height: `${7 + ((i + 1) % 3) * 3}px`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </span>
  );
}

/** Counts from 0 to `value` over about 0.7 seconds. */
export function CountUp({ value, prefix = "" }: { value: number; prefix?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(frame);
    }
    const started = performance.now();
    const length = 700;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / length);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <span className="mono tabular-nums">
      {prefix}
      {shown}
    </span>
  );
}

interface VerdictProps {
  tone: VerdictTone;
  title: string;
  /** Points won in this step. Shown large when given. */
  points?: number;
  detail?: string;
  compact?: boolean;
  children?: React.ReactNode;
}

/** The moment of truth: a stamped verdict, the points counting up and, on a win, confetti and a chime. */
export function Verdict({ tone, title, points, detail, compact = false, children }: VerdictProps) {
  useEffect(() => {
    if (tone === "win") playSound("win");
    else if (tone === "lose") playSound("lose");
  }, [tone]);

  const color = tone === "win" ? "bg-real text-white" : tone === "lose" ? "bg-edited-ink text-white" : "bg-ink text-paper";
  return (
    <div
      className={`verdict relative flex flex-wrap items-center justify-between gap-x-6 gap-y-2 ${color} ${
        compact ? "px-4 py-3" : "px-5 py-5 sm:px-7 sm:py-6"
      } ${tone === "lose" ? "verdict-shake" : ""}`}
      aria-live="polite"
    >
      {tone === "win" ? <Confetti count={compact ? 14 : CONFETTI_COUNT} /> : null}
      <div className="min-w-0">
        <p
          className={`verdict-stamp font-semibold leading-none tracking-tight ${
            compact ? "text-2xl" : "text-[clamp(2rem,5.2vw,3.75rem)]"
          }`}
        >
          {title}
        </p>
        {detail ? <p className={`mt-2 opacity-90 ${compact ? "text-sm" : "text-base sm:text-lg"}`}>{detail}</p> : null}
        {children}
      </div>
      {points !== undefined ? (
        <p className={`verdict-points shrink-0 font-semibold leading-none ${compact ? "text-3xl" : "text-[clamp(2.5rem,7vw,5rem)]"}`}>
          <CountUp value={points} prefix={points > 0 ? "+" : ""} />
          <span className={`ml-2 font-medium opacity-90 ${compact ? "text-sm" : "text-lg"}`}>points</span>
        </p>
      ) : null}
    </div>
  );
}
