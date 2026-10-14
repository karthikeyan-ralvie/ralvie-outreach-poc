"use client";

import { Suspense } from "react";
import { WorkflowEditor } from "@/components/workflow-editor";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-soft">Loading…</p>}>
      <WorkflowEditor id={null} />
    </Suspense>
  );
}
