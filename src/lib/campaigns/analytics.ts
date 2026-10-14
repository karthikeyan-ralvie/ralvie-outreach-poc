import { prisma } from "../prisma";

export async function campaignAnalytics(campaignId: string, workspaceId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId },
    include: { list: { include: { _count: { select: { contacts: true } } } } },
  });
  if (!campaign) return null;

  const calls = await prisma.call.findMany({
    where: { campaignId },
    select: {
      id: true,
      status: true,
      outcome: true,
      duration: true,
      scenarioTag: true,
      recordingSid: true,
      recordingUrl: true,
      intakeAnswers: true,
      createdAt: true,
      startedAt: true,
      crmLeads: { select: { scenario: { select: { name: true, slug: true } } } },
    },
  });

  const totalContacts = campaign.list._count.contacts;
  const dialed = calls.length;
  const remaining = Math.max(0, totalContacts - dialed);

  const byStatus: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  const byScenario: Record<string, number> = {};
  const byDay: Record<string, number> = {};

  let talkSeconds = 0;
  let durationCount = 0;
  let recordings = 0;
  let intakeFilled = 0;
  let answered = 0;

  for (const call of calls) {
    byStatus[call.status] = (byStatus[call.status] || 0) + 1;
    const outcome = call.outcome || call.status;
    byOutcome[outcome] = (byOutcome[outcome] || 0) + 1;

    const scenario =
      call.crmLeads[0]?.scenario.name ||
      (call.scenarioTag ? prettyScenario(call.scenarioTag) : null);
    if (scenario) byScenario[scenario] = (byScenario[scenario] || 0) + 1;

    const day = call.createdAt.toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;

    if (typeof call.duration === "number" && call.duration > 0) {
      talkSeconds += call.duration;
      durationCount += 1;
    }
    if (call.recordingSid || call.recordingUrl) recordings += 1;
    if (call.intakeAnswers && Object.keys(call.intakeAnswers as object).length) intakeFilled += 1;
    if (isAnswered(call.status, call.outcome)) answered += 1;
  }

  const connected = calls.filter((c) => c.status === "completed").length;
  const interested = byOutcome.interested || 0;
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

  return {
    campaignId,
    totalContacts,
    dialed,
    remaining,
    answered,
    connected,
    interested,
    recordings,
    intakeFilled,
    talkSeconds,
    avgDuration: durationCount ? Math.round(talkSeconds / durationCount) : 0,
    connectRate: pct(answered, dialed),
    completionRate: pct(connected, totalContacts),
    interestRate: pct(interested, answered || dialed),
    recordingRate: pct(recordings, connected || dialed),
    intakeRate: pct(intakeFilled, answered || dialed),
    byStatus: sortCounts(byStatus),
    byOutcome: sortCounts(byOutcome),
    byScenario: sortCounts(byScenario),
    byDay: Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, count]) => ({ label, count })),
  };
}

function isAnswered(status: string, outcome: string | null) {
  return ["completed", "in_progress"].includes(status) && !["no_answer", "busy", "failed", "voicemail"].includes(outcome || "");
}

function prettyScenario(tag: string) {
  return tag
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function sortCounts(map: Record<string, number>) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));
}

export async function campaignListSummaries(campaignIds: string[]) {
  const empty = { dialed: 0, connected: 0, answered: 0, interested: 0, connectRate: 0 };
  const map: Record<string, typeof empty> = {};
  for (const id of campaignIds) map[id] = { ...empty };
  if (!campaignIds.length) return map;

  const calls = await prisma.call.findMany({
    where: { campaignId: { in: campaignIds } },
    select: { campaignId: true, status: true, outcome: true },
  });

  for (const call of calls) {
    const row = map[call.campaignId];
    if (!row) continue;
    row.dialed += 1;
    if (call.status === "completed") row.connected += 1;
    if (call.outcome === "interested") row.interested += 1;
    if (isAnswered(call.status, call.outcome)) row.answered += 1;
  }
  for (const row of Object.values(map)) {
    row.connectRate = row.dialed ? Math.round((row.answered / row.dialed) * 1000) / 10 : 0;
  }
  return map;
}
