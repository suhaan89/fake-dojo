import { describe, expect, it } from "vitest";
import { rasterizeBox } from "../cv/polygon";
import {
  buildSession,
  cardImages,
  dailySeed,
  heroForgedOnLeft,
  parseDeck,
  pickHeroCard,
  type Deck,
  type DeckCard,
} from "./deck";
import { areaFits, areaRange, nextDifficulty, postProcessFor, toDifficulty } from "./difficulty";
import {
  applyRound,
  beltFor,
  beltProgress,
  clearProfile,
  emptyProfile,
  loadProfile,
  PROFILE_KEY,
  sanitizeProfile,
  saveProfile,
  skillMean,
  weakestType,
  weaknessWeights,
} from "./progression";
import { hashString, mulberry32, pickWeighted, seededRandom, shuffle } from "./rng";
import { callPoints, classifyTap, huntPoints } from "./scoring";
import { TELLS } from "./tells";
import { MANIPULATION_TYPES, type RoundRecord } from "./types";

function round(partial: Partial<RoundRecord>): RoundRecord {
  return {
    at: 1,
    mode: "forge",
    type: "remove_object",
    difficulty: 2,
    hit: true,
    points: 200,
    guesses: 1,
    hints: 0,
    labUses: 0,
    ...partial,
  };
}

describe("scoring", () => {
  it("pays 100 x difficulty on the first guess and 60 x on the second", () => {
    expect(huntPoints({ difficulty: 3, hitOnGuess: 1, hints: 0, labUses: 0 })).toBe(300);
    expect(huntPoints({ difficulty: 3, hitOnGuess: 2, hints: 0, labUses: 0 })).toBe(180);
    expect(huntPoints({ difficulty: 5, hitOnGuess: null, hints: 0, labUses: 0 })).toBe(0);
  });

  it("subtracts hints and lab tools and never goes negative", () => {
    expect(huntPoints({ difficulty: 4, hitOnGuess: 1, hints: 1, labUses: 2 })).toBe(400 - 30 - 40);
    expect(huntPoints({ difficulty: 1, hitOnGuess: 2, hints: 1, labUses: 3 })).toBe(0);
  });

  it("pays 50 for a correct call", () => {
    expect(callPoints(true)).toBe(50);
    expect(callPoints(false)).toBe(0);
  });

  it("classifies taps as hit, close or miss", () => {
    const w = 1000;
    const h = 500;
    const mask = rasterizeBox({ x0: 400, y0: 200, x1: 450, y1: 240 }, w, h);
    // min side 500: hit within 10 px, close within 40 px.
    expect(classifyTap(mask, w, h, 420, 220)).toBe("hit");
    expect(classifyTap(mask, w, h, 458, 220)).toBe("hit");
    expect(classifyTap(mask, w, h, 462, 220)).toBe("close");
    expect(classifyTap(mask, w, h, 488, 220)).toBe("close");
    expect(classifyTap(mask, w, h, 495, 220)).toBe("miss");
    expect(classifyTap(mask, w, h, 5, 5)).toBe("miss");
    expect(classifyTap(new Uint8Array(w * h), w, h, 420, 220)).toBe("miss");
  });
});

describe("difficulty", () => {
  it("raises after two hits in a row and lowers after a miss", () => {
    let state = { difficulty: toDifficulty(2), streak: 0 };
    state = nextDifficulty(state, true);
    expect(state).toEqual({ difficulty: 2, streak: 1 });
    state = nextDifficulty(state, true);
    expect(state).toEqual({ difficulty: 3, streak: 0 });
    state = nextDifficulty(state, false);
    expect(state).toEqual({ difficulty: 2, streak: 0 });
  });

  it("clamps to 1..5", () => {
    expect(nextDifficulty({ difficulty: 1, streak: 0 }, false).difficulty).toBe(1);
    expect(nextDifficulty({ difficulty: 5, streak: 1 }, true).difficulty).toBe(5);
    expect(toDifficulty(9)).toBe(5);
    expect(toDifficulty(Number.NaN)).toBe(2);
  });

  it("validates area ranges with tolerance", () => {
    expect(areaRange(1)).toEqual([8, 15]);
    expect(areaRange(5)).toEqual([0.5, 3]);
    expect(areaFits(6, 3)).toBe(true);
    expect(areaFits(2.2, 3)).toBe(true);
    expect(areaFits(2.0, 3)).toBe(false);
    expect(areaFits(10.4, 3)).toBe(true);
    expect(areaFits(10.5, 3)).toBe(false);
  });

  it("hides traces only at high difficulty", () => {
    expect(postProcessFor(1)).toMatchObject({ jpegQuality: 95, noiseSigma: 0 });
    expect(postProcessFor(3)).toMatchObject({ jpegQuality: 90, noiseSigma: 0 });
    expect(postProcessFor(5)).toMatchObject({ jpegQuality: 85, noiseSigma: 1.2 });
  });
});

