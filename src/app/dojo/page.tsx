import type { Metadata } from "next";
import { Suspense } from "react";
import { DojoClient } from "./DojoClient";

export const metadata: Metadata = {
  title: "Daily Dojo",
  description: "Ten photos. Some are real, some were edited by AI. Call it, then find the edit.",
};

export default function DojoPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-busy="true" />}>
      <DojoClient />
    </Suspense>
  );
}
