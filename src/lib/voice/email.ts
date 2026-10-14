const DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "rediffmail.com",
  "aol.com",
  "zoho.com",
  "ymail.com",
  "mail.com",
];

const LETTERS: Record<string, string> = {
  a: "a",
  ay: "a",
  bee: "b",
  b: "b",
  see: "c",
  sea: "c",
  c: "c",
  dee: "d",
  d: "d",
  ee: "e",
  e: "e",
  ef: "f",
  f: "f",
  gee: "g",
  g: "g",
  aitch: "h",
  h: "h",
  eye: "i",
  i: "i",
  jay: "j",
  j: "j",
  kay: "k",
  k: "k",
  el: "l",
  l: "l",
  em: "m",
  m: "m",
  en: "n",
  n: "n",
  oh: "o",
  o: "o",
  pee: "p",
  p: "p",
  queue: "q",
  q: "q",
  ar: "r",
  r: "r",
  ess: "s",
  s: "s",
  tee: "t",
  t: "t",
  you: "u",
  yu: "u",
  u: "u",
  vee: "v",
  v: "v",
  doubleu: "w",
  w: "w",
  ex: "x",
  x: "x",
  why: "y",
  y: "y",
  zed: "z",
  zee: "z",
  z: "z",
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

const FILLER =
  /\b(you can send it|can send it|send it|please|my email is|the email is|email is|it is|this is|the email|email|address|to|on|for|me|the|a)\b/g;

export function speakEmail(email: string) {
  return email.replace(/@/g, " at ").replace(/\./g, " dot ");
}

export function wantsListedEmail(text: string) {
  const t = text.toLowerCase();
  return /\b(on the list|the list|on file|you have|you've got|you got|same email|that email|existing email|one you have|one on the list|use (the )?listed|yes that('| i)?s (fine|ok|okay|good|correct))\b/.test(
    t,
  );
}

export function extractEmail(
  text: string,
  hint?: { email?: string | null; firstName?: string | null; name?: string | null },
) {
  if (!text?.trim()) return null;
  if (hint?.email && wantsListedEmail(text)) return hint.email.toLowerCase();

  const raw = text.toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  if (raw) {
    const cleaned = cleanEmail(raw[0]);
    if (cleaned && isPlausibleEmail(cleaned)) return cleaned;
  }

  // Only parse spoken emails when the utterance looks like an email attempt
  if (!looksLikeEmailUtterance(text)) return null;

  const normalized = spokenToEmail(text);
  if (normalized && isPlausibleEmail(normalized)) return normalized;

  const withDomain = attachKnownDomain(text);
  if (withDomain && isPlausibleEmail(withDomain)) return withDomain;

  if (hint?.email && /\b(gmail|yahoo|hotmail|outlook|icloud)\b/i.test(text)) {
    return hint.email.toLowerCase();
  }
  return null;
}

/** Reject STT garbage like nosotimesiwouldsay@me.com from "no sometimes I would say". */
export function isPlausibleEmail(email: string) {
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return false;
  const [local, domain] = email.toLowerCase().split("@");
  if (!local || !domain) return false;
  if (local.length < 2 || local.length > 40) return false;
  if (/(sometimes|wouldsay|nosotime|yeahsure|notinterested|salesperson|ihave|likeyou)/i.test(local)) {
    return false;
  }
  // Reject jammed-together speech ("nosometimesiwouldsay")
  if (local.length >= 12 && !/[._+-]/.test(local)) {
    const spaced = local.replace(/([a-z]{3,})/g, " $1 ").replace(/\s+/g, " ");
    if (/\b(no|yes|say|would|sometimes|like|have|yeah|sure|busy|call)\b/i.test(spaced)) {
      return false;
    }
    const vowels = (local.match(/[aeiou]/gi) || []).length;
    if (vowels >= 5 && local.length >= 16) return false;
  }
  return true;
}

/** Prefer a real contact email over STT garbage collected on the call. */
export function pickRecipientEmail(collected?: string | null, contactEmail?: string | null) {
  const listed = contactEmail?.trim().toLowerCase() || "";
  const fromCall = collected?.trim().toLowerCase() || "";
  if (fromCall && isPlausibleEmail(fromCall)) return fromCall;
  if (listed && isPlausibleEmail(listed)) return listed;
  return "";
}

