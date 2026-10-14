import * as cheerio from "cheerio";
import { prisma } from "../prisma";
import { chunkText, clearKnowledgeChunkCache } from "./search";

const MAX_PAGES = 12;
const MAX_JS_ASSETS = 3;
const MAX_JS_BYTES = 1_500_000;

export async function crawlWebsite(docId: string, startUrl: string) {
  const doc = await prisma.knowledgeDoc.findUnique({ where: { id: docId } });
  if (!doc) return;

  let origin: URL;
  try {
    origin = new URL(startUrl);
  } catch {
    await prisma.knowledgeDoc.update({
      where: { id: docId },
      data: { content: "Invalid URL", metadata: { error: "invalid_url" } },
    });
    return;
  }

  const seen = new Set<string>();
  const queue = [origin.href];
  const pages: { url: string; title: string; text: string }[] = [];
  const jsAssets = new Set<string>();

  while (queue.length && pages.length < MAX_PAGES) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });
      const type = res.headers.get("content-type") || "";
      if (!res.ok || !type.includes("text/html")) continue;
      const html = await res.text();
      const extracted = extractPageText(html, url);
      if (extracted.text.length > 40) {
        pages.push({ url, title: extracted.title, text: extracted.text.slice(0, 20000) });
      }
      for (const asset of extracted.jsAssets) {
        if (jsAssets.size < MAX_JS_ASSETS * 4) jsAssets.add(asset);
      }

      const $ = cheerio.load(html);
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        try {
          const next = new URL(href, url);
          if (next.hostname !== origin.hostname) return;
          next.hash = "";
          // Prefer content-ish paths first
          const path = next.pathname.toLowerCase();
          const useful = /pricing|feature|about|faq|product|demo|solution|service|contact|blog/.test(path);
          if (!seen.has(next.href) && queue.length + pages.length < MAX_PAGES * 3) {
            if (useful) queue.unshift(next.href);
            else queue.push(next.href);
          }
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* skip page */
    }
  }

  // SPA sites often put real copy only in JS bundles — scrape readable strings
  const fromJs = await extractFromJsAssets([...jsAssets].slice(0, MAX_JS_ASSETS), origin);
  if (fromJs.length > 80) {
    pages.push({
      url: origin.href,
      title: pages[0]?.title || origin.hostname,
      text: fromJs.slice(0, 25000),
    });
  }

  const fallback = `Website: ${origin.href}\nProduct site for this business. Share this link when callers ask for the website or more details online.`;
  const content =
    pages.map((p) => `# ${p.title}\n${p.url}\n${p.text}`).join("\n\n") || fallback;

  await prisma.knowledgeChunk.deleteMany({ where: { docId } });
  const chunks = (
    pages.length
      ? pages.flatMap((p) =>
          chunkText(`Website ${p.url}. ${p.title}. ${p.text}`, 900).map((c) => ({
            docId,
            knowledgeBaseId: doc.knowledgeBaseId,
            content: c,
          })),
        )
      : chunkText(fallback).map((c) => ({
          docId,
          knowledgeBaseId: doc.knowledgeBaseId,
          content: c,
        }))
  );

  if (chunks.length) {
    await prisma.knowledgeChunk.createMany({ data: chunks });
  }
  clearKnowledgeChunkCache();

  await prisma.knowledgeDoc.update({
    where: { id: docId },
    data: {
      title: pages[0]?.title || origin.hostname,
      content: content.slice(0, 100000),
      metadata: {
        status: pages.length ? "ok" : "url_only",
        pages: pages.length,
        urls: [...new Set(pages.map((p) => p.url))],
        jsAssets: [...jsAssets].slice(0, MAX_JS_ASSETS),
        fromJsChars: fromJs.length,
      },
    },
  });
}

/** Pull usable text from HTML, including SPA shells (meta/JSON-LD/title). */
function extractPageText(html: string, url: string) {
  const $ = cheerio.load(html);
  const jsAssets: string[] = [];
  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    try {
      const abs = new URL(src, url);
      if (abs.pathname.endsWith(".js") || abs.pathname.includes("/assets/")) {
        jsAssets.push(abs.href);
      }
    } catch {
      /* ignore */
    }
  });

  $("script:not([type='application/ld+json']), style, noscript, svg").remove();

  const title =
    $("title").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    url;

  const bits: string[] = [];
  const metaKeys = [
    "description",
    "og:description",
    "twitter:description",
    "og:title",
    "keywords",
  ];
  for (const key of metaKeys) {
    const v =
      $(`meta[name="${key}"]`).attr("content") ||
      $(`meta[property="${key}"]`).attr("content");
    if (v?.trim()) bits.push(v.trim());
  }

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    try {
      const data = JSON.parse(raw);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        for (const key of ["name", "description", "headline", "abstract", "text"]) {
          const v = (item as Record<string, unknown>)[key];
          if (typeof v === "string" && v.trim().length > 20) bits.push(v.trim());
        }
      }
    } catch {
      /* ignore bad json-ld */
    }
  });

  $("h1, h2, h3, h4, p, li, button, a, span, div").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length >= 20 && t.length < 500) bits.push(t);
  });

  const body = $("body").text().replace(/\s+/g, " ").trim();
  if (body.length > 80) bits.push(body);

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const b of bits) {
    const key = b.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(b);
  }

  return { title, text: unique.join(" ").replace(/\s+/g, " ").trim(), jsAssets };
}

async function extractFromJsAssets(urls: string[], origin: URL) {
  const parts: string[] = [];
  for (const url of urls) {
    try {
      const u = new URL(url);
      if (u.hostname !== origin.hostname) continue;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "*/*",
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_JS_BYTES) continue;
      const text = new TextDecoder("utf-8").decode(buf);
      parts.push(...extractReadableStrings(text));
    } catch {
      /* skip asset */
    }
  }
  // Dedupe
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.join(" ");
}

/** Pull human-readable marketing / FAQ copy from minified JS string literals. */
function extractReadableStrings(js: string) {
  const found: string[] = [];
  const re = /["'`]([^"'`\\]{28,280})["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(js))) {
    const s = m[1].replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
    if (!looksLikeProse(s)) continue;
    found.push(s);
    if (found.length >= 120) break;
  }
  return found;
}

function looksLikeProse(s: string) {
  if (/^[{}[\]();=]|=>|function|typeof|undefined|null|true|false/.test(s)) return false;
  if (/https?:\/\//i.test(s) && s.split(" ").length < 6) return false;
  if (/^[A-Za-z0-9_./-]+\.(js|css|png|jpg|svg|woff2?)$/i.test(s)) return false;
  if (/^M\d|L\d|path|viewBox|rgba?\(|#[0-9a-f]{3,8}$/i.test(s)) return false;
  if (/React|webpack|__vite|node_modules|Cannot |expected to/i.test(s)) return false;
  const letters = (s.match(/[a-zA-Z]/g) || []).length;
  if (letters < s.length * 0.55) return false;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 5) return false;
  // Prefer sentences with real words
  if (!/[.!?]|,\s|\b(the|and|your|with|from|call|ai|book|free|trial|feature|customer)\b/i.test(s)) {
    return false;
  }
  return true;
}
