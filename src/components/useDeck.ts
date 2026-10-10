"use client";

import { useEffect, useState } from "react";
import { loadDeck, type Deck } from "@/lib/game/deck";

export type DeckState = { state: "loading" } | { state: "ready"; deck: Deck } | { state: "error" };

/** Loads the committed deck from /deck/deck.json. No API call is involved. */
export function useDeck(): DeckState {
  const [deck, setDeck] = useState<DeckState>({ state: "loading" });
  useEffect(() => {
    let cancelled = false;
    loadDeck().then(
      (loaded) => {
        if (!cancelled) setDeck({ state: "ready", deck: loaded });
      },
      () => {
        if (!cancelled) setDeck({ state: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return deck;
}
