import type { Point } from "./votes";

// Hand detection in the browser with MediaPipe Hand Landmarker. The runtime and the model
// are served from this site, and camera frames never leave the device.

const WASM_PATH = "/mediapipe";
const MODEL_PATH = "/models/hand_landmarker.task";
export const MAX_HANDS = 8;

export interface HandDetector {
  /** Landmarks of every hand in the current video frame, in normalized camera coordinates. */
  detect(video: HTMLVideoElement, timeMs: number): Point[][];
  close(): void;
}

export async function createHandDetector(): Promise<HandDetector> {
  const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: "VIDEO" as const,
    numHands: MAX_HANDS,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  let landmarker;
  try {
    landmarker = await HandLandmarker.createFromOptions(fileset, options("GPU"));
  } catch {
    landmarker = await HandLandmarker.createFromOptions(fileset, options("CPU"));
  }
  return {
    detect(video, timeMs) {
      return landmarker.detectForVideo(video, timeMs).landmarks ?? [];
    },
    close() {
      landmarker.close();
    },
  };
}
