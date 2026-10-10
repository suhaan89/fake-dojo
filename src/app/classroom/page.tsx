import type { Metadata } from "next";
import { Suspense } from "react";
import { ClassroomClient } from "./ClassroomClient";

export const metadata: Metadata = {
  title: "Classroom",
  description: "Projector mode: the class votes Real or Edited by raising hands, then the reveal.",
};

export default function ClassroomPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-paper" aria-busy="true" />}>
      <ClassroomClient />
    </Suspense>
  );
}
