export type GatherOpts = {
  hints?: string[];
  speechModel?: string;
  timeout?: number;
  speechTimeout?: string | number;
  dtmf?: boolean;
};

export function playAndGather(audioUrl: string, actionUrl: string, language = "en-US", opts?: GatherOpts) {
  return playThenListen(audioUrl, actionUrl, language, opts);
}

export function playAndHangup(audioUrl: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${escapeXml(audioUrl)}</Play>
  <Hangup />
</Response>`;
}

export function hangup() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response><Hangup /></Response>`;
}

export function sayThenListen(text: string, actionUrl: string, language = "en-US", opts?: GatherOpts) {
  return listenAfter(`<Say language="${escapeXml(language)}">${escapeXml(text)}</Say>`, actionUrl, language, opts);
}

export function playThenListen(audioUrl: string, actionUrl: string, language = "en-US", opts?: GatherOpts) {
  return listenAfter(`<Play>${escapeXml(audioUrl)}</Play>`, actionUrl, language, opts);
}

/** Listen again without speaking — used when Gather returns empty speech. */
export function listenOnly(actionUrl: string, language = "en-US", opts?: GatherOpts) {
  return listenAfter("", actionUrl, language, opts);
}

export function sayAndGather(text: string, actionUrl: string, language = "en-US") {
  return sayThenListen(text, actionUrl, language);
}

export function sayAndHangup(text: string, language = "en-US") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="${escapeXml(language)}">${escapeXml(text)}</Say>
  <Hangup />
</Response>`;
}

function listenAfter(prompt: string, actionUrl: string, language: string, opts?: GatherOpts) {
  const silenceUrl = actionUrl + (actionUrl.includes("?") ? "&" : "?") + "silence=1";
  const extra = (opts?.hints || []).map((h) => h.trim()).filter(Boolean).join(", ");
  // Keep hints focused — too many dilute recognition. Always include product/yes-no staples.
  const hints = extra
    ? `${extra}, yes, yeah, yep, no, nope, okay, sure, Ralvie, Frontdesk, transfer, email, appointment, after hours`
    : "yes, yeah, yep, no, nope, okay, sure, that's me, Ralvie, Frontdesk, transfer, email, appointment";
  // phone_call is more reliable for longer answers than experimental_utterances
  const speechModel = opts?.speechModel || "phone_call";
  const timeout = opts?.timeout ?? 14;
  // Wait a bit longer after speech stops so mid-sentence pauses don't cut the caller off
  const speechTimeout = opts?.speechTimeout ?? "1.5";
  const dtmf = opts?.dtmf !== false;
  const input = dtmf ? "speech dtmf" : "speech";
  const numDigits = dtmf ? ` numDigits="1"` : "";
  const inner = prompt ? `\n    ${prompt}\n  ` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="${input}"${numDigits} bargeIn="true" actionOnEmptyResult="false" action="${escapeXml(actionUrl)}" method="POST" speechTimeout="${escapeXml(String(speechTimeout))}" timeout="${timeout}" language="${escapeXml(language)}" speechModel="${escapeXml(speechModel)}" hints="${escapeXml(hints)}">${inner}</Gather>
  <Redirect method="POST">${escapeXml(silenceUrl)}</Redirect>
</Response>`;
}

export function twiml(xml: string) {
  return new Response(xml, {
    headers: { "Content-Type": "text/xml" },
  });
}

export function twilioSpeechLanguage(language?: string | null) {
  const l = (language || "english").toLowerCase();
  if (l.includes("hindi") || l === "hi") return "hi-IN";
  if (l.includes("spanish") || l === "es") return "es-MX";
  if (l.includes("uk") || l.includes("british") || l.includes("en-gb")) return "en-GB";
  // Indian English often recognizes local accents better on Twilio
  if (l.includes("india") || l.includes("en-in") || l.includes("indian")) return "en-IN";
  return "en-US";
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
