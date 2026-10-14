"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, statusTone } from "@/lib/client";
import { Badge, Button, Card, ErrorText, PageHeader } from "@/components/ui";
import { formatDate, formatDuration } from "@/lib/utils";

type Count = { label: string; count: number };
type Analytics = {
  totalContacts: number;
  dialed: number;
  remaining: number;
  answered: number;
  connected: number;
  interested: number;
  recordings: number;
  intakeFilled: number;
  talkSeconds: number;
  avgDuration: number;
  connectRate: number;
  completionRate: number;
  interestRate: number;
  recordingRate: number;
  intakeRate: number;
  byStatus: Count[];
  byOutcome: Count[];
  byScenario: Count[];
  byDay: Count[];
};

type Campaign = {
  id: string;
  name: string;
  status: string;
  concurrency: number;
  agent: { name: string };
  list: { name: string; _count: { contacts: number } };
  analytics?: Analytics | null;
  calls: {
    id: string;
    status: string;
    outcome: string | null;
    scenarioTag?: string | null;
    recordingSid?: string | null;
    recordingUrl?: string | null;
    createdAt: string;
    error: string | null;
    contact: { name: string | null; phone: string };
  }[];
};

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [tab, setTab] = useState<"analytics" | "calls">("analytics");
  const [error, setError] = useState("");

  async function reload(lite = false) {
    const next = await api<Campaign>(`/api/campaigns/${id}${lite ? "?lite=1" : ""}`);
    setCampaign((prev) => ({
      ...next,
      analytics: next.analytics ?? prev?.analytics ?? null,
    }));
  }

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let ticks = 0;
    async function tick(lite: boolean) {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        await reload(lite);
      } finally {
        inFlight = false;
      }
    }
    tick(false);
    // Lite poll for call list; every 3rd tick (~24s) refresh full analytics (CRM scenarios, outcomes)
    const t = setInterval(() => {
      ticks += 1;
      tick(ticks % 3 !== 0);
    }, 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id]);

  async function control(action: string) {
    setError("");
    try {
      await api(`/api/campaigns/${id}/control`, { method: "POST", body: JSON.stringify({ action }) });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  if (!campaign) return <p className="text-sm text-ink-soft">Loading…</p>;
  const a: Analytics = campaign.analytics ?? {
    totalContacts: campaign.list._count.contacts,
    dialed: campaign.calls.length,
    remaining: Math.max(0, campaign.list._count.contacts - campaign.calls.length),
    answered: 0,
    connected: 0,
    interested: 0,
    recordings: 0,
    intakeFilled: 0,
    talkSeconds: 0,
    avgDuration: 0,
    connectRate: 0,
    completionRate: 0,
    interestRate: 0,
    recordingRate: 0,
    intakeRate: 0,
    byStatus: [],
    byOutcome: [],
    byScenario: [],
    byDay: [],
  };

  return (
    <div>
      <PageHeader
        title={campaign.name}
        description={`${campaign.agent.name} calling ${campaign.list.name}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {campaign.status !== "running" ? (
              <Button onClick={() => control("start")}>Start</Button>
            ) : (
              <Button variant="secondary" onClick={() => control("pause")}>
                Pause
              </Button>
            )}
            <Button variant="secondary" onClick={() => control("stop")}>
              Stop
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                if (
                  !confirm(
                    "Restart this campaign? Call history for this campaign will be cleared and the list will be dialed from the start.",
                  )
                ) {
                  return;
                }
                await control("restart");
              }}
            >
              Restart
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                setError("");
                try {
                  const copy = await api<{ id: string }>(`/api/campaigns/${id}/control`, {
                    method: "POST",
                    body: JSON.stringify({ action: "duplicate" }),
                  });
                  router.push(`/campaigns/${copy.id}`);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not duplicate");
                }
              }}
            >
              Duplicate
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm("Delete campaign?")) return;
                await api(`/api/campaigns/${id}`, { method: "DELETE" });
                router.push("/campaigns");
              }}
            >
              Delete
            </Button>
          </div>
        }
      />
      <ErrorText>{error}</ErrorText>
      {campaign.calls[0]?.status === "ringing" || campaign.calls[0]?.status === "queued" ? (
        <p className="mb-4 text-sm text-ink-soft">
          “Ringing” means Twilio accepted the dial. It does not guarantee your handset is ringing. If the phone stays silent, check that this number is verified in Twilio (trial accounts), geographic permissions are on, and Truecaller/DND is not silencing unknown callers.
        </p>
      ) : null}
      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("analytics")}
          className={`rounded-full px-3 py-1.5 text-sm ${tab === "analytics" ? "bg-ink text-paper" : "border border-line bg-white"}`}
        >
          Analytics
        </button>
        <button
          type="button"
          onClick={() => setTab("calls")}
          className={`rounded-full px-3 py-1.5 text-sm ${tab === "calls" ? "bg-ink text-paper" : "border border-line bg-white"}`}
        >
          Calls ({campaign.calls.length})
        </button>
      </div>

      {tab === "analytics" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Dialed" value={`${a.dialed}/${a.totalContacts}`} hint={`${a.remaining} remaining`} />
            <Stat label="Connect rate" value={`${a.connectRate}%`} hint={`${a.answered} answered`} />
            <Stat label="Interested" value={`${a.interestRate}%`} hint={`${a.interested} leads`} />
            <Stat label="Avg talk time" value={formatDuration(a.avgDuration)} hint={`${formatDuration(a.talkSeconds)} total`} />
            <Stat label="Recordings" value={String(a.recordings)} hint={`${a.recordingRate}% of connected`} />
            <Stat label="Intake captured" value={String(a.intakeFilled)} hint={`${a.intakeRate}% of answered`} />
            <Stat label="Completed" value={String(a.connected)} hint={`${a.completionRate}% of list`} />
            <Stat
              label="Status"
              value={<Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge>}
              hint={`Concurrency ${campaign.concurrency}`}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Breakdown title="Outcomes" rows={a.byOutcome} total={a.dialed} />
            <Breakdown
              title="CRM scenarios"
              rows={a.byScenario}
              total={a.dialed}
              empty="No scenario tags yet. They appear when a call matches a CRM scenario or the agent sets a scenario tag."
            />
            <Breakdown title="Call status" rows={a.byStatus} total={a.dialed} />
            <Breakdown title="Volume by day" rows={a.byDay} total={a.dialed} empty="No dials yet." />
          </div>
          <p className="text-xs text-ink-soft">Analytics refresh every few seconds. Keep this page open while the campaign is live.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {campaign.calls.length === 0 ? (
            <Card className="text-sm text-ink-soft">No calls in this campaign yet.</Card>
          ) : (
            campaign.calls.map((c) => (
              <Link key={c.id} href={`/calls/${c.id}`} className="block">
                <Card className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{c.contact.name || c.contact.phone}</p>
                    <p className="text-xs text-ink-soft">
                      {c.contact.phone} · {formatDate(c.createdAt)}
                      {c.scenarioTag ? ` · ${c.scenarioTag.replace(/_/g, " ")}` : ""}
                      {c.recordingSid || c.recordingUrl ? " · recording" : ""}
                    </p>
                    {c.error ? <p className="mt-1 max-w-md text-xs text-[#8f2d22]">{c.error}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={statusTone(c.outcome || c.status)}>{c.outcome || c.status}</Badge>
                    {c.scenarioTag ? <Badge>{c.scenarioTag.replace(/_/g, " ")}</Badge> : null}
                  </div>
                </Card>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-ink-soft">{label}</p>
      <div className="serif mt-1 text-3xl">{value}</div>
      {hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
    </Card>
  );
}

function Breakdown({
  title,
  rows,
  total,
  empty,
}: {
  title: string;
  rows: Count[];
  total: number;
  empty?: string;
}) {
  const max = rows[0]?.count || 1;
  return (
    <Card>
      <p className="serif text-xl">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">{empty || "Nothing to show yet."}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li key={row.label}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="capitalize">{row.label.replace(/_/g, " ")}</span>
                <span className="text-ink-soft">
                  {row.count}
                  {total ? ` · ${Math.round((row.count / total) * 100)}%` : ""}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-paper-2">
                <div
                  className="h-full rounded-full bg-clay"
                  style={{ width: `${Math.max(6, (row.count / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
