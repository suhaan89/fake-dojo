"use client";

import { STEP_LABELS, type EntryStatus, type TimelineEntry } from "@/lib/forge/run";

function formatMs(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Text that would spoil the answer. Before the reveal only a solid ink bar is rendered and
 * the secret is not in the DOM at all. After the reveal the text appears and the bar slides away.
 */
export function Redacted({ text, revealed }: { text: string; revealed: boolean }) {
  if (!revealed) {
    const width = Math.min(18, Math.max(4, Math.round(text.length * 0.7)));
    return (
      <span className="redacted-bar" style={{ width: `${width}ch` }}>
        <span className="sr-only">redacted</span>
      </span>
    );
  }
  return <span className="redacted-open">{text}</span>;
}

const STATUS_MARK: Record<EntryStatus, string> = {
  running: "bg-transparent border-ink animate-pulse",
  done: "bg-ink border-ink",
  rejected: "bg-edited border-edited",
  failed: "bg-transparent border-edited",
};

const STATUS_WORD: Record<EntryStatus, string> = {
  running: "running",
  done: "done",
  rejected: "rejected",
  failed: "failed",
};

interface AgentTimelineProps {
  entries: readonly TimelineEntry[];
  revealed: boolean;
  title?: string;
}

/** The agent log: real steps with measured durations, redacted until the reveal. */
export function AgentTimeline({ entries, revealed, title = "Agent log" }: AgentTimelineProps) {
  return (
    <section aria-label={title} className="panel">
      <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="label">{title}</h2>
        <span className="label">{revealed ? "Unredacted" : "Redacted until the reveal"}</span>
      </header>
      <ol className="divide-y divide-line">
        {entries.map((entry) => (
          <li key={entry.key} className="rise grid grid-cols-[14px_1fr_auto] gap-x-3 px-4 py-3">
            <span aria-hidden className={`mt-[5px] h-2.5 w-2.5 border ${STATUS_MARK[entry.status]}`} />
            <div className="min-w-0">
              <p className="label">
                {STEP_LABELS[entry.step]}
                <span className="sr-only">, {STATUS_WORD[entry.status]}</span>
                {entry.status === "rejected" ? <span className="ml-2 text-edited-ink">Rejected</span> : null}
                {entry.status === "failed" ? <span className="ml-2 text-edited-ink">Failed</span> : null}
              </p>
              <p className="mono mt-1 break-words text-[13px] leading-relaxed text-ink">
                {entry.text.map((segment, index) =>
                  typeof segment === "string" ? (
                    <span key={index}>{segment}</span>
                  ) : (
                    <Redacted key={index} text={segment.secret} revealed={revealed} />
                  ),
                )}
              </p>
            </div>
            <span className="mono pt-[1px] text-right text-[12px] text-ink-soft">
              {entry.status === "running" ? "..." : formatMs(entry.ms)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
