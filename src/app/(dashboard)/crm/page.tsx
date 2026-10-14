"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Badge, Button, Card, EmptyState, ErrorText, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { formatDate } from "@/lib/utils";

type Scenario = { id: string; name: string; slug: string; description: string | null; phrases: string; _count: { leads: number } };
type Lead = {
  id: string;
  reason: string | null;
  updatedAt: string;
  scenario: { id: string; name: string; slug: string };
  contact: { id: string; name: string | null; phone: string; email: string | null; company: string | null };
  call: {
    id: string;
    outcome: string | null;
    recordingSid: string | null;
    recordingUrl: string | null;
    agent: { name: string };
  } | null;
};

export default function CrmPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tab, setTab] = useState("all");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phrases, setPhrases] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  async function reload() {
    const [s, l] = await Promise.all([api<Scenario[]>("/api/crm/scenarios"), api<Lead[]>("/api/crm/leads")]);
    setScenarios(s);
    setLeads(l);
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (tab !== "all" && !scenarios.some((s) => s.id === tab)) setTab("all");
  }, [scenarios, tab]);

  const filtered = tab === "all" ? leads : leads.filter((l) => l.scenario.id === tab);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/crm/scenarios", {
        method: "POST",
        body: JSON.stringify({ name, description, phrases }),
      });
      setName("");
      setDescription("");
      setPhrases("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create scenario");
    }
  }

  return (
    <div>
      <PageHeader
        title="CRM"
        description="Define scenarios like “Book a demo”. When a caller matches, the lead lands in that tab."
      />
      <form onSubmit={create} className="mb-8 grid max-w-3xl gap-3 md:grid-cols-2">
        <Field label="Scenario name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Book a demo" required />
        </Field>
        <Field label="When it matches">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Caller wants a product demo"
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Phrases the AI should listen for">
            <Textarea
              className="min-h-20"
              value={phrases}
              onChange={(e) => setPhrases(e.target.value)}
              placeholder="I want a demo, book a demo, schedule a walkthrough, show me how it works"
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <ErrorText>{error}</ErrorText>
          <Button type="submit">Create scenario</Button>
        </div>
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        <TabButton active={tab === "all"} onClick={() => setTab("all")}>
          All ({leads.length})
        </TabButton>
        {scenarios.map((s) => (
          <TabButton key={s.id} active={tab === s.id} onClick={() => setTab(s.id)}>
            {s.name} ({s._count.leads})
          </TabButton>
        ))}
      </div>

      {tab !== "all" ? (
        <ScenarioEditor
          scenario={scenarios.find((s) => s.id === tab) || null}
          editing={editing === tab}
          onEdit={() => setEditing(tab)}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title={scenarios.length ? "No leads in this scenario yet" : "No scenarios yet"}
          body="Create “Book a demo”, then when someone asks for a demo on a call they appear here."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((lead) => (
            <Card key={lead.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{lead.contact.name || lead.contact.phone}</p>
                  <p className="text-sm text-ink-soft">
                    {lead.contact.company || "—"} · {lead.contact.phone}
                  </p>
                  {lead.contact.email ? <p className="text-xs text-ink-soft">{lead.contact.email}</p> : null}
                </div>
                <Badge>{lead.scenario.name}</Badge>
              </div>
              <p className="mt-3 text-sm text-ink-soft">{lead.reason || "Matched from the call"}</p>
              <p className="mt-1 text-xs text-ink-soft">
                {lead.call ? `${lead.call.agent.name} · ${formatDate(lead.updatedAt)}` : formatDate(lead.updatedAt)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {lead.call ? (
                  <Link href={`/calls/${lead.call.id}`} className="text-sm text-clay">
                    Call & transcript
                  </Link>
                ) : null}
                <Link
                  href={`/workflows/new?scenario=${encodeURIComponent(lead.scenario.slug)}`}
                  className="text-sm text-clay"
                >
                  Email for this scenario
                </Link>
                <select
                  className="rounded-full border border-line bg-white px-2 py-1 text-xs"
                  value={lead.scenario.id}
                  onChange={async (e) => {
                    await api(`/api/crm/leads/${lead.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ scenarioId: e.target.value }),
                    });
                    reload();
                  }}
                >
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      Move to {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm ${active ? "bg-ink text-paper" : "border border-line bg-white text-ink-soft"}`}
    >
      {children}
    </button>
  );
}

function ScenarioEditor({
  scenario,
  editing,
  onEdit,
  onCancel,
  onSaved,
}: {
  scenario: Scenario | null;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(scenario?.name || "");
  const [description, setDescription] = useState(scenario?.description || "");
  const [phrases, setPhrases] = useState(scenario?.phrases || "");

  useEffect(() => {
    setName(scenario?.name || "");
    setDescription(scenario?.description || "");
    setPhrases(scenario?.phrases || "");
  }, [scenario?.id, scenario?.name, scenario?.description, scenario?.phrases]);

  if (!scenario) return null;

  if (!editing) {
    return (
      <Card className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-soft">This tab</p>
          <p className="font-medium">{scenario.name}</p>
          <p className="mt-1 text-sm text-ink-soft">{scenario.description || "No description"}</p>
          <p className="mt-1 text-xs text-ink-soft">Listen for: {scenario.phrases}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/workflows/new?scenario=${encodeURIComponent(scenario.slug)}`}>
            <Button variant="secondary">Email when matched</Button>
          </Link>
          <Button variant="secondary" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirm("Delete this scenario and its leads?")) return;
              await api(`/api/crm/scenarios/${scenario.id}`, { method: "DELETE" });
              onSaved();
            }}
          >
            Delete
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-6 space-y-3">
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="When it matches">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Phrases">
        <Textarea value={phrases} onChange={(e) => setPhrases(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button
          onClick={async () => {
            await api(`/api/crm/scenarios/${scenario.id}`, {
              method: "PATCH",
              body: JSON.stringify({ name, description, phrases }),
            });
            onSaved();
          }}
        >
          Save scenario
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
