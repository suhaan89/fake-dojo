import Link from "next/link";

export const GITHUB_URL = "https://github.com/suhaan89/fake-dojo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Built at Banana Hacks 2026 by Suhan Nawaz.</p>
        <nav aria-label="Footer" className="-mx-2 flex flex-wrap">
          <Link href="/how-it-works" className="flex min-h-[44px] items-center px-2 hover:text-ink">
            How it works
          </Link>
          <a href={GITHUB_URL} className="flex min-h-[44px] items-center px-2 hover:text-ink" rel="noreferrer">
            Source on GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