function looksLikeEmailUtterance(text: string) {
  const t = text.toLowerCase();
  if (/@| at |\bdot\b|\bgmail\b|\byahoo\b|\bhotmail\b|\boutlook\b|\bicloud\b|\bproton\b/.test(t)) return true;
  if (/\b(email|e-mail|mail me|send (it )?to)\b/.test(t) && /\b(com|in|org|net)\b/.test(t)) return true;
  return false;
}

function spokenToEmail(text: string) {
  let t = text
    .toLowerCase()
    .replace(/[?!]/g, " ")
    .replace(/,/g, " ")
    .replace(/\b(at the rate|at the rate of)\b/g, " @ ")
    .replace(/\b(at)\b/g, " @ ")
    .replace(/\b(dot|period|point)\b/g, " . ")
    .replace(/\b(underscore|under score)\b/g, " _ ")
    .replace(/\b(dash|hyphen|minus)\b/g, " - ")
    .replace(/\b(plus)\b/g, " + ")
    .replace(FILLER, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parts = t.split(" ").filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (part === "@" || part === "." || part === "_" || part === "-" || part === "+") {
      out.push(part);
      continue;
    }
    const mapped = LETTERS[part];
    if (mapped) {
      out.push(mapped);
      continue;
    }
    out.push(part.replace(/[^a-z0-9.@_+-]/g, ""));
  }

  let joined = "";
  for (const part of out) {
    if (!part) continue;
    joined += part;
  }

  joined = joined.replace(/@@+/g, "@");
  if (!joined.includes("@")) {
    joined = insertAtBeforeDomain(joined);
  }
  joined = joined.replace(/\.\.+/g, ".");
  return cleanEmail(joined);
}

function attachKnownDomain(text: string) {
  const t = text
    .toLowerCase()
    .replace(FILLER, " ")
    .replace(/[?,!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const domain of DOMAINS) {
    // Require domain as its own token / phrase — never match "me" inside "sometimes"
    const domainRe = new RegExp(`(?:^|\\s)${escapeReg(domain)}(?:\\s|$)`);
    const short = domain.split(".")[0];
    // Short domains (me, mac, aol) must be "me.com" / "me dot com", never bare "me"
    const shortRe =
      short.length <= 3
        ? new RegExp(`(?:^|\\s)${escapeReg(short)}\\s+(?:dot\\s+)?com(?:\\s|$)`)
        : new RegExp(`(?:^|\\s)${escapeReg(short)}(?:\\s+(?:dot\\s+)?com)?(?:\\s|$)`);
    if (!domainRe.test(t) && !shortRe.test(t)) continue;

    const before = t
      .replace(new RegExp(escapeReg(domain), "g"), " ")
      .replace(new RegExp(`(?:^|\\s)${escapeReg(short)}(?:\\s+(?:dot\\s+)?com)?(?:\\s|$)`, "g"), " ")
      .replace(/\b(dot|com|at)\b/g, " ")
      .replace(/[^a-z0-9._+-]+/g, "");
    if (before.length >= 2 && before.length <= 40) return cleanEmail(`${before}@${domain}`);
  }
  return null;
}

function insertAtBeforeDomain(value: string) {
  // Only split when a known domain is a suffix — never match "me" inside "sometimes"
  for (const domain of DOMAINS) {
    const compact = domain.replace(/\./g, "");
    if (value.endsWith(domain) && value.length > domain.length + 1) {
      return `${value.slice(0, -domain.length)}@${domain}`;
    }
    if (value.endsWith(compact) && value.length > compact.length + 1) {
      return `${value.slice(0, -compact.length)}@${domain}`;
    }
  }
  return value;
}

function cleanEmail(value: string) {
  let email = value.toLowerCase().replace(/\s+/g, "");
  email = email.replace(/gmailcom/g, "gmail.com").replace(/yahoocom/g, "yahoo.com").replace(/outlookcom/g, "outlook.com");
  email = email.replace(/@+/g, "@").replace(/\.+@/g, "@").replace(/@\.+/g, "@").replace(/^\.+|\.+$/g, "");
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return null;
  if (email.startsWith(".") || email.startsWith("@")) return null;
  return email;
}

function escapeReg(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
