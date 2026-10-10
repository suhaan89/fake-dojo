// Builds the committed training deck from seed/photos/*.
// Usage: npm run seed [-- --limit N] [-- --dry-run] [-- --allow-mock]
//
// Per photo: prepare, then 1 to 2 forged cards at varied difficulties, balanced across the
// six manipulation types; about 30% of the photos also become untouched "real" cards.
// The run is resumable: cards that already exist in public/deck are skipped.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { editSummary } from "../src/lib/ai/prompts";
import { ForgeFailure, runForge } from "../src/lib/forge/run";
import { IMAGE_COST_USD } from "../src/lib/forge/types";
import { DeckSchema, type Deck, type DeckCard } from "../src/lib/game/deck";
import { MANIPULATION_TYPES, type ManipulationType } from "../src/lib/game/types";
import type { PreparedImage } from "../src/lib/image/crop";
import { prepareBuffer } from "../src/lib/image/prepare-node";
import { readEnv } from "../src/lib/server/env";
import { getProvider } from "../src/lib/server/pipeline";
import { directTransport, estimateCost, loadEnvFiles, usd } from "./lib/node-forge";

const PHOTO_DIR = path.join("seed", "photos");
const DECK_DIR = path.join("public", "deck");
const DECK_FILE = path.join(DECK_DIR, "deck.json");
const DATASET_FILE = path.join("dataset", "manifest.jsonl");
const CONCURRENCY = 2;
const MAX_DECK_BYTES = 25 * 1024 * 1024;
/** Difficulties cycle through this list so the deck covers the whole range. */
const DIFFICULTY_CYCLE = [2, 3, 1, 4, 2, 3, 5, 1, 4, 3];

interface Job {
  id: string;
  photo: string;
  file: string;
  kind: "forged" | "real";
  difficulty: number;
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "photo"
  );
}

async function loadDeck(): Promise<Deck> {
  if (!existsSync(DECK_FILE)) return { version: 1, generatedAt: new Date().toISOString(), cards: [] };
  return DeckSchema.parse(JSON.parse(await readFile(DECK_FILE, "utf8")));
}

async function saveDeck(deck: Deck): Promise<void> {
  deck.generatedAt = new Date().toISOString();
  deck.cards.sort((a, b) => a.id.localeCompare(b.id));
  await mkdir(DECK_DIR, { recursive: true });
  await writeFile(DECK_FILE, `${JSON.stringify(deck, null, 2)}\n`);
}

async function folderBytes(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? await folderBytes(full) : (await stat(full)).size;
  }
  return total;
}

/** Weights that pull the planner toward the types the deck has the fewest of. */
function balanceWeights(counts: Record<ManipulationType, number>): Record<ManipulationType, number> {
  const max = Math.max(...MANIPULATION_TYPES.map((type) => counts[type]));
  const raw = MANIPULATION_TYPES.map((type) => 1 + (max - counts[type]) * 2);
  const total = raw.reduce((a, b) => a + b, 0);
  return Object.fromEntries(MANIPULATION_TYPES.map((type, i) => [type, raw[i] / total])) as Record<ManipulationType, number>;
}

