/** Knowledge helpers for live voice turns. */

/** Build a spoken answer from retrieved knowledge when the LLM fails or for quick FAQ hits. */
export function answerFromKnowledge(userText: string, knowledge: string[]) {
  const q = (userText || "").toLowerCase();
  if (!q.trim() || !knowledge.length) return null;

  // Direct website / link asks
  if (/\b(website|web site|site|url|link|online)\b/.test(q)) {
    for (const content of knowledge) {
      const url = content.match(/https?:\/\/[^\s)\]>"']+/i)?.[0];
      if (url) {
        const spoken = url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
        return `You can find more details on our website at ${spoken}.`;
      }
      const labeled = content.match(/Website:\s*(\S+)/i)?.[1];
      if (labeled) {
        const spoken = labeled.replace(/^https?:\/\//i, "").replace(/\/$/, "");
        return `You can find more details on our website at ${spoken}.`;
      }
    }
  }

  const terms = q
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));

  // Prefer FAQ Q/A pairs whose question side overlaps the user ask
  const faqHits: { score: number; answer: string }[] = [];
  for (const content of knowledge) {
    const faq = content.match(/Q:\s*([\s\S]*?)\s*A:\s*([\s\S]*?)(?=\nQ:|$)/i);
    if (!faq) continue;
    const qSide = faq[1].toLowerCase();
    const answer = faq[2].replace(/\s+/g, " ").trim();
    if (!answer) continue;
    let score = terms.reduce((n, t) => n + (qSide.includes(t) || content.toLowerCase().includes(t) ? 1 : 0), 0);
    // Short STT like "what is this" / "tell me more" leaves few terms — still prefer first FAQ
    // but never treat "who are you" as a product FAQ
    if (
      !terms.length &&
      /\b(what|how|tell|about|this|that|more|explain)\b/.test(q) &&
      !/\bwho (are|is) (you|this|calling)\b/.test(q)
    ) {
      score = Math.max(score, 1);
    }
    if (score > 0) faqHits.push({ score, answer });
  }
  faqHits.sort((a, b) => b.score - a.score);
  if (faqHits[0] && faqHits[0].score >= 1) return clipSpoken(faqHits[0].answer);

  // Vague asks with no content words: use product blurb — but NOT for identity ("who are you")
  if (!terms.length) {
    if (/\bwho (are|is) (you|this|calling)\b|\bwho'?s (this|calling)\b|\bwhat(?:'s| is) your name\b/.test(q)) {
      return null;
    }
    for (const content of knowledge) {
      const faq = content.match(/Q:\s*([\s\S]*?)\s*A:\s*([\s\S]*?)(?=\nQ:|$)/i);
      if (faq?.[2]?.trim()) return clipSpoken(faq[2].replace(/\s+/g, " ").trim());
    }
    const blurb = knowledge
      .map((c) => {
        const faq = c.match(/Q:\s*([\s\S]*?)\s*A:\s*([\s\S]*?)(?=\nQ:|$)/i);
        if (faq?.[2]) return faq[2].replace(/\s+/g, " ").trim();
        return c.replace(/^Q:\s*[\s\S]*?\s*A:\s*/i, "").replace(/\s+/g, " ").trim();
      })
      .find((c) => c.length > 40 && !/^website:/i.test(c) && !/^q:/i.test(c));
    return blurb ? clipSpoken(blurb) : null;
  }

  const scored = knowledge
    .map((content) => {
      const hay = content.toLowerCase();
      let score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
      for (const t of terms) {
        if (t.length >= 5 && !hay.includes(t)) {
          const stem = t.slice(0, Math.min(6, t.length - 1));
          if (hay.includes(stem)) score += 0.4;
        }
      }
      // Synonyms common on sales calls
      if (/\b(price|pricing|cost|dollar|₹|rs\.?|fee|plan)\b/.test(q) && /\b(price|pricing|cost|dollar|₹|rs\.?|fee|plan|\$)\b/.test(hay)) {
        score += 1.2;
      }
      if (/\b(widget|chat\s*widget|website widget|web widget|embed)\b/.test(q) && /\b(widget|chat|website|embed|web)\b/.test(hay)) {
        score += 1.4;
      }
      if (/\b(integrat|crm|zapier|api|software|connect)\b/.test(q) && /\b(integrat|crm|zapier|api|connect|software|webhook)\b/.test(hay)) {
        score += 1.3;
      }
      if (/\b(transfer|route|routing)\b/.test(q) && /\b(transfer|route|routing|forward)\b/.test(hay)) {
        score += 1.2;
      }
      if (/^q:\s*/i.test(content.trim()) || /\ba:\s*/i.test(content)) score += 0.3;
      return { content, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  // Lower threshold so phone STT still surfaces useful knowledge
  if (!best || best.score < 0.4) return null;

  const faq = best.content.match(/Q:\s*([\s\S]*?)\s*A:\s*([\s\S]*?)(?=\nQ:|$)/i);
  if (faq) {
    const answer = faq[2].replace(/\s+/g, " ").trim();
    if (answer) return clipSpoken(answer);
  }

  const sentences = best.content
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  const hit = sentences.find((s) => terms.some((t) => s.toLowerCase().includes(t))) || sentences[0] || best.content;
  return clipSpoken(hit);
}

export function knowledgeSupportsAnswer(userText: string, knowledge: string[]) {
  return Boolean(answerFromKnowledge(userText, knowledge));
}

export function missingInfoLine(continuePrompt?: string) {
  const base = "Hmm, I don't have that detail on hand right now.";
  return continuePrompt ? `${base} ${continuePrompt}` : `${base} Want me to check and follow up?`;
}

export function conversationalFallback(userText: string, knowledge: string[], continuePrompt?: string) {
  if (/\bwho (are|is) (you|this|calling)\b|\bwho'?s (this|calling)\b/i.test(userText || "")) {
    return continuePrompt || "I'm the person who just called — happy to introduce myself properly.";
  }
  const answered = answerFromKnowledge(userText, knowledge);
  if (answered) {
    const soft = answered
      .replace(/Q:\s*[\s\S]*?\s*A:\s*/i, "")
      .replace(/\bQ:\s*/gi, "")
      .replace(/\bA:\s*/gi, "")
      .trim();
    return continuePrompt ? `${soft} ${continuePrompt}` : soft;
  }
  if (knowledge.length) {
    const snippet = knowledge
      .map((c) => {
        const faq = c.match(/Q:\s*[\s\S]*?\s*A:\s*([\s\S]+)/i);
        const body = (faq?.[1] || c)
          .replace(/^Website:\s*\S+\s*/i, "")
          .replace(/\bQ:\s*/gi, "")
          .replace(/\bA:\s*/gi, "")
          .replace(/\s+/g, " ")
          .trim();
        return body;
      })
      .find((c) => c.length > 40);
    if (snippet) {
      const base = clipSpoken(snippet);
      const line = `${base}${/[.!?]$/.test(base) ? "" : "."}`;
      return continuePrompt ? `${line} ${continuePrompt}` : line;
    }
  }
  return missingInfoLine(continuePrompt);
}

export function admitsMissingInfo(speak: string) {
  return /\b(don'?t have|do not have|not sure|don'?t know|no information|can'?t find|check and get back|get back to you|follow up once|don'?t have that|haven'?t got that|not available)\b/i.test(
    speak,
  );
}

function clipSpoken(text: string) {
  const clean = text
    .replace(/^Website:\s*\S+\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= 280) return clean;
  return `${clean.slice(0, 277).replace(/\s+\S*$/, "")}...`;
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
  "like",
  "tell",
  "me",
  "can",
  "before",
  "but",
  "just",
  "first",
  "please",
  "about",
  "what",
  "when",
  "where",
  "which",
  "will",
  "would",
  "could",
  "should",
  "get",
  "how",
  "old",
  "does",
]);