describe("progression", () => {
  it("maps points to belts", () => {
    expect(beltFor(0).name).toBe("White");
    expect(beltFor(499).name).toBe("White");
    expect(beltFor(500).name).toBe("Yellow");
    expect(beltFor(2999).name).toBe("Orange");
    expect(beltFor(12000).name).toBe("Black");
    expect(beltFor(99999).name).toBe("Black");
  });

  it("reports progress to the next belt", () => {
    const p = beltProgress(1000);
    expect(p.belt.name).toBe("Yellow");
    expect(p.next?.name).toBe("Orange");
    expect(p.fraction).toBeCloseTo(0.5, 5);
    expect(p.pointsToNext).toBe(500);
    expect(beltProgress(20000)).toMatchObject({ next: null, fraction: 1, pointsToNext: 0 });
  });

  it("uses the Beta mean as skill", () => {
    expect(skillMean({ hits: 0, misses: 0 })).toBe(0.5);
    expect(skillMean({ hits: 3, misses: 1 })).toBeCloseTo(4 / 6, 6);
    expect(skillMean({ hits: 0, misses: 8 })).toBeCloseTo(0.1, 6);
  });

  it("normalizes weakness weights and favors weak types", () => {
    let profile = emptyProfile();
    const even = weaknessWeights(profile);
    expect(Object.values(even).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(even.alter_text).toBeCloseTo(1 / 6, 6);
    for (let i = 0; i < 4; i++) profile = applyRound(profile, round({ type: "alter_text", hit: false, points: 0 }));
    for (let i = 0; i < 4; i++) profile = applyRound(profile, round({ type: "add_object", hit: true }));
    const weights = weaknessWeights(profile);
    expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(weights.alter_text).toBeGreaterThan(weights.remove_object);
    expect(weights.remove_object).toBeGreaterThan(weights.add_object);
    expect(weakestType(profile)).toBe("alter_text");
    expect(weakestType(emptyProfile())).toBeNull();
  });

  it("applies rounds without mutating the previous profile", () => {
    const start = emptyProfile();
    const a = applyRound(start, round({ points: 200 }));
    const b = applyRound(a, round({ points: 200 }));
    expect(start.points).toBe(0);
    expect(start.skills.remove_object.hits).toBe(0);
    expect(b.points).toBe(400);
    expect(b.skills.remove_object).toEqual({ hits: 2, misses: 0 });
    expect(b.difficulty).toBe(3);
    expect(b.rounds).toHaveLength(2);
    const c = applyRound(b, round({ hit: false, points: 0 }));
    expect(c.difficulty).toBe(2);
  });

  it("does not let deck rounds change the forge difficulty", () => {
    let profile = emptyProfile();
    for (let i = 0; i < 5; i++) profile = applyRound(profile, round({ mode: "dojo" }));
    expect(profile.difficulty).toBe(2);
    profile = applyRound(profile, round({ mode: "dojo", type: null, points: 50 }));
    expect(profile.points).toBe(1050);
  });

  it("caps the history", () => {
    let profile = emptyProfile();
    for (let i = 0; i < 40; i++) profile = applyRound(profile, round({ at: i }));
    expect(profile.rounds).toHaveLength(30);
    expect(profile.rounds[0].at).toBe(39);
  });

  it("survives broken storage", () => {
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadProfile(throwing)).toEqual(emptyProfile());
    expect(saveProfile(emptyProfile(), throwing)).toBe(false);
    expect(clearProfile(throwing)).toBe(false);
    expect(loadProfile(null)).toEqual(emptyProfile());
    expect(saveProfile(emptyProfile(), null)).toBe(false);
  });

  it("round-trips through storage and repairs bad data", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    const profile = applyRound(emptyProfile(), round({ points: 300, difficulty: 3 }));
    expect(saveProfile(profile, storage)).toBe(true);
    expect(loadProfile(storage)).toEqual(profile);
    store.set(PROFILE_KEY, "{not json");
    expect(loadProfile(storage)).toEqual(emptyProfile());
    store.set(PROFILE_KEY, JSON.stringify({ version: 1, points: -5, difficulty: 99, skills: { add_object: { hits: "x" } }, rounds: [null, { type: "nope", hit: true }] }));
    const repaired = loadProfile(storage);
    expect(repaired.points).toBe(0);
    expect(repaired.difficulty).toBe(5);
    expect(repaired.skills.add_object).toEqual({ hits: 0, misses: 0 });
    expect(repaired.rounds).toHaveLength(1);
    expect(repaired.rounds[0].type).toBeNull();
    expect(sanitizeProfile({ version: 2 })).toEqual(emptyProfile());
    expect(clearProfile(storage)).toBe(true);
    expect(store.size).toBe(0);
  });
});

describe("rng", () => {
  it("is deterministic per seed", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const seqA = [a(), a(), a()];
    expect(seqA).toEqual([b(), b(), b()]);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(mulberry32(124)()).not.toBe(seqA[0]);
    expect(hashString("demo")).toBe(hashString("demo"));
    expect(hashString("demo")).not.toBe(hashString("demo2"));
  });

  it("shuffles without losing items", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(items, seededRandom("x"));
    expect(out.slice().sort()).toEqual(items);
    expect(out).toEqual(shuffle(items, seededRandom("x")));
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("picks by weight", () => {
    const random = mulberry32(9);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 2000; i++) counts[pickWeighted({ a: 9, b: 1 }, random)]++;
    expect(counts.a).toBeGreaterThan(1650);
    expect(counts.b).toBeGreaterThan(100);
    expect(pickWeighted({ a: 0, b: 0 }, random)).toMatch(/a|b/);
  });
});

