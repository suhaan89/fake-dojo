"use client";

import { useEffect, useState } from "react";
import { fetchHealth } from "@/lib/forge/client";
import type { HealthResponse } from "@/lib/forge/types";

export type LiveState = { state: "checking" } | { state: "ready"; health: HealthResponse } | { state: "offline" };

/** Asks /api/health once. No model call is made. */
export function useLiveStatus(): LiveState {
  const [live, setLive] = useState<LiveState>({ state: "checking" });
  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal).then(
      (health) => setLive({ state: "ready", health }),
      () => {
        if (!controller.signal.aborted) setLive({ state: "offline" });
      },
    );
    return () => controller.abort();
  }, []);
  return live;
}

export function isLive(live: LiveState): boolean {
  return live.state === "ready" && live.health.liveForge;
}

export function StatusPill({ live }: { live: LiveState }) {
  let dot = "bg-line";
  let text = "Checking the forge";
  if (live.state === "ready" && live.health.liveForge) {
    dot = "bg-real";
    text = "Live forge online";
  } else if (live.state !== "checking") {
    dot = "bg-edited";
    text = "Live forge resting, try the Daily Dojo";
  }
  const mock = live.state === "ready" && live.health.mock;
  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="status">
      <span className="inline-flex min-h-[28px] items-center gap-2 border border-line bg-card px-2.5 text-[13px]">
        <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
        {text}
      </span>
      {mock ? (
        <span className="mono inline-flex min-h-[28px] items-center border border-ink px-2 text-[11px] uppercase tracking-wider">
          Mock mode
        </span>
      ) : null}
    </span>
  );
}
