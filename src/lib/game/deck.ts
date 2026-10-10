import * as z from "zod";
import { seededRandom, shuffle } from "./rng";
import { MANIPULATION_TYPES } from "./types";

const NormBoxSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

export const DeckCardSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["forged", "real"]),
  type: z.enum(MANIPULATION_TYPES).nullable(),
  difficulty: z.number().int().min(1).max(5).nullable(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  scene: z.string(),
  target_description: z.string(),
  /** One sentence saying what was changed. Empty for real photos. */
  description: z.string(),
  tell: z.string(),
  hint: z.string(),
  changeBox: NormBoxSchema.nullable(),
  stats: z.object({ changedPct: z.number(), meanDelta: z.number() }).nullable(),
  verify: z.object({ plausibility: z.number(), obviousness: z.number() }).nullable(),
  createdAt: z.string(),
});

export const DeckSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  /** Optional curated card order used by the reproducible demo seed. */
  demoOrder: z.array(z.string()).optional(),
  cards: z.array(DeckCardSchema),
});

export type DeckCard = z.infer<typeof DeckCardSchema>;
export type Deck = z.infer<typeof DeckSchema>;

export const DECK_URL = "/deck/deck.json";
export const SESSION_SIZE = 10;
export const FORGED_SHARE = 0.7;
export const DEMO_SEED = "demo";

export function emptyDeck(): Deck {
  return { version: 1, generatedAt: new Date(0).toISOString(), cards: [] };
}

export function parseDeck(value: unknown): Deck {
  const deck = DeckSchema.parse(value);
  // A forged card without its metadata cannot be scored, so it is dropped here.
  const cards = deck.cards.filter(
    (card) => card.kind === "real" || (card.type !== null && card.difficulty !== null && card.changeBox !== null),
  );
  return { ...deck, cards };
}

export interface CardImages {
  /** What the player is shown. */
  shown: string;
  original: string;
  forged: string | null;
  mask: string | null;
  heat: string | null;
}

export function cardImages(card: DeckCard): CardImages {
  const base = `/deck/${card.id}`;
  const forged = card.kind === "forged";
  return {
    shown: forged ? `${base}/forged.jpg` : `${base}/original.jpg`,
    original: `${base}/original.jpg`,
    forged: forged ? `${base}/forged.jpg` : null,
    mask: forged ? `${base}/mask.png` : null,
    heat: forged ? `${base}/heat.png` : null,
  };
}

/** The same deck every day for everyone, in UTC. */
export function dailySeed(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Builds a session of up to `size` cards, about 70% forged and 30% real, in a seeded order.
 * The demo seed follows the curated `demoOrder` when the deck defines one.
 */
export function buildSession(deck: Deck, seed: string, size = SESSION_SIZE): DeckCard[] {
  if (seed === DEMO_SEED && deck.demoOrder?.length) {
    const byId = new Map(deck.cards.map((card) => [card.id, card]));
    const curated = deck.demoOrder.flatMap((id) => byId.get(id) ?? []);
    if (curated.length) return curated.slice(0, size);
  }
  const random = seededRandom(`session:${seed}`);
  const forged = shuffle(deck.cards.filter((card) => card.kind === "forged"), random);
  const real = shuffle(deck.cards.filter((card) => card.kind === "real"), random);
  const total = Math.min(size, forged.length + real.length);
  let forgedCount = Math.min(forged.length, Math.round(total * FORGED_SHARE));
  const realCount = Math.min(real.length, total - forgedCount);
  forgedCount = Math.min(forged.length, total - realCount);
  return shuffle([...forged.slice(0, forgedCount), ...real.slice(0, realCount)], random);
}

/** A forged card for the landing hero: its original and forged image are shown side by side. */
export function pickHeroCard(deck: Deck, seed: string): DeckCard | null {
  const forged = deck.cards.filter((card) => card.kind === "forged");
  if (!forged.length) return null;
  if (seed === DEMO_SEED && deck.demoOrder?.length) {
    const first = deck.demoOrder.map((id) => forged.find((card) => card.id === id)).find(Boolean);
    if (first) return first;
  }
  // Prefer edits that are findable at thumbnail size.
  const friendly = forged.filter((card) => (card.difficulty ?? 5) <= 3);
  const pool = friendly.length ? friendly : forged;
  return shuffle(pool, seededRandom(`hero:${seed}`))[0];
}

/** Whether the forged image sits on the left for this seed. */
export function heroForgedOnLeft(seed: string): boolean {
  return seededRandom(`side:${seed}`)() < 0.5;
}

export async function loadDeck(fetcher: typeof fetch = fetch): Promise<Deck> {
  const response = await fetcher(DECK_URL, { cache: "no-store" });
  if (response.status === 404) return emptyDeck();
  if (!response.ok) throw new Error(`Deck request failed with status ${response.status}`);
  return parseDeck(await response.json());
}
