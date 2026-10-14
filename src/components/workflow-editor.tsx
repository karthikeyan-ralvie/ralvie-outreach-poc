"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { Button, Card, ErrorText, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";

type Agent = { id: string; name: string };
type Scenario = { id: string; name: string; slug: string; description: string | null };

const OUTCOMES = [
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not interested" },
  { value: "callback", label: "Callback" },
  { value: "completed", label: "Completed" },
  { value: "voicemail", label: "Voicemail" },
];

const SCENARIO_TEMPLATE = {
  subject: "Following up from our call, {first name}",
  body: `Hi {first name},

Thanks for speaking with us today about {{scenario}}.

Here's a quick recap:
{{summary}}

Details we noted:
{{answers}}

If you'd like to continue, just reply to this email.

Best`,
};

export function WorkflowEditor({ id }: { id: string | null }) {
  const router = useRouter();
  const search = useSearchParams();
  const presetScenario = search.get("scenario") || "";

  const [agents, setAgents] = useState<Agent[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    agentId: "",
    trigger: presetScenario ? "scenario" : "scenario",
    condition: presetScenario,
    emailSubject: SCENARIO_TEMPLATE.subject,
    emailBody: SCENARIO_TEMPLATE.body,
    enabled: true,
  });

  useEffect(() => {
    api<Agent[]>("/api/agents").then(setAgents).catch(() => setAgents([]));
    api<Scenario[]>("/api/crm/scenarios").then(setScenarios).catch(() => setScenarios([]));
    if (id) {
      api<{
        name: string;
        agentId: string | null;
        trigger: string;
        condition: string | null;
        emailSubject: string;
        emailBody: string;
        enabled: boolean;
      }>(`/api/workflows/${id}`).then((w) =>
        setForm({
          name: w.name,
          agentId: w.agentId || "",
          trigger: w.trigger,
          condition: w.condition || "",
          emailSubject: w.emailSubject,
          emailBody: w.emailBody,
          enabled: w.enabled,
        }),
      );
    } else if (presetScenario) {
      setForm((f) => ({
        ...f,
        trigger: "scenario",
        condition: presetScenario,
        name: `Email when ${presetScenario.replace(/_/g, " ")}`,
      }));
    }
  }, [id, presetScenario]);

  const selectedScenario = useMemo(
    () => scenarios.find((s) => s.slug === form.condition),
    [scenarios, form.condition],
  );

  function applyScenario(slug: string) {
    const s = scenarios.find((x) => x.slug === slug);
    setForm((f) => ({
      ...f,
      trigger: "scenario",
      condition: slug,
      name: f.name?.trim() ? f.name : s ? `Email — ${s.name}` : `Email when ${slug}`,
      emailSubject: f.emailSubject || SCENARIO_TEMPLATE.subject,
      emailBody: f.emailBody || SCENARIO_TEMPLATE.body,
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.trigger === "scenario" && !form.condition.trim()) {
      setError("Pick a CRM scenario for this email.");
      return;
    }
    if (form.trigger === "outcome" && !form.condition.trim()) {
      setError("Pick an outcome for this email.");
      return;
    }
    const payload = { ...form, agentId: form.agentId || null, condition: form.condition || null };
    try {
      if (id) await api(`/api/workflows/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      else {
        const created = await api<{ id: string }>("/api/workflows", { method: "POST", body: JSON.stringify(payload) });
        router.push(`/workflows/${created.id}`);
        return;
      }
      router.push("/workflows");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div>
      <PageHeader
        title={id ? "Edit email workflow" : "New email workflow"}
        description="Send a follow-up email after a call when a CRM scenario or outcome matches."
        actions={
          id ? (
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm("Delete workflow?")) return;
                await api(`/api/workflows/${id}`, { method: "DELETE" });
                router.push("/workflows");
              }}
            >
              Delete
            </Button>
          ) : null
        }
      />

      {!scenarios.length && form.trigger === "scenario" ? (
        <Card className="mb-4 border-amber-200 bg-amber-50 text-sm">
          No CRM scenarios yet.{" "}
          <Link href="/crm" className="underline">
            Create scenarios in CRM
          </Link>{" "}
          first (e.g. Interested, Book a demo), then attach an email here.
        </Card>
      ) : null}

      <form onSubmit={save} className="grid max-w-3xl gap-4">
        <Card className="grid gap-4">
          <Field label="Workflow name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>

          <Field label="When should this email send?">
            <Select
              value={form.trigger}
              onChange={(e) => {
                const trigger = e.target.value;
                setForm({
                  ...form,
                  trigger,
                  condition:
                    trigger === "always"
                      ? ""
                      : trigger === "scenario"
                        ? form.condition || scenarios[0]?.slug || ""
                        : form.condition || "interested",
                });
              }}
            >
              <option value="scenario">When a CRM scenario matches (recommended)</option>
              <option value="outcome">When call outcome matches</option>
              <option value="always">After every completed call</option>
            </Select>
          </Field>

          {form.trigger === "scenario" ? (
            <Field label="CRM scenario">
              <Select value={form.condition} onChange={(e) => applyScenario(e.target.value)} required>
                <option value="">Select scenario…</option>
                {scenarios.map((s) => (
                  <option key={s.id} value={s.slug}>
                    {s.name} ({s.slug})
                  </option>
                ))}
              </Select>
              {selectedScenario?.description ? (
                <p className="mt-1 text-xs text-ink-soft">{selectedScenario.description}</p>
              ) : (
                <p className="mt-1 text-xs text-ink-soft">
                  Emails send when the call is tagged with this scenario (from what the caller said).
                </p>
              )}
            </Field>
          ) : null}

          {form.trigger === "outcome" ? (
            <Field label="Call outcome">
              <Select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
                <option value="">Select outcome…</option>
                {OUTCOMES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Agent scope">
            <Select value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })}>
              <option value="">All agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </Card>

        <Card className="space-y-3">
          <p className="text-sm font-medium">Email content</p>
          <p className="text-xs text-ink-soft">
            Variables: {"{first name}"} {"{name}"} {"{email}"} {"{company}"} {"{phone}"} {"{outcome}"} {"{scenario}"}{" "}
            {"{summary}"} — plus intake answers as {"{answers}"} or individual keys if supported.
          </p>
          <Field label="Subject">
            <Input
              value={form.emailSubject}
              onChange={(e) => setForm({ ...form, emailSubject: e.target.value })}
              required
            />
          </Field>
          <Field label="Body">
            <Textarea
              className="min-h-48"
              value={form.emailBody}
              onChange={(e) => setForm({ ...form, emailBody: e.target.value })}
              required
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Enabled
          </label>
          <p className="text-xs text-ink-soft">
            Requires SMTP in Settings, and an email on the contact or collected during the call.
          </p>
        </Card>

        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-fit">
          Save email workflow
        </Button>
      </form>
    </div>
  );
}
