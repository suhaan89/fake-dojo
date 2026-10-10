import type { Metadata } from "next";
import { Suspense } from "react";
import { ForgeClient } from "./ForgeClient";

export const metadata: Metadata = {
  title: "Forge",
  description: "Upload a photo. An AI agent hides one realistic edit in it. Find it.",
};

export default function ForgePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-busy="true" />}>
      <ForgeClient />
    </Suspense>
  );
}
