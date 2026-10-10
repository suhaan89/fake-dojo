"use client";

import { useSyncExternalStore } from "react";
import { applyRound, clearProfile, emptyProfile, loadProfile, saveProfile } from "./progression";
import type { Profile, RoundRecord } from "./types";

// A tiny external store for the player profile. The profile lives in localStorage;
// when storage is unavailable the game keeps working with an in-memory profile.

const SERVER_PROFILE = emptyProfile();
let current: Profile | null = null;
let persisted = true;
const listeners = new Set<() => void>();

function read(): Profile {
  current ??= loadProfile();
  return current;
}

function write(next: Profile): void {
  current = next;
  persisted = saveProfile(next);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Applies a finished round and returns the updated profile. */
export function recordRound(round: RoundRecord): Profile {
  const next = applyRound(read(), round);
  write(next);
  return next;
}

export function resetProfile(): void {
  clearProfile();
  write(emptyProfile());
}

/** False when the last save did not reach localStorage (private mode, quota, blocked). */
export function isProfilePersisted(): boolean {
  return persisted;
}

/** The profile on the client, an empty one during server rendering and hydration. */
export function useProfile(): Profile {
  return useSyncExternalStore(subscribe, read, () => SERVER_PROFILE);
}

/** True once the component runs in the browser with the stored profile available. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
