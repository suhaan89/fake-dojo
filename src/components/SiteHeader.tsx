"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScoreHud } from "@/components/ScoreHud";

const LINKS = [
  { href: "/forge", label: "Forge" },
  { href: "/dojo", label: "Daily Dojo" },
  { href: "/classroom", label: "Classroom" },
  { href: "/profile", label: "Profile" },
  { href: "/how-it-works", label: "How it works" },
];

export function SiteHeader() {
  const pathname = usePathname();
  if (pathname === "/classroom") return null;
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 px-4 sm:px-6">
        <Link
          href="/"
          className="flex min-h-[44px] items-center gap-2 text-[1.05rem] font-semibold tracking-tight"
        >
          <span aria-hidden className="inline-block h-3 w-3 bg-edited" />
          Fake Dojo
        </Link>
        <nav aria-label="Main" className="-mx-2 flex flex-wrap items-center text-sm">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[44px] items-center px-2 sm:px-3 ${
                  active
                    ? "font-medium text-ink underline decoration-2 underline-offset-8"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="py-1.5">
          <ScoreHud />
        </div>
      </div>
    </header>
  );
}
