import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

const isSqlite = (process.env.DATABASE_URL || "").startsWith("file:");

type ChunkCache = { at: number; chunks: { content: string }[] };
const chunkCache = new Map<string, ChunkCache>();
const CHUNK_TTL_MS = 60_000;

export function clearKnowledgeChunkCache() {
  chunkCache.clear();
}

async function loadChunks(knowledgeBaseIds: string[]) {
  const key = knowledgeBaseIds.slice().sort().join(",");
  const hit = chunkCache.get(key);
  if (hit && Date.now() - hit.at < CHUNK_TTL_MS) return hit.chunks;

  const chunks = await prisma.knowledgeChunk.findMany({
    where: { knowledgeBaseId: { in: knowledgeBaseIds } },
    take: 80,
    orderBy: { id: "asc" },
    select: { content: true },
  });
  chunkCache.set(key, { at: Date.now(), chunks });
  if (chunkCache.size > 20) {
    const first = chunkCache.keys().next().value;
    if (first) chunkCache.delete(first);
  }
  return chunks;
}

export async function searchKnowledge(knowledgeBaseIds: string[], query: string, limit = 8) {
  if (!knowledgeBaseIds.length) return [];

  const expanded = expandQuery(query);
  const cleaned = expanded.replace(/[^\w\s]/g, " ").trim();

  // Always load chunks and rank — don't rely solely on Postgres FTS (it often misses STT queries)
  const chunks = await loadChunks(knowledgeBaseIds);

  if (!isSqlite && cleaned.length > 2) {
    try {
      const rows = await prisma.$queryRaw<{ content: string }[]>`
        SELECT content
        FROM "KnowledgeChunk"
        WHERE "knowledgeBaseId" IN (${Prisma.join(knowledgeBaseIds.map((id) => Prisma.sql`${id}`))})
          AND to_tsvector('english', content) @@ plainto_tsquery('english', ${cleaned})
        LIMIT ${limit}
      `;
      if (rows.length) {
        // Merge FTS hits with keyword ranking so we don't drop synonym matches
        const seen = new Set(rows.map((r) => r.content.slice(0, 80)));
        const extra = rankChunks(chunks, cleaned, limit)
          .map((c) => c.content)
          .filter((c) => !seen.has(c.slice(0, 80)));
        return [...rows.map((r) => r.content), ...extra].slice(0, limit);
      }
    } catch {
      // fall through
    }
  }

  return rankChunks(chunks, cleaned, limit).map((r) => r.content);
}

function expandQuery(query: string) {
  const q = query.toLowerCase();
  const extra: string[] = [];
  if (/\bintegrat|crm|software|api|zapier|connect|hubspot|salesforce|zoho\b/.test(q)) {
    extra.push("integration", "CRM", "API", "Zapier", "webhook", "connect", "HubSpot", "Salesforce");
  }
  if (/\blanguage|multilingual|hindi|spanish|english|locale\b/.test(q)) {
    extra.push("languages", "multilingual", "language support");
  }
  if (/\bmultiple|concurrent|simultaneous|at once|parallel|volume\b/.test(q)) {
    extra.push("concurrent calls", "multiple calls", "simultaneous");
  }
  if (/\bwidget|website|chat\b/.test(q)) extra.push("widget", "website", "chat", "embed");
  if (/\btransfer|route|routing\b/.test(q)) extra.push("transfer", "routing", "forward");
  if (/\bafter.?hours|24\/7|missed\b/.test(q)) extra.push("after hours", "24/7");
  return extra.length ? `${query} ${extra.join(" ")}` : query;
}

function rankChunks(chunks: { content: string }[], cleaned: string, limit: number) {
  const terms = cleaned
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));

  const ranked = chunks
    .map((c) => {
      const hay = c.content.toLowerCase();
      let score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
      for (const t of terms) {
        if (t.length >= 5 && !hay.includes(t)) {
          const stem = t.slice(0, Math.min(6, t.length - 1));
          if (hay.includes(stem)) score += 0.4;
        }
      }
      if (/^q:\s*/i.test(c.content.trim()) || /\ba:\s*/i.test(c.content)) score += 0.5;
      if (
        /\b(price|pricing|cost|feature|demo|after hours|receptionist|ralvie|frontdesk|transfer|appoint|crm|language|website|widget|integrat|api|concurrent|multiple|https?:\/\/)\b/.test(
          hay,
        )
      ) {
        score += 0.35;
      }
      // Topic boosts from the query itself
      if (/\bintegrat|crm|api\b/.test(cleaned) && /\bintegrat|crm|api|zapier|webhook|connect\b/.test(hay)) score += 2;
      if (/\blanguage|multilingual\b/.test(cleaned) && /\blanguage|multilingual|hindi|spanish\b/.test(hay)) score += 2;
      if (/\bmultiple|concurrent|simultaneous\b/.test(cleaned) && /\bconcurrent|multiple|simultaneous|parallel\b/.test(hay))
        score += 2;
      return { content: c.content, score };
    })
    .sort((a, b) => b.score - a.score);

  const withHits = ranked.filter((r) => r.score >= 0.35);
  return (withHits.length ? withHits : ranked).slice(0, limit);
}

/** Always-on knowledge for the prompt: business blurb + FAQs + website, so the model can answer without relying only on search. */
export async function loadCoreKnowledge(knowledgeBaseIds: string[], limit = 14) {
  if (!knowledgeBaseIds.length) return [] as string[];
  const docs = await prisma.knowledgeDoc.findMany({
    where: {
      knowledgeBaseId: { in: knowledgeBaseIds },
      type: { in: ["faq", "text", "website"] },
    },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    take: 40,
  });

  const out: string[] = [];
  for (const d of docs) {
    const raw = (d.content || "").trim();
    if (raw.length < 20) continue;
    if (/no extractable text|crawling…|could not crawl|invalid url/i.test(raw)) continue;

    if (d.type === "faq") {
      // Split multi-FAQ docs so individual answers are easier to retrieve/speak
      const parts = raw.split(/(?=Q:\s*)/i).map((p) => p.trim()).filter((p) => p.length > 20);
      if (parts.length > 1) {
        out.push(...parts);
        continue;
      }
    }

    if (d.type === "website") {
      const header = d.url ? `Website: ${d.url}\n` : "";
      const clipped = raw.length > 5500 ? `${raw.slice(0, 5500)}…` : raw;
      out.push(`${header}${clipped}`);
      continue;
    }
    out.push(raw);
  }
  return out.slice(0, Math.max(limit, 18));
}

export function chunkText(text: string, size = 900) {
  const parts: string[] = [];
  const normalized = text.replace(/\s+/g, " ").trim();
  for (let i = 0; i < normalized.length; i += size) {
    parts.push(normalized.slice(i, i + size));
  }
  return parts.filter(Boolean);
}

const STOP = new Set([
  "the",
  "and",
  "for",
  "you",
  "are",
  "this",
  "that",
  "with",
  "from",
  "have",
  "your",
  "can",
  "get",
  "about",
  "what",
  "when",
  "how",
  "old",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "please",
  "just",
  "like",
  "tell",
  "me",
]);
