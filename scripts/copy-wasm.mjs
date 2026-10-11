// Copies the MediaPipe WebAssembly runtime into public/mediapipe so the classroom camera
// vote works without a third-party CDN. Runs before dev and build.
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const from = path.join("node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = path.join("public", "mediapipe");
const files = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

await mkdir(to, { recursive: true });
await Promise.all(files.map((file) => copyFile(path.join(from, file), path.join(to, file))));
console.log(`Copied ${files.length} MediaPipe runtime files to ${to}`);
