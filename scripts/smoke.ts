// Smoke test for the AI integration: plan, render and verify from Node against the
// configured provider. Usage: npm run smoke -- <photo> [--difficulty 1..5]
// Without a photo a synthetic test image is used, which is enough for the mock provider.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { entryText, ForgeFailure, runForge, STEP_LABELS } from "../src/lib/forge/run";
import { toDifficulty } from "../src/lib/game/difficulty";
import { emptyProfile, weaknessWeights } from "../src/lib/game/progression";
import { prepareBuffer } from "../src/lib/image/prepare-node";
import { readEnv } from "../src/lib/server/env";
import { getProvider } from "../src/lib/server/pipeline";
import { costLine, directTransport, loadEnvFiles, syntheticPhoto } from "./lib/node-forge";

async function main(): Promise<number> {
  loadEnvFiles();
  const args = process.argv.slice(2);
  const flagIndex = args.indexOf("--difficulty");
  const difficulty = toDifficulty(flagIndex >= 0 ? Number(args[flagIndex + 1]) : 2);
  const photo = args.find((arg, i) => !arg.startsWith("--") && args[i - 1] !== "--difficulty");

  const env = readEnv();
  const provider = getProvider(env);
  console.log(
    provider.name === "mock"
      ? "Provider: mock (no network, no cost)"
      : `Provider: vision ${env.visionModel}, image ${env.imageModel} via ${env.imageProvider}`,
  );
  if (!photo) console.log("No photo given, using a synthetic test image.");

  const source = photo ? await readFile(photo) : await syntheticPhoto();
  const prepared = await prepareBuffer(source);
  console.log(`Prepared: ${prepared.width}x${prepared.height}, ratio ${prepared.aspectRatio}, difficulty ${difficulty}`);

  const seen = new Map<string, string>();
  const outcome = await runForge(directTransport(provider), {
    image: prepared.data,
    difficulty,
    weights: weaknessWeights(emptyProfile()),
    onTimeline: (entries) => {
      for (const entry of entries) {
        if (entry.status === "running") continue;
        const line = `[${STEP_LABELS[entry.step]}] ${entry.ms ?? 0} ms  ${entry.status}  ${entryText(entry, true)}`;
        if (seen.get(entry.key) !== line) {
          seen.set(entry.key, line);
          console.log(line);
        }
      }
    },
  });

  const dir = path.join("tmp", "smoke");
  await mkdir(dir, { recursive: true });
  await Promise.all([
    writeFile(path.join(dir, "original.jpg"), Buffer.from(prepared.data, "base64")),
    writeFile(path.join(dir, "forged.jpg"), Buffer.from(outcome.forged, "base64")),
    writeFile(path.join(dir, "mask.png"), Buffer.from(outcome.mask, "base64")),
    writeFile(path.join(dir, "heat.png"), Buffer.from(outcome.heat, "base64")),
    writeFile(
      path.join(dir, "result.json"),
      JSON.stringify(
        {
          candidate: outcome.candidate,
          verdict: outcome.verdict,
          changeBox: outcome.changeBox,
          stats: outcome.stats,
          tell: outcome.tell,
          hint: outcome.hint,
          renders: outcome.renders,
          totalMs: outcome.totalMs,
        },
        null,
        2,
      ),
    ),
  ]);

  console.log("");
  console.log(`Type:        ${outcome.candidate.type}`);
  console.log(`Target:      ${outcome.candidate.target_description}`);
  console.log(`Changed:     ${outcome.stats.changedPct}% of the pixels, mean delta ${outcome.stats.meanDelta}`);
  console.log(`Total time:  ${(outcome.totalMs / 1000).toFixed(1)} s with ${outcome.renders} image call(s)`);
  console.log(`Est. cost:   ${costLine(outcome.renders, outcome.mock, env.imageProvider)}`);
  console.log(`Output:      ${dir}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    if (error instanceof ForgeFailure) {
      console.error(`Forge failed with ${error.code}: ${error.message}`);
    } else {
      console.error(error);
    }
    process.exit(1);
  },
);
