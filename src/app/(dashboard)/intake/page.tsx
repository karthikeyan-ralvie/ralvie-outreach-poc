"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Button, Card, EmptyState, Field, Input, PageHeader } from "@/components/ui";

type Form = { id: string; name: string; questions: { id: string }[]; _count: { agents: number } };

export default function IntakeListPage() {
  const [items, setItems] = useState<Form[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    api<Form[]>("/api/intake").then(setItems);
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const item = await api<Form>("/api/intake", { method: "POST", body: JSON.stringify({ name, questions: [] }) });
    window.location.href = `/intake/${item.id}`;
  }

  return (
    <div>
      <PageHeader title="Intake forms" description="Scenario questions the agent should collect during the call." />
      <form onSubmit={create} className="mb-8 flex max-w-lg gap-3">
        <Field label="New form">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Discovery call" required />
        </Field>
        <Button type="submit" className="mt-6">Create</Button>
      </form>
      {items.length === 0 ? (
        <EmptyState title="No forms yet" body="Create a form, add questions, then attach it to an agent." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((f) => (
            <Link key={f.id} href={`/intake/${f.id}`}>
              <Card>
                <p className="font-medium">{f.name}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  {f.questions.length} questions · {f._count.agents} agents
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
