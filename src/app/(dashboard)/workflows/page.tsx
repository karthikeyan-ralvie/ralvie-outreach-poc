"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";

type Workflow = {
  id: string;
  name: string;
  trigger: string;
  condition: string | null;
  enabled: boolean;
  agent: { name: string } | null;
  _count: { runs: number };
};

function triggerLabel(w: Workflow) {
  if (w.trigger === "scenario") return `Scenario: ${w.condition || "—"}`;
  if (w.trigger === "outcome") return `Outcome: ${w.condition || "—"}`;
  if (w.trigger === "always") return "Every completed call";
  return w.trigger;
}

export default function WorkflowsPage() {
  const [items, setItems] = useState<Workflow[]>([]);
  useEffect(() => {
    api<Workflow[]>("/api/workflows").then(setItems);
  }, []);

  return (
    <div>
      <PageHeader
        title="Email workflows"
        description="Send follow-up emails after calls when a CRM scenario or outcome matches."
        actions={
          <Link href="/workflows/new">
            <Button>New scenario email</Button>
          </Link>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          title="No email workflows yet"
          body="Create one for “Interested” or any CRM scenario — after matching calls, the email sends automatically."
        />
      ) : (
        <div className="space-y-3">
          {items.map((w) => (
            <Link key={w.id} href={`/workflows/${w.id}`} className="block">
              <Card className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{w.name}</p>
                  <p className="text-sm text-ink-soft">
                    {triggerLabel(w)} · {w.agent?.name || "all agents"} · {w._count.runs} runs
                  </p>
                </div>
                <Badge tone={w.enabled ? "good" : "neutral"}>{w.enabled ? "on" : "off"}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
