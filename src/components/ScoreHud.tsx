"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BeltBadge } from "@/components/BeltBadge";
import { Confetti } from "@/components/Verdict";
import { beltProgress, hitStreak } from "@/lib/game/progression";
import { isSoundOn, playSound, setSoundOn } from "@/lib/game/sound";
import { dismissBeltUp, useBeltUp, useHydrated, useProfile } from "@/lib/game/store";

/** Belt, points and streak, always in view. Links to the profile. */
export function ScoreHud() {
  const hydrated = useHydrated();
  const profile = useProfile();
  const [sound, setSound] = useState(true);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSound(isSoundOn()));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!hydrated) return <div className="h-11 w-56" aria-hidden />;
  const progress = beltProgress(profile.points);
  const streak = hitStreak(profile);

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/profile"
        className="flex min-h-[44px] items-center gap-3 border border-line bg-card px-3 hover:border-ink"
        aria-label={`${profile.points} points, ${progress.belt.name} belt${streak > 1 ? `, ${streak} in a row` : ""}. Open profile.`}
      >
        <BeltBadge belt={progress.belt} size="sm" />
        <span className="flex flex-col">
          <span key={profile.points} className="bump mono text-lg font-semibold leading-none">
            {profile.points}
            <span className="ml-1 text-[11px] font-normal text-ink-soft">pts</span>
          </span>
          <span className="mt-1 block h-1 w-24 bg-paper-deep" aria-hidden>
            <span className="block h-full bg-ink transition-[width] duration-700" style={{ width: `${progress.fraction * 100}%` }} />
          </span>
        </span>
        {streak > 1 ? (
          <span key={streak} className="bump mono bg-ink px-1.5 py-1 text-xs font-semibold text-paper">
            x{streak}
          </span>
        ) : null}
      </Link>
      <button
        type="button"
        className="btn btn-quiet px-3 text-xs"
        aria-pressed={sound}
        onClick={() => {
          const next = !sound;
          setSoundOn(next);
          setSound(next);
          if (next) playSound("tap");
        }}
      >
        {sound ? "Sound on" : "Sound off"}
      </button>
    </div>
  );
}

/** Full-screen moment when the player reaches a new belt. */
export function BeltUpOverlay() {
  const belt = useBeltUp();
  useEffect(() => {
    if (!belt) return;
    playSound("belt");
    const timer = window.setTimeout(dismissBeltUp, 4200);
    return () => window.clearTimeout(timer);
  }, [belt]);

  if (!belt) return null;
  return (
    <div
      role="dialog"
      aria-label={`New belt: ${belt.name}`}
      className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
      onClick={dismissBeltUp}
    >
      <div className="verdict relative flex flex-col items-center gap-4 border-4 border-ink bg-paper px-10 py-9 text-center">
        <Confetti count={40} />
        <p className="label">New belt</p>
        <div className="verdict-points">
          <BeltBadge belt={belt} />
        </div>
        <p className="verdict-stamp text-[clamp(2.5rem,8vw,5rem)] font-semibold leading-none tracking-tight" style={{ transformOrigin: "center" }}>
          {belt.name} belt
        </p>
        <button type="button" className="btn mt-2" onClick={dismissBeltUp} autoFocus>
          Keep training
        </button>
      </div>
    </div>
  );
}
