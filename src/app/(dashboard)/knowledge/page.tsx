"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Button, Card, EmptyState, ErrorText, Field, Input, PageHeader, Textarea } from "@/components/ui";

type KB = {
  id: string;
  name: string;
  description: string | null;
  _count: { docs: number; agents: number };
};

export default function KnowledgePage() {
  const [items, setItems] = useState<KB[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  function reload() {
    api<KB[]>("/api/knowledge").then(setItems);
  }

  useEffect(() => {
    reload();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const item = await api<KB>("/api/knowledge", { method: "POST", body: JSON.stringify({ name, description }) });
      setName("");
      setDescription("");
      window.location.href = `/knowledge/${item.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create");
    }
  }

  return (
    <div>
      <PageHeader title="Knowledge" description="FAQs, pasted notes, and website sync. Attach a base to an agent." />
      <form onSubmit={create} className="mb-8 grid max-w-xl gap-3">
        <Field label="New knowledge base">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product FAQ" required />
        </Field>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-fit">Create</Button>
      </form>
      {items.length === 0 ? (
        <EmptyState title="Nothing here yet" body="Create a knowledge base, then add FAQs or sync your website." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((kb) => (
            <Link key={kb.id} href={`/knowledge/${kb.id}`}>
              <Card>
                <p className="font-medium">{kb.name}</p>
                <p className="mt-1 text-sm text-ink-soft">{kb.description || "No description"}</p>
                <p className="mt-3 text-xs text-ink-soft">
                  {kb._count.docs} sources · used by {kb._count.agents} agents
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