async function main(): Promise<number> {
  loadEnvFiles();
  const dryRun = flag("--dry-run");
  const limit = Number(option("--limit") ?? Infinity);

  const files = existsSync(PHOTO_DIR)
    ? (await readdir(PHOTO_DIR)).filter((name) => /\.(jpe?g|png|webp)$/i.test(name)).sort()
    : [];
  if (!files.length) {
    console.log("No photos found in seed/photos.");
    console.log("Add 15 to 25 of your own photos (JPEG, PNG or WebP) and run `npm run seed` again.");
    console.log("Use scenes without recognizable faces, readable license plates or anything that shows a home address.");
    return 0;
  }

  const env = readEnv();
  const provider = getProvider(env);
  if (provider.name === "mock" && !dryRun && !flag("--allow-mock")) {
    console.log("The mock provider cannot build a real deck: its edits are plain color shifts, not AI forgeries.");
    console.log("Put GEMINI_API_KEY into .env.local, or pass --dry-run to see the plan.");
    console.log("For UI testing only you can pass --allow-mock; never commit a deck built that way.");
    return 0;
  }

  const deck = await loadDeck();
  const existing = new Set(deck.cards.map((card) => card.id));

  // Plan the jobs deterministically from the file list, so a later run resumes the same plan.
  const jobs: Job[] = [];
  let forgedIndex = 0;
  for (let i = 0; i < files.length; i++) {
    const file = path.join(PHOTO_DIR, files[i]);
    const digest = createHash("sha256").update(await readFile(file)).digest("hex").slice(0, 6);
    const photo = `${slug(files[i])}-${digest}`;
    const forgedCount = i % 2 === 0 ? 2 : 1;
    for (let k = 0; k < forgedCount; k++) {
      const difficulty = DIFFICULTY_CYCLE[forgedIndex++ % DIFFICULTY_CYCLE.length];
      jobs.push({ id: `${photo}-f${k + 1}`, photo, file, kind: "forged", difficulty });
    }
    // Three photos out of ten also appear untouched.
    if (i % 10 === 1 || i % 10 === 4 || i % 10 === 8) {
      jobs.push({ id: `${photo}-real`, photo, file, kind: "real", difficulty: 0 });
    }
  }

  const pending = jobs.filter((job) => !existing.has(job.id)).slice(0, limit);
  const forgedPending = pending.filter((job) => job.kind === "forged").length;
  console.log(`Provider: ${provider.name}${provider.name === "gemini" ? ` (${env.visionModel}, ${env.imageModel})` : ""}`);
  console.log(`Photos: ${files.length}. Planned cards: ${jobs.length}. Already in the deck: ${jobs.length - jobs.filter((j) => !existing.has(j.id)).length}. To do now: ${pending.length}.`);
  console.log(
    `Estimated cost: ${usd(estimateCost(forgedPending, provider.name === "mock"))} to ${usd(estimateCost(forgedPending * 3, provider.name === "mock"))} (${IMAGE_COST_USD} USD per image call, 1 to 3 calls per forged card).`,
  );
  if (dryRun) {
    for (const job of pending) {
      console.log(`  ${job.kind === "forged" ? `forged d${job.difficulty}` : "real     "}  ${job.id}`);
    }
    console.log("Dry run, nothing was written.");
    return 0;
  }

  const counts = Object.fromEntries(MANIPULATION_TYPES.map((type) => [type, 0])) as Record<ManipulationType, number>;
  for (const card of deck.cards) if (card.type) counts[card.type]++;
  const usedTargets = new Map<string, string[]>();
  const prepared = new Map<string, Promise<PreparedImage>>();
  const prepare = (job: Job) => {
    let pendingImage = prepared.get(job.file);
    if (!pendingImage) {
      pendingImage = readFile(job.file).then(prepareBuffer);
      prepared.set(job.file, pendingImage);
    }
    return pendingImage;
  };

  let renders = 0;
  let done = 0;
  let failed = 0;
  let writing: Promise<void> = Promise.resolve();
  const commit = (card: DeckCard) => {
    deck.cards = deck.cards.filter((c) => c.id !== card.id).concat(card);
    // Deck writes are chained so two workers never write the file at the same time.
    writing = writing.then(() => saveDeck(deck));
    return writing;
  };

  const transport = directTransport(provider);
  const run = async (job: Job) => {
    const dir = path.join(DECK_DIR, job.id);
    try {
      const original = await prepare(job);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "original.jpg"), Buffer.from(original.data, "base64"));
      const base = {
        id: job.id,
        photo: job.photo,
        width: original.width,
        height: original.height,
        createdAt: new Date().toISOString(),
      };

      if (job.kind === "real") {
        await commit({
          ...base,
          kind: "real",
          type: null,
          difficulty: null,
          scene: "",
          target_description: "",
          description: "",
          tell: "",
          hint: "",
          changeBox: null,
          stats: null,
          verify: null,
        });
        done++;
        console.log(`[${done + failed}/${pending.length}] real    ${job.id}`);
        return;
      }

      const outcome = await runForge(transport, {
        image: original.data,
        difficulty: job.difficulty,
        weights: balanceWeights(counts),
        avoid: (usedTargets.get(job.photo) ?? []).map((target) => `${target}, it is already used by another card`),
      });
      renders += outcome.renders;
      counts[outcome.candidate.type]++;
      usedTargets.set(job.photo, [...(usedTargets.get(job.photo) ?? []), outcome.candidate.target_description]);
      await Promise.all([
        writeFile(path.join(dir, "forged.jpg"), Buffer.from(outcome.forged, "base64")),
        writeFile(path.join(dir, "mask.png"), Buffer.from(outcome.mask, "base64")),
        writeFile(path.join(dir, "heat.png"), Buffer.from(outcome.heat, "base64")),
      ]);
      await commit({
        ...base,
        kind: "forged",
        type: outcome.candidate.type,
        difficulty: job.difficulty,
        scene: outcome.scene,
        target_description: outcome.candidate.target_description,
        description: editSummary(outcome.candidate.edit_instruction),
        tell: outcome.tell,
        hint: outcome.hint,
        changeBox: outcome.changeBox,
        stats: { changedPct: outcome.stats.changedPct, meanDelta: outcome.stats.meanDelta },
        verify: outcome.verdict
          ? { plausibility: outcome.verdict.plausibility, obviousness: outcome.verdict.obviousness }
          : null,
      });
      done++;
      console.log(
        `[${done + failed}/${pending.length}] forged  ${job.id}  d${job.difficulty}  ${outcome.candidate.type}  ${outcome.stats.changedPct}%  ${(outcome.totalMs / 1000).toFixed(1)} s  ${outcome.renders} call(s)`,
      );
    } catch (error) {
      failed++;
      // A half-written card folder would be served as a broken card, so it is removed.
      await rm(dir, { recursive: true, force: true });
      const reason = error instanceof ForgeFailure ? `${error.code}: ${error.message}` : String(error);
      console.log(`[${done + failed}/${pending.length}] FAILED  ${job.id}  ${reason}`);
      if (error instanceof ForgeFailure && error.code === "LIVE_DISABLED") throw error;
    }
  };

  // Cards of one photo run one after the other, so the second card can avoid the target of the first.
  const groups = new Map<string, Job[]>();
  for (const job of pending) groups.set(job.photo, [...(groups.get(job.photo) ?? []), job]);
  const queue = Array.from(groups.values());
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let group = queue.shift(); group; group = queue.shift()) {
        for (const job of group) await run(job);
      }
    }),
  );
  await writing;
  await saveDeck(deck);

  // The deck doubles as a pixel-exact labeled forgery-localization dataset.
  const lines = deck.cards
    .filter((card) => card.kind === "forged")
    .map((card) =>
      JSON.stringify({
        image: `public/deck/${card.id}/forged.jpg`,
        original: `public/deck/${card.id}/original.jpg`,
        mask: `public/deck/${card.id}/mask.png`,
        type: card.type,
        difficulty: card.difficulty,
      }),
    );
  await mkdir(path.dirname(DATASET_FILE), { recursive: true });
  await writeFile(DATASET_FILE, lines.length ? `${lines.join("\n")}\n` : "");

  const bytes = await folderBytes(DECK_DIR);
  const forgedTotal = deck.cards.filter((card) => card.kind === "forged").length;
  console.log("");
  console.log(`Done: ${done} card(s) written, ${failed} failed. Run the command again to retry failed cards.`);
  console.log(`Deck: ${deck.cards.length} cards (${forgedTotal} forged, ${deck.cards.length - forgedTotal} real), ${(bytes / 1024 / 1024).toFixed(1)} MB in ${DECK_DIR}`);
  console.log(`Types: ${MANIPULATION_TYPES.map((type) => `${type} ${counts[type]}`).join(", ")}`);
  console.log(`Actual cost: ${usd(estimateCost(renders, provider.name === "mock"))} for ${renders} image call(s), plus about a cent per card for the vision calls.`);
  console.log(`Dataset manifest: ${DATASET_FILE} (${lines.length} labeled images)`);
  if (bytes > MAX_DECK_BYTES) console.log("Warning: the deck is larger than 25 MB. Remove some cards before committing.");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof ForgeFailure ? `Seeding stopped with ${error.code}: ${error.message}` : error);
    process.exit(1);
  },
);
