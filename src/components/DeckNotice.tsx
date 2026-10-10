import Link from "next/link";

/** Shown by the deck modes while the deck loads, fails or holds no cards. */
export function DeckNotice({ kind }: { kind: "loading" | "error" | "empty" }) {
  if (kind === "loading") {
    return (
      <div className="panel p-6" role="status">
        <p className="mono text-sm text-ink-soft">Loading the deck...</p>
      </div>
    );
  }
  return (
    <div className="border-l-4 border-edited bg-card px-5 py-5" role="alert">
      <p className="text-lg font-medium">
        {kind === "error" ? "The deck could not be loaded." : "There are no training cards in the deck yet."}
      </p>
      <p className="mt-1 max-w-xl leading-relaxed text-ink-soft">
        {kind === "error"
          ? "Check your connection and reload the page."
          : "The deck is built from real photos with the seed script. Until it is filled you can forge a photo of your own."}
      </p>
      <Link href="/forge" className="btn mt-4">
        Forge your photo
      </Link>
    </div>
  );
}
