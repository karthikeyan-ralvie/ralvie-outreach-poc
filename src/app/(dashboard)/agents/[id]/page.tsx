"use client";

import { useParams } from "next/navigation";
import { AgentEditor } from "@/components/agent-editor";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <AgentEditor id={id} />;
}
