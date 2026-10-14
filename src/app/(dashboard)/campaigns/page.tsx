"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, statusTone } from "@/lib/client";
import { Badge, Button, Card, EmptyState, ErrorText, Field, Input, PageHeader, Select } from "@/components/ui";

type Agent = { id: string; name: string };
type List = { id: string; name: string; _count: { contacts: number } };
type Campaign = {
  id: string;
  name: string;
  status: string;
  concurrency: number;
  agent: { name: string };
  list: { name: string; _count: { contacts: number } };
  _count: { calls: number };
  analytics?: { dialed: number; connected: number; interested: number; connectRate: number };
};

export default function CampaignsPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [listId, setListId] = useState("");
  const [concurrency, setConcurrency] = useState("1");
  const [error, setError] = useState("");

  function reload() {
    api<Campaign[]>("/api/campaigns").then(setItems);
  }

  useEffect(() => {
    reload();
    api<Agent[]>("/api/agents").then(setAgents);
    api<List[]>("/api/contacts").then(setLists);
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const created = await api<{ id: string }>("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({ name, agentId, listId, concurrency: Number(concurrency) }),
      });
      window.location.href = `/campaigns/${created.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create campaign");
    }
  }

  return (
    <div>
      <PageHeader title="Campaigns" description="Each campaign has its own analytics: connect rate, outcomes, scenarios, and talk time." />
      <form onSubmit={create} className="mb-8 grid max-w-3xl gap-3 md:grid-cols-2">
        <Field label="Campaign name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Concurrency">
          <Input type="number" min={1} max={10} value={concurrency} onChange={(e) => setConcurrency(e.target.value)} />
        </Field>
        <Field label="Agent">
          <Select value={agentId} onChange={(e) => setAgentId(e.target.value)} required>
            <option value="">Select</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contact list">
          <Select value={listId} onChange={(e) => setListId(e.target.value)} required>
            <option value="">Select</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l._count.contacts})
              </option>
            ))}
          </Select>
        </Field>
        <div className="md:col-span-2">
          <ErrorText>{error}</ErrorText>
          <Button type="submit">Create campaign</Button>
        </div>
      </form>
      {items.length === 0 ? (
        <EmptyState title="No campaigns" body="Create one after you have an agent and a contact list." />
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <Card key={c.id} className="flex items-center justify-between gap-4">
              <Link href={`/campaigns/${c.id}`} className="min-w-0 flex-1">
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-ink-soft">
                  {c.agent.name} · {c.list.name} · {c.analytics?.dialed ?? c._count.calls}/{c.list._count.contacts} dialed
                </p>
                <p className="mt-2 flex flex-wrap gap-3 text-xs text-ink-soft">
                  <span>{c.analytics?.connectRate ?? 0}% connect</span>
                  <span>{c.analytics?.connected ?? 0} completed</span>
                  <span>{c.analytics?.interested ?? 0} interested</span>
                </p>
              </Link>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                <Button
                  variant="secondary"
                  className="px-3 py-1 text-xs"
                  onClick={async (e) => {
                    e.preventDefault();
                    setError("");
                    try {
                      const copy = await api<{ id: string }>(`/api/campaigns/${c.id}/control`, {
                        method: "POST",
                        body: JSON.stringify({ action: "duplicate" }),
                      });
                      window.location.href = `/campaigns/${copy.id}`;
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Could not duplicate");
                    }
                  }}
                >
                  Duplicate
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