describe("deck", () => {
  function card(id: string, kind: "forged" | "real", difficulty = 2): DeckCard {
    return {
      id,
      kind,
      type: kind === "forged" ? "add_object" : null,
      difficulty: kind === "forged" ? difficulty : null,
      width: 1024,
      height: 768,
      scene: "a test scene",
      target_description: kind === "forged" ? "the cup on the left" : "",
      tell: kind === "forged" ? "its shadow points the wrong way" : "",
      hint: kind === "forged" ? "look at the table" : "",
      changeBox: kind === "forged" ? { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } : null,
      stats: kind === "forged" ? { changedPct: 2, meanDelta: 30 } : null,
      verify: kind === "forged" ? { plausibility: 4, obviousness: 2 } : null,
      createdAt: "2026-10-10T10:00:00.000Z",
    };
  }
  const deck: Deck = {
    version: 1,
    generatedAt: "2026-10-10T10:00:00.000Z",
    cards: [
      ...Array.from({ length: 14 }, (_, i) => card(`f${i}`, "forged", (i % 5) + 1)),
      ...Array.from({ length: 6 }, (_, i) => card(`r${i}`, "real")),
    ],
  };

  it("builds a seeded 70/30 session", () => {
    const session = buildSession(deck, "2026-10-10");
    expect(session).toHaveLength(10);
    expect(session.filter((c) => c.kind === "forged")).toHaveLength(7);
    expect(new Set(session.map((c) => c.id)).size).toBe(10);
    expect(buildSession(deck, "2026-10-10").map((c) => c.id)).toEqual(session.map((c) => c.id));
    expect(buildSession(deck, "2026-10-11").map((c) => c.id)).not.toEqual(session.map((c) => c.id));
  });

  it("fills up when one kind is short and handles empty decks", () => {
    const fewReal = { ...deck, cards: deck.cards.filter((c) => c.id !== "r1" && c.id !== "r2" && c.id !== "r3" && c.id !== "r4" && c.id !== "r5") };
    const session = buildSession(fewReal, "s");
    expect(session).toHaveLength(10);
    expect(session.filter((c) => c.kind === "real")).toHaveLength(1);
    const tiny = { ...deck, cards: deck.cards.slice(0, 3) };
    expect(buildSession(tiny, "s")).toHaveLength(3);
    expect(buildSession({ ...deck, cards: [] }, "s")).toEqual([]);
  });

  it("follows the curated demo order", () => {
    const curated = { ...deck, demoOrder: ["r0", "f3", "missing", "f1"] };
    expect(buildSession(curated, "demo").map((c) => c.id)).toEqual(["r0", "f3", "f1"]);
    expect(pickHeroCard(curated, "demo")?.id).toBe("f3");
    expect(buildSession(deck, "demo")).toHaveLength(10);
  });

  it("picks a findable hero card", () => {
    const hero = pickHeroCard(deck, "abc");
    expect(hero?.kind).toBe("forged");
    expect(hero!.difficulty!).toBeLessThanOrEqual(3);
    expect(pickHeroCard({ ...deck, cards: deck.cards.filter((c) => c.kind === "real") }, "abc")).toBeNull();
    expect(typeof heroForgedOnLeft("abc")).toBe("boolean");
    expect(heroForgedOnLeft("abc")).toBe(heroForgedOnLeft("abc"));
  });

  it("derives image paths", () => {
    expect(cardImages(card("x", "forged"))).toEqual({
      shown: "/deck/x/forged.jpg",
      original: "/deck/x/original.jpg",
      forged: "/deck/x/forged.jpg",
      mask: "/deck/x/mask.png",
      heat: "/deck/x/heat.png",
    });
    expect(cardImages(card("y", "real"))).toMatchObject({ shown: "/deck/y/original.jpg", forged: null, mask: null });
  });

  it("parses decks and drops incomplete forged cards", () => {
    const broken = { ...card("bad", "forged"), changeBox: null };
    const parsed = parseDeck(JSON.parse(JSON.stringify({ ...deck, cards: [...deck.cards, broken] })));
    expect(parsed.cards).toHaveLength(20);
    expect(() => parseDeck({ version: 2, cards: [] })).toThrow();
  });

  it("uses the UTC date as the daily seed", () => {
    expect(dailySeed(new Date("2026-10-11T23:30:00Z"))).toBe("2026-10-11");
  });
});

describe("tells", () => {
  it("has advice for every type", () => {
    for (const type of MANIPULATION_TYPES) {
      expect(TELLS[type].length).toBeGreaterThan(80);
      expect(TELLS[type].split(". ").length).toBeGreaterThanOrEqual(2);
    }
  });
});
