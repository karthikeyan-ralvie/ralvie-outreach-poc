import { prisma } from "../prisma";
import { slugKey } from "../utils";

type TranscriptTurn = { role?: string; text?: string };

export type ScenarioRow = {
  id: string;
  name: string;
  slug: string;
  phrases: string;
  description: string | null;
};

export function parsePhrases(raw: string) {
  return raw
    .split(/[\n,]/)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 1);
}

export function matchScenario(
  scenarios: ScenarioRow[],
  opts: {
    tag?: string | null;
    transcript?: TranscriptTurn[] | unknown;
    extraText?: string | null;
    /** Require multi-word / stronger phrases for these slugs (avoids "demo" false hits). */
    strictSlugs?: string[];
  },
) {
  if (!scenarios.length) return null;
  const tag = (opts.tag || "").trim();
  if (tag) {
    const slug = slugKey(tag);
    const exact =
      scenarios.find((s) => s.slug === tag || s.slug === slug) ||
      scenarios.find((s) => slugKey(s.name) === slug) ||
      scenarios.find((s) => s.name.toLowerCase() === tag.toLowerCase());
    if (exact) return { scenario: exact, reason: `Matched scenario "${exact.name}"` };
  }

  const turns = Array.isArray(opts.transcript) ? (opts.transcript as TranscriptTurn[]) : [];
  // Only match on what the caller said — agent script often contains scenario phrases
  const userBits = turns
    .filter((t) => !t.role || t.role === "user")
    .map((t) => t.text || "")
    .join(" ");
  const text = `${userBits}\n${opts.extraText || ""}`.toLowerCase();
  const strict = new Set((opts.strictSlugs || []).map((s) => s.toLowerCase()));
  let best: ScenarioRow | null = null;
  let bestScore = 0;
  let hit = "";
  for (const s of scenarios) {
    const phrases = [...parsePhrases(s.phrases), s.name.toLowerCase()];
    for (const phrase of phrases) {
      if (phrase.length <= 2 || !text.includes(phrase)) continue;
      // For strict scenarios, ignore weak / curiosity phrases
      const words = phrase.split(/\s+/).filter(Boolean).length;
      if (strict.has(s.slug)) {
        if (words < 2) continue;
        if (
          /^(tell me more|have a minute|i have a minute|sounds good|sounds great|yes please|go ahead|send it over|email me|demo)$/i.test(
            phrase,
          )
        ) {
          continue;
        }
      }
      const score = words;
      if (score > bestScore) {
        best = s;
        bestScore = score;
        hit = phrase;
      }
    }
  }
  if (best && bestScore > 0) {
    return { scenario: best, reason: `Heard “${hit}”` };
  }
  return null;
}

export async function assignCrmLead(opts: {
  workspaceId: string;
  contactId: string;
  callId: string;
  tag?: string | null;
  transcript?: unknown;
  extraText?: string | null;
}) {
  const scenarios = await prisma.crmScenario.findMany({ where: { workspaceId: opts.workspaceId } });
  const matched = matchScenario(scenarios, {
    tag: opts.tag,
    transcript: opts.transcript,
    extraText: opts.extraText,
  });
  if (!matched) return null;

  const lead = await prisma.crmLead.upsert({
    where: { scenarioId_contactId: { scenarioId: matched.scenario.id, contactId: opts.contactId } },
    create: {
      workspaceId: opts.workspaceId,
      scenarioId: matched.scenario.id,
      contactId: opts.contactId,
      callId: opts.callId,
      reason: matched.reason,
    },
    update: {
      callId: opts.callId,
      reason: matched.reason,
    },
  });

  await prisma.call.update({
    where: { id: opts.callId },
    data: { scenarioTag: matched.scenario.slug },
  });

  return { lead, scenario: matched.scenario, reason: matched.reason };
}
