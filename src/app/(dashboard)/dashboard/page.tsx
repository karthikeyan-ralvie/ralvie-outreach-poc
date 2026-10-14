"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, statusTone } from "@/lib/client";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";

type Stats = {
  agents: number;
  contacts: number;
  campaigns: number;
  calls: number;
  running: number;
  recent: {
    id: string;
    status: string;
    outcome: string | null;
    createdAt: string;
    contact: { name: string | null; phone: string };
    agent: { name: string };
    campaign: { name: string };
  }[];
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api<Stats>("/api/stats").then(setStats).catch(() => setStats(null));
  }, []);

  const cards = [
    ["Agents", stats?.agents ?? "—"],
    ["Contacts", stats?.contacts ?? "—"],
    ["Campaigns", stats?.campaigns ?? "—"],
    ["Live campaigns", stats?.running ?? "—"],
    ["Calls", stats?.calls ?? "—"],
  ];

  return (
    <div>
      <PageHeader title="Overview" description="Create an agent with its own knowledge and intake, then start a campaign." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs uppercase tracking-wide text-ink-soft">{label}</p>
            <p className="serif mt-2 text-4xl">{value}</p>
          </Card>
        ))}
      </div>
      <div className="mt-8">
        <h2 className="serif text-2xl">Recent calls</h2>
        <div className="mt-3 space-y-2">
          {stats?.recent.length ? (
            stats.recent.map((c) => (
              <Link key={c.id} href={`/calls/${c.id}`} className="block">
                <Card className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{c.contact.name || c.contact.phone}</p>
                    <p className="text-xs text-ink-soft">
                      {c.agent.name} · {c.campaign.name} · {formatDate(c.createdAt)}
                    </p>
                  </div>
                  <Badge tone={statusTone(c.outcome || c.status)}>{c.outcome || c.status}</Badge>
                </Card>
              </Link>
            ))
          ) : (
            <Card className="text-sm text-ink-soft">No calls yet. Create an agent and start a campaign.</Card>
          )}
        </div>
      </div>
    </div>
  );
}
