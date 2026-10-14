/**
 * Spoken name for calls. Prefer a name declared in the custom instructions
 * (e.g. "You are Alex...") over placeholder UI names like "My First AI Agent".
 */
export function spokenAgentName(name?: string | null, systemPrompt?: string | null) {
  const fromPrompt = nameFromSystemPrompt(systemPrompt);
  if (fromPrompt) return fromPrompt;

  const n = (name || "").trim();
  const isPlaceholder = !n || /my first|first ai agent|untitled|new agent|^agent$/i.test(n);
  if (isPlaceholder) return "Ava";
  return n;
}

export function nameFromSystemPrompt(systemPrompt?: string | null) {
  if (!systemPrompt?.trim()) return null;
  const text = systemPrompt.replace(/\s+/g, " ").trim();
  const patterns = [
    /\byou are\s+([A-Za-z][A-Za-z]{1,24})\b/i,
    /\bi(?:'m| am)\s+([A-Za-z][A-Za-z]{1,24})\b/i,
    /\bmy name is\s+([A-Za-z][A-Za-z]{1,24})\b/i,
    /\bthis is\s+([A-Za-z][A-Za-z]{1,24})\b/i,
    /\b(?:named|called)\s+([A-Za-z][A-Za-z]{1,24})\b/i,
  ];
  const blocked = new Set([
    "an",
    "the",
    "ai",
    "a",
    "assistant",
    "outbound",
    "sales",
    "helpful",
    "friendly",
    "professional",
    "human",
    "virtual",
    "voice",
  ]);
  for (const re of patterns) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const raw = m[1];
    if (blocked.has(raw.toLowerCase())) continue;
    // Title-case for speech
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  return null;
}

export function contactFirstName(contact: {
  name?: string | null;
  extra?: unknown;
}) {
  const extra = (contact.extra && typeof contact.extra === "object" ? contact.extra : {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(extra)) {
    const n = key.toLowerCase().replace(/[_./-]+/g, " ").trim();
    if (n === "first name" || n === "firstname" || n === "first" || n === "given name") {
      const text = String(value || "").trim();
      if (text) return text.split(/\s+/)[0];
    }
  }
  const full = (contact.name || "").trim();
  if (!full) return "";
  return full.split(/\s+/)[0];
}

export function contactVars(contact: {
  name?: string | null;
  email?: string | null;
  company?: string | null;
  phone?: string | null;
  extra?: unknown;
}) {
  const first = contactFirstName(contact);
  const full = (contact.name || "").trim() || first;
  return {
    name: full,
    "full name": full,
    fullname: full,
    "first name": first,
    firstname: first,
    first_name: first,
    first: first,
    email: contact.email || "",
    company: contact.company || "",
    phone: contact.phone || "",
  };
}

export function fillTemplate(template: string, vars: Record<string, string>) {
  if (!template) return "";
  const lookup = (raw: string) => {
    const key = raw.trim().toLowerCase().replace(/[_-]+/g, " ");
    if (vars[key] != null && vars[key] !== "") return vars[key];
    const compact = key.replace(/\s+/g, "");
    for (const [k, v] of Object.entries(vars)) {
      if (k.replace(/[\s_-]+/g, "") === compact) return v || "";
    }
    return "";
  };
  return template
    .replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key: string) => lookup(key))
    .replace(/\{\s*([a-zA-Z][a-zA-Z0-9 _.-]*)\s*\}/g, (_, key: string) => lookup(key));
}
