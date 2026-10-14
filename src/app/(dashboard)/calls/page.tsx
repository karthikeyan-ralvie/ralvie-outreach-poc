"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, statusTone } from "@/lib/client";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatDuration } from "@/lib/utils";

type Call = {
  id: string;
  status: string;
  outcome: string | null;
  scenarioTag: string | null;
  duration: number | null;
  recordingSid: string | null;
  recordingUrl: string | null;
  createdAt: string;
  contact: { name: string | null; phone: string };
  agent: { name: string };
  campaign: { name: string };
};

export default function CallsPage() {
  const [items, setItems] = useState<Call[]>([]);
  useEffect(() => {
    api<Call[]>("/api/calls").then(setItems);
  }, []);

  return (
    <div>
      <PageHeader title="Calls" description="Recording, transcript, and the CRM scenario each conversation matched." />
      {items.length === 0 ? (
        <EmptyState title="No calls yet" body="Start a campaign to see live and completed calls here." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-2 text-xs uppercase text-ink-soft">
              <tr>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Scenario</th>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Recording</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-4 py-2">
                    <Link href={`/calls/${c.id}`} className="font-medium hover:text-clay">
                      {c.contact.name || c.contact.phone}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{c.agent.name}</td>
                  <td className="px-4 py-2">{c.scenarioTag ? <Badge>{c.scenarioTag.replace(/_/g, " ")}</Badge> : "—"}</td>
                  <td className="px-4 py-2 text-ink-soft">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-2">{formatDuration(c.duration)}</td>
                  <td className="px-4 py-2">
                    {c.recordingSid || c.recordingUrl ? (
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/calls/${c.id}`} className="text-clay hover:underline">
                          Play
                        </Link>
                        <a
                          href={`/api/calls/${c.id}/recording?download=1&format=mp3`}
                          className="text-clay hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          MP3
                        </a>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={statusTone(c.outcome || c.status)}>{c.outcome || c.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
