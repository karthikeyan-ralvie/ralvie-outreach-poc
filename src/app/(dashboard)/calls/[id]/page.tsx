"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, statusTone } from "@/lib/client";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDate, formatDuration } from "@/lib/utils";

type Turn = { role: "agent" | "user"; text: string; at: string };
type Call = {
  id: string;
  status: string;
  outcome: string | null;
  scenarioTag: string | null;
  duration: number | null;
  recordingSid: string | null;
  recordingUrl: string | null;
  error: string | null;
  createdAt: string;
  transcript: Turn[] | null;
  intakeAnswers: Record<string, string> | null;
  contact: { name: string | null; phone: string; email: string | null; company: string | null };
  agent: { name: string };
  campaign: { name: string };
  workflowRuns: { id: string; status: string; error: string | null; workflow: { name: string } }[];
  crmLeads: { id: string; reason: string | null; scenario: { id: string; name: string } }[];
};

export default function CallDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [call, setCall] = useState<Call | null>(null);

  useEffect(() => {
    api<Call>(`/api/calls/${id}`).then(setCall);
  }, [id]);

  if (!call) return <p className="text-sm text-ink-soft">Loading…</p>;
  const turns = Array.isArray(call.transcript) ? call.transcript : [];
  const answers = call.intakeAnswers || {};
  const hasRecording = Boolean(call.recordingSid || call.recordingUrl);

  return (
    <div>
      <PageHeader
        title={call.contact.name || call.contact.phone}
        description={`${call.agent.name} · ${call.campaign.name} · ${formatDate(call.createdAt)}`}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone={statusTone(call.status)}>{call.status}</Badge>
        {call.outcome ? <Badge tone={statusTone(call.outcome)}>{call.outcome}</Badge> : null}
        {call.scenarioTag ? <Badge>{call.scenarioTag.replace(/_/g, " ")}</Badge> : null}
        <Badge>{formatDuration(call.duration)}</Badge>
      </div>
      {call.error ? <p className="mb-4 text-sm text-[#8f2d22]">{call.error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <p className="serif text-xl">Recording</p>
            {hasRecording ? (
              <div className="mt-3 space-y-3">
                <audio className="w-full" controls src={`/api/calls/${call.id}/recording`} />
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/api/calls/${call.id}/recording?download=1&format=mp3`}
                    className="inline-flex items-center rounded-full border border-line bg-white px-3 py-1.5 text-sm hover:border-clay hover:text-clay"
                  >
                    Download MP3
                  </a>
                  <a
                    href={`/api/calls/${call.id}/recording?download=1&format=wav`}
                    className="inline-flex items-center rounded-full border border-line bg-white px-3 py-1.5 text-sm hover:border-clay hover:text-clay"
                  >
                    Download WAV
                  </a>
                </div>
                <p className="text-xs text-ink-soft">
                  Voice recordings are audio files (MP3/WAV). Use MP3 for the smallest download.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">
                Recording is not available yet. It appears after Twilio finishes processing the call.
              </p>
            )}
          </Card>
          <Card className="space-y-3">
            <p className="serif text-xl">Transcript</p>
            {turns.length === 0 ? <p className="text-sm text-ink-soft">No turns recorded.</p> : null}
            {turns.map((t, i) => (
              <div
                key={i}
                className={`max-w-xl rounded-2xl px-4 py-3 text-sm ${t.role === "agent" ? "bg-paper-2" : "ml-auto border border-line bg-white"}`}
              >
                <p className="text-[11px] uppercase tracking-wide text-ink-soft">{t.role}</p>
                <p className="mt-1 whitespace-pre-wrap">{t.text}</p>
              </div>
            ))}
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <p className="serif text-xl">Contact</p>
            <p className="mt-2 text-sm">{call.contact.phone}</p>
            <p className="text-sm text-ink-soft">{call.contact.email || "No email"}</p>
            <p className="text-sm text-ink-soft">{call.contact.company || ""}</p>
          </Card>
          <Card>
            <p className="serif text-xl">CRM scenario</p>
            {call.crmLeads?.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {call.crmLeads.map((l) => (
                  <li key={l.id}>
                    <Link href="/crm" className="font-medium text-clay">
                      {l.scenario.name}
                    </Link>
                    <p className="text-ink-soft">{l.reason}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">No CRM scenario matched.</p>
            )}
          </Card>
          <Card>
            <p className="serif text-xl">Intake answers</p>
            {Object.keys(answers).length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">None collected.</p>
            ) : (
              <dl className="mt-2 space-y-1 text-sm">
                {Object.entries(answers).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-ink-soft">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
          <Card>
            <p className="serif text-xl">Workflows</p>
            {call.workflowRuns.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">No workflows fired.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {call.workflowRuns.map((r) => (
                  <li key={r.id} className="flex items-center justify-between">
                    <span>{r.workflow.name}</span>
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
