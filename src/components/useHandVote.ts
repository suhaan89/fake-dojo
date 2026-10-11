"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HandDetector } from "@/lib/vision/hands";
import { addTally, countHands, type Tally } from "@/lib/vision/votes";

export type CameraStatus = "off" | "starting" | "on" | "error";

const EMPTY: Tally = { real: 0, edited: 0 };
/** Time between two detections. Eight per second is plenty for raised hands. */
const INTERVAL_MS = 120;

function cameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") return "Camera access was not allowed. Allow it in the browser and try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device.";
  if (name === "NotReadableError") return "The camera is in use by another app.";
  return "The camera vote could not start on this device.";
}

/**
 * Counts raised hands per screen half through the device camera.
 * `live` is the current frame; the running total since the last `reset` is read with `total`.
 */
export function useHandVote() {
  const [status, setStatus] = useState<CameraStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<Tally>(EMPTY);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<HandDetector | null>(null);
  const totalRef = useRef<Tally>(EMPTY);
  const frameRef = useRef(0);

  const stop = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    detectorRef.current?.close();
    detectorRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    totalRef.current = EMPTY;
    setLive(EMPTY);
    setStatus("off");
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    setError(null);
    setStatus("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("no camera api", "NotFoundError");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      const { createHandDetector } = await import("@/lib/vision/hands");
      const detector = await createHandDetector();
      // The user may have switched the camera off while the model was loading.
      if (streamRef.current !== stream) {
        detector.close();
        return;
      }
      detectorRef.current = detector;
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      video.srcObject = stream;
      await video.play();
      // The first detection compiles the model and can take seconds. Do it before the vote starts.
      detector.detect(video, performance.now());

      let last = 0;
      const loop = (now: number) => {
        frameRef.current = requestAnimationFrame(loop);
        if (now - last < INTERVAL_MS || video.readyState < 2) return;
        last = now;
        const frame = countHands(detector.detect(video, now));
        totalRef.current = addTally(totalRef.current, frame);
        setLive((previous) => (previous.real === frame.real && previous.edited === frame.edited ? previous : frame));
      };
      frameRef.current = requestAnimationFrame(loop);
      setStatus("on");
    } catch (caught) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError(cameraError(caught));
      setStatus("error");
    }
  }, []);

  useEffect(() => stop, [stop]);

  const total = useCallback(() => totalRef.current, []);
  const reset = useCallback(() => {
    totalRef.current = EMPTY;
  }, []);

  return { status, error, live, videoRef, start, stop, total, reset };
}
