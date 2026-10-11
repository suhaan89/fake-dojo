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
  const resting = live.state !== "checking" && !isLive(live);
  const mock = live.state === "ready" && live.health.mock;
  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="status">
      {resting ? <span className="text-[13px] text-ink-soft">Live forge resting, try the Daily Dojo</span> : null}
      {mock ? (
        <span className="mono inline-flex min-h-[28px] items-center border border-ink px-2 text-[11px] uppercase tracking-wider">
          Mock mode
        </span>
      ) : null}
    </span>
  );
}
