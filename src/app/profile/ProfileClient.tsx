"use client";

import Link from "next/link";
import { useState } from "react";
import { BeltBadge } from "@/components/BeltBadge";
import { SkillRadar } from "@/components/SkillRadar";
import { useToast } from "@/components/Toasts";
import { DIFFICULTY_NAMES } from "@/lib/game/difficulty";
import { beltProgress, BELTS, skillMean, weakestType } from "@/lib/game/progression";
import { resetProfile, useHydrated, useProfile } from "@/lib/game/store";
import { MANIPULATION_TYPES, TYPE_LABELS } from "@/lib/game/types";

function when(at: number): string {
  try {
    return new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function ProfileClient() {
  const profile = useProfile();
  const hydrated = useHydrated();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const progress = beltProgress(profile.points);
  const weakest = weakestType(profile);
  const played = profile.rounds.length > 0 || profile.points > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10" aria-busy={!hydrated}>
      <p className="label">Profile</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Your training record</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        Stored only in this browser. No account, nothing on a server.
      </p>

      <div className={`mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] ${hydrated ? "" : "invisible"}`}>
        <section className="panel min-w-0 p-5" aria-label="Belt and points">
          <div className="flex flex-wrap items-center gap-4">
            <BeltBadge belt={progress.belt} />
            <div>
              <p className="label">Belt</p>
              <p className="text-3xl font-semibold tracking-tight">{progress.belt.name}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="label">Points</p>
              <p className="mono text-3xl font-semibold">{profile.points}</p>
            </div>
          </div>

          <div className="mt-5">
            <div
              className="h-3 w-full border border-ink bg-paper"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress.fraction * 100)}
              aria-label={progress.next ? `Progress to the ${progress.next.name} belt` : "All belts earned"}
            >
              <div className="h-full bg-ink" style={{ width: `${progress.fraction * 100}%` }} />
            </div>
            <p className="mono mt-2 text-[13px] text-ink-soft">
              {progress.next
                ? `${progress.pointsToNext} points to the ${progress.next.name} belt`
                : "Black belt. There is nothing above it."}
            </p>
          </div>

          <ol className="mt-5 grid grid-cols-4 gap-x-3 gap-y-3 sm:grid-cols-7" aria-label="All belts">
            {BELTS.map((belt) => {
              const earned = profile.points >= belt.points;
              return (
                <li key={belt.name} className={earned ? "" : "opacity-40"}>
                  <BeltBadge belt={belt} size="sm" />
                  <p className="mt-1 text-[13px]">{belt.name}</p>
                  <p className="mono text-[11px] text-ink-soft">{belt.points}</p>
                </li>
              );
            })}
          </ol>

          <dl className="mono mt-6 grid grid-cols-2 gap-y-1 border-t border-line pt-4 text-[13px]">
            <dt className="text-ink-soft">Forge difficulty</dt>
            <dd className="text-right">
              {profile.difficulty} of 5, {DIFFICULTY_NAMES[profile.difficulty]}
            </dd>
            <dt className="text-ink-soft">Hits in a row</dt>
            <dd className="text-right">{profile.streak}</dd>
            <dt className="text-ink-soft">Weakest type</dt>
            <dd className="text-right">{weakest ? TYPE_LABELS[weakest] : "Not enough rounds yet"}</dd>
          </dl>
        </section>

        <section className="panel min-w-0 p-5" aria-label="Skill per manipulation type">
          <p className="label">Skill per type</p>
          <div className="mt-2 flex justify-center">
            <SkillRadar skills={profile.skills} />
          </div>
          <table className="mt-2 w-full text-left text-sm">
            <caption className="sr-only">Hits and misses per manipulation type</caption>
            <thead>
              <tr className="label border-b border-line">
                <th scope="col" className="py-2 font-normal">Type</th>
                <th scope="col" className="py-2 text-right font-normal">Found</th>
                <th scope="col" className="py-2 text-right font-normal">Missed</th>
                <th scope="col" className="py-2 text-right font-normal">Skill</th>
              </tr>
            </thead>
            <tbody className="mono">
              {MANIPULATION_TYPES.map((type) => (
                <tr key={type} className="border-b border-line last:border-b-0">
                  <th scope="row" className="py-2 font-sans font-normal">{TYPE_LABELS[type]}</th>
                  <td className="py-2 text-right">{profile.skills[type].hits}</td>
                  <td className="py-2 text-right">{profile.skills[type].misses}</td>
                  <td className="py-2 text-right">{Math.round(skillMean(profile.skills[type]) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Skill is the mean of a Beta distribution over your hits and misses. It starts at 50% and moves as evidence
            comes in. The forger favors the types where it is lowest.
          </p>
        </section>

        <section className="panel min-w-0 lg:col-span-2" aria-label="Recent rounds">
          <header className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="label">Recent rounds</h2>
            <span className="label">{profile.rounds.length} stored</span>
          </header>
          {profile.rounds.length === 0 ? (
            <div className="px-5 py-6">
              <p className="leading-relaxed">No rounds yet. Your first hunt will show up here.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/forge" className="btn">
                  Forge a photo
                </Link>
                <Link href="/dojo" className="btn btn-quiet">
                  Play the Daily Dojo
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="label border-b border-line">
                    <th scope="col" className="px-5 py-2 font-normal">When</th>
                    <th scope="col" className="px-3 py-2 font-normal">Mode</th>
                    <th scope="col" className="px-3 py-2 font-normal">Type</th>
                    <th scope="col" className="px-3 py-2 text-right font-normal">Level</th>
                    <th scope="col" className="px-3 py-2 font-normal">Result</th>
                    <th scope="col" className="px-5 py-2 text-right font-normal">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.rounds.map((round, index) => (
                    <tr key={`${round.at}-${index}`} className="border-b border-line last:border-b-0">
                      <td className="mono px-5 py-2 text-[13px] text-ink-soft">{when(round.at)}</td>
                      <td className="px-3 py-2">{round.mode === "forge" ? "Forge" : "Dojo"}</td>
                      <td className="px-3 py-2">{round.type ? TYPE_LABELS[round.type] : "Real photo"}</td>
                      <td className="mono px-3 py-2 text-right">{round.type ? round.difficulty : ""}</td>
                      <td className={`px-3 py-2 ${round.hit ? "text-real" : "text-edited-ink"}`}>
                        {round.type ? (round.hit ? "Found" : "Missed") : round.hit ? "Trusted" : "Doubted"}
                      </td>
                      <td className="mono px-5 py-2 text-right">{round.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="lg:col-span-2" aria-label="Reset">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-3 border-l-4 border-edited bg-card px-4 py-3" role="alert">
              <p className="mr-auto">Delete all points, skills and history in this browser?</p>
              <button
                type="button"
                className="btn btn-edited"
                onClick={() => {
                  resetProfile();
                  setConfirming(false);
                  toast.show("Profile reset. You are a white belt again.");
                }}
              >
                Yes, reset
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setConfirming(false)}>
                Keep it
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-quiet" onClick={() => setConfirming(true)} disabled={!played}>
              Reset profile
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
