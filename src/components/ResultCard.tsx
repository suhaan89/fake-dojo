import { postProcessFor } from "@/lib/game/difficulty";
import { TELLS } from "@/lib/game/tells";
import { TYPE_LABELS, type ManipulationType } from "@/lib/game/types";

export interface ResultFacts {
  type: ManipulationType;
  difficulty: number;
  targetDescription: string;
  /** One sentence saying what was changed. */
  description: string;
  tell: string;
  changedPct: number | null;
  plausibility: number | null;
  obviousness: number | null;
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line px-4 py-3.5 first:border-t-0">
      <dt className="label">{term}</dt>
      <dd className="mt-1.5 leading-relaxed">{children}</dd>
    </div>
  );
}

/** What changed, the tell, and how the traces were treated. */
export function ResultCard({ facts }: { facts: ResultFacts }) {
  const post = postProcessFor(facts.difficulty);
  return (
    <section className="panel" aria-label="What changed">
      <dl>
        <Row term="What changed">
          <span className="font-medium">{TYPE_LABELS[facts.type]}:</span> {facts.targetDescription}
          {facts.description ? <span className="mt-1 block text-ink-soft">{facts.description}</span> : null}
        </Row>
        <Row term="The tell">
          <span className="text-lg font-medium leading-snug">{facts.tell}</span>
          <span className="mt-2 block text-sm text-ink-soft">{TELLS[facts.type]}</span>
        </Row>
      </dl>
      <details className="border-t border-line">
        <summary className="label flex min-h-[44px] cursor-pointer items-center px-4">Forensics and numbers</summary>
        <div className="px-4 pb-4">
          <p className="leading-relaxed">{post.note}</p>
          <p className="mono mt-3 text-[13px] leading-6">
            Difficulty {facts.difficulty} of 5
            {facts.changedPct !== null ? (
              <>
                <br />
                {facts.changedPct.toFixed(2)}% of the pixels changed
              </>
            ) : null}
            {facts.plausibility !== null && facts.obviousness !== null ? (
              <>
                <br />
                Verifier: plausibility {facts.plausibility} of 5, obviousness {facts.obviousness} of 5
              </>
            ) : null}
            <br />
            Saved as JPEG quality {post.jpegQuality}
            {post.noiseSigma > 0 ? `, noise sigma ${post.noiseSigma}` : ""}
          </p>
        </div>
      </details>
    </section>
  );
}
