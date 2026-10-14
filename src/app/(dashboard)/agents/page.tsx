"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";

type Agent = {
  id: string;
  name: string;
  role: string;
  language: string;
  elevenlabsVoiceId: string | null;
  intakeForm: { _count: { questions: number } } | null;
  ownedKnowledgeBase: { _count: { docs: number } } | null;
};

export default function AgentsPage() {
  const [items, setItems] = useState<Agent[]>([]);
  useEffect(() => {
    api<Agent[]>("/api/agents").then(setItems);
  }, []);

  return (
    <div>
      <PageHeader
        title="Agents"
        description="Each agent has its own greeting, knowledge, FAQs, and intake questions."
        actions={
          <Link href="/agents/new">
            <Button>New agent</Button>
          </Link>
        }
      />
      {items.length === 0 ? (
        <EmptyState title="No agents" body="Create an agent and set up everything it knows and asks on the call." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((a) => (
            <Link key={a.id} href={`/agents/${a.id}`}>
              <Card>
                <div className="flex items-center justify-between">
                  <p className="font-medium">{a.name}</p>
                  <Badge>{a.role}</Badge>
                </div>
                <p className="mt-2 text-sm text-ink-soft">
                  {a.ownedKnowledgeBase?._count.docs || 0} knowledge sources · {a.intakeForm?._count.questions || 0}{" "}
                  intake questions
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  {a.language} · {a.elevenlabsVoiceId ? "Voice set" : "No voice"}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
