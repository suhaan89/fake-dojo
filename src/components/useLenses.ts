"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ForensicLens, LensId } from "@/lib/forensics";
import { LensRunner } from "@/lib/forensics/client";

export interface LensState {
  lens: LensId;
  /** URL to display for the current lens. Falls back to the photo while a lens is computing. */
  src: string;
  busy: LensId | null;
  error: string | null;
  /** Forensic lenses that have been opened at least once. */
  used: ReadonlySet<ForensicLens>;
  select: (lens: LensId) => void;
}

/**
 * Lens selection for one image. Each lens is computed once (in a Web Worker) and cached.
 * Remount the owner with a `key` when the image changes.
 */
export function useLenses(imageUrl: string, onFirstUse?: (lens: ForensicLens) => void): LensState {
  const runner = useRef<LensRunner | null>(null);
  const [lens, setLens] = useState<LensId>("photo");
  const [urls, setUrls] = useState<Partial<Record<ForensicLens, string>>>({});
  const [busy, setBusy] = useState<LensId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState<ReadonlySet<ForensicLens>>(new Set());
  const firstUse = useRef(onFirstUse);

  useEffect(() => {
    firstUse.current = onFirstUse;
  }, [onFirstUse]);

  useEffect(() => {
    const instance = new LensRunner(imageUrl);
    runner.current = instance;
    return () => {
      instance.dispose();
      runner.current = null;
    };
  }, [imageUrl]);

  const select = useCallback(
    (next: LensId) => {
      setLens(next);
      setError(null);
      if (next === "photo") return;
      if (!used.has(next)) {
        setUsed((previous) => new Set(previous).add(next));
        firstUse.current?.(next);
      }
      if (urls[next] || !runner.current) return;
      setBusy(next);
      const instance = runner.current;
      instance.get(next).then(
        (url) => {
          if (runner.current !== instance) return;
          setUrls((previous) => ({ ...previous, [next]: url }));
          setBusy((current) => (current === next ? null : current));
        },
        () => {
          if (runner.current !== instance) return;
          setBusy((current) => (current === next ? null : current));
          setError("This lens could not be computed in your browser.");
          setLens("photo");
        },
      );
    },
    [urls, used],
  );

  const src = lens === "photo" ? imageUrl : (urls[lens] ?? imageUrl);
  return { lens, src, busy, error, used, select };
}
