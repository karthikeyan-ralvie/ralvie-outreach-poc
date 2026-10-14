"use client";

import { useParams } from "next/navigation";
import { WorkflowEditor } from "@/components/workflow-editor";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <WorkflowEditor id={id} />;
}
