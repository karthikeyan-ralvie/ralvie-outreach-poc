import { extractEmail, wantsListedEmail } from "./email";

export function speechFromTwilio(params: Record<string, string>) {
  const digits = (params.Digits || "").trim();
  if (digits === "1") return "yes";
  if (digits === "2") return "no";

  const stable = (params.SpeechResult || "").trim();
  // Unstable/partial results are often cut off mid-sentence — only use when stable is empty.
  const unstable = (params.UnstableSpeechResult || params.SpeechResultUnstable || "").trim();
  const confidence = Number(params.Confidence || params.SpeechConfidence || "1");

  let picked = "";
  if (stable.length >= 1) picked = stable;
  else if (unstable.length >= 1) picked = unstable;

  if (!picked) return "";

  // Very low-confidence STT — keep text but mark with a prefix the turn logic can detect
  if (Number.isFinite(confidence) && confidence > 0 && confidence < 0.45 && picked.split(/\s+/).length <= 4) {
    return `¿${picked}`;
  }
  return picked;
}

/** Strip the low-confidence marker if present. */
export function stripConfidenceMarker(text: string) {
  return text.replace(/^¿/, "").trim();
}

export function isLowConfidenceSpeech(text: string) {
  return text.trim().startsWith("¿");
}

/**
 * Incomplete / cut-off STT that we should not treat as a real answer.
 * Examples from live calls: "Call.", "our recent", "Does Raleigh,"
 */
export function isGarbledOrIncomplete(text: string) {
  const raw = stripConfidenceMarker(text || "").trim();
  if (!raw) return true;
  if (isLowConfidenceSpeech(text)) return true;

  const t = normalizeSpoken(raw);
  const words = t.split(/\s+/).filter(Boolean);

  // Clear short answers are fine
  if (isBareAffirmative(raw) || isBareNegative(raw)) return false;
  if (meansThisNumber(raw) || wantsListedEmail(raw)) return false;
  if (extractPhone(raw) || extractEmail(raw)) return false;
  if (asksToRepeat(raw)) return false;

  // Single junk token
  if (words.length === 1 && !/^(yes|yeah|yep|no|nope|ok|okay|sure|hello|hi|bye|ralvie|email|demo|price|pricing|transfer|appointment)$/.test(words[0])) {
    if (words[0].length <= 5) return true;
  }

  // Trailing cut-off: ends mid-thought with comma / "and" / "about" / "the"
  if (/[,;]\s*$/.test(raw) || /\b(and|or|about|the|to|for|with|our|my|your|is|can|does|did|will|would|like|tell|more)\s*$/i.test(raw)) {
    if (words.length <= 8) return true;
  }

  // Very short non-question fragments
  if (words.length <= 2 && !/\?/.test(raw) && !/\b(yes|yeah|no|ok|okay|sure|email|phone|demo|price|transfer|ralvie|interested|busy|later)\b/.test(t)) {
    return true;
  }

  return false;
}

/** Fix common product mishearings when we know the brand from the agent prompt. */
export function correctProductMishearings(text: string, productHints: string[] = []) {
  let out = stripConfidenceMarker(text);
  const brands = productHints.map((p) => p.trim()).filter((p) => p.length >= 3);
  // Always include Ralvie variants — frequent STT failure mode
  const ralvie = /\b(raleigh|rally|ralvi|ralvy|ral way|railway|really|rileys|riley)\b/gi;
  if (brands.some((b) => /ralvie/i.test(b)) || brands.length === 0) {
    out = out.replace(ralvie, "Ralvie");
  }
  for (const brand of brands) {
    if (/ralvie/i.test(brand)) continue;
    // Light phonetic: first syllable collisions are hard; skip generic words
    if (brand.length < 4) continue;
  }
  // "our recent" / "a recent" near "tell me more about" → often "Ralvie"
  out = out.replace(/\b(tell me more about|more about|about)\s+(our|a|the)?\s*recent\b/gi, "$1 Ralvie");
  out = out.replace(/\bfront desk\b/gi, "Frontdesk");
  // "demo office" / "demo offer" STT → demo also / demo
  out = out.replace(/\bdemo\s+office\b/gi, "demo also");
  out = out.replace(/\bgive me a demo office\b/gi, "give me a demo also");
  return out.replace(/\s+/g, " ").trim();
}

function normalizeSpoken(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GARBLED_YES = /^(s|es|ys|ye|ya|yo|yess|yas|yup|yep|yea|yeh|yah|hmm|mhm|uhuh|aha)$/;

export function isAffirmative(text: string) {
  const t = normalizeSpoken(text);
  if (!t) return false;
  if (/\b(not me|isn'?t me|is not me|not interested|wrong person)\b/.test(t) && !/\byes\b/.test(t)) return false;
  if (GARBLED_YES.test(t)) return true;
  if (/^(haan|ha|ji|haan ji|yes ji|hmm|uh huh|mm hmm)$/.test(t)) return true;
  return /^(yes|yeah|yep|yup|yea|ya|correct|right|sure|ok|okay|absolutely|of course|i am|i do|i have|go ahead|please|thats me|that's me|that is me|speaking)\b/.test(t)
    || /\b(yes|yeah|yep|yup|haan|that's me|thats me|that is me|this is me|that's right|thats right|i have a minute|go ahead)\b/.test(t)
    || /^(this is|it is)\b/.test(t);
}

export function isNegative(text: string) {
  const t = normalizeSpoken(text);
  if (!t) return false;
  if (/\byes\b/.test(t)) return false;
  return /^(no|nope|nah|not me|wrong|negative|two)\b/.test(t)
    || /\b(not me|wrong person|isn't me|is not me|don't know|do not know|nobody|no i'?m not)\b/.test(t);
}

export function isUnclear(text: string) {
  const t = normalizeSpoken(text);
  return /^(hi|hello|hey|yo|pardon|what|sorry|huh|excuse me)$/.test(t);
}

export function confirmsIdentity(text: string, firstName?: string | null) {
  const t = normalizeSpoken(text);
  if (!t) return false;
  const name = (firstName || "").trim().toLowerCase();
  if (name && new RegExp(`\\bnot\\s+${escapeReg(name)}\\b`).test(t)) return false;
  if (isNegative(text) && !/\byes\b/.test(t)) return false;
  if (isAffirmative(text)) return true;
  if (name && (t === name || t.includes(name)) && !/\bnot\b/.test(t)) return true;
  return false;
}

export function looksInterested(text: string) {
  const t = normalizeSpoken(text);
  if (!t || isNegative(text)) return false;
  // Questions about the product are NOT interest — unless they also ask to send/email/book
  if (/\b(what|what's|whats|how|why|when|where|who|which|tell me|explain)\b/.test(t)) {
    if (!/\b(send|email|book|schedule|demo)\b/.test(t)) return false;
  }
  return wantsDemoOrDetails(text);
}

/** Caller wants a demo / details emailed or booked — including short/garbled STT. */
export function wantsDemoOrDetails(text: string) {
  const t = normalizeSpoken(text);
  if (!t) return false;
  if (/\b(not interested|don'?t send|do not send|no demo|no email)\b/.test(t)) return false;

  // "Okay thank you. Demo." / "Demo." / "Demo please" / "demo office" (≈ demo also)
  if (
    /^(okay |ok |sure |yes |yeah |yep |thanks? |thank you[,.]?\s*)*(send |email )?(me )?(a |the )?(demo|details|link)( please| also| office| offer)?[.!]?$/.test(
      t,
    )
  ) {
    return true;
  }

  // "give me a demo", "I need a demo", "want the demo"
  if (/\b(give me|i (want|need)|send me|email me|share)\b.{0,24}\b(demo|details|link)\b/.test(t)) return true;

  // "you can send me the demo on this" / "send the demo to this email"
  if (/\b(send|email|share)\b.{0,40}\b(demo|details|link|info|information)\b/.test(t)) return true;
  if (/\b(demo|details|link)\b.{0,40}\b(send|email|on this|to (this|my|the) (email|mail|number))\b/.test(t)) return true;

  // book / schedule demo
  if (/\b(book|schedule)\b.{0,20}\b(demo|meeting|call)\b/.test(t)) return true;

  return /\b(i'?m interested|we'?re interested|interested in (it|this|that|ralvie)|go ahead and send|please send|yes please send|sign me up|send it over)\b/.test(
    t,
  );
}

/** Yes to an explicit demo / details / meeting offer (last agent must have asked). */
export function affirmsInterestOffer(userText: string, lastAgentText: string) {
  if (!userText?.trim() || !lastAgentText?.trim()) return false;
  // Affirmative OR a clear "send it / demo" after an offer
  const saidYes = (isAffirmative(userText) && !isNegative(userText)) || wantsDemoOrDetails(userText);
  if (!saidYes) return false;
  const agentAsked =
    /\?/.test(lastAgentText) &&
    /\b(demo|meeting|schedule|book|send (you )?(the )?(details|info|link)|email you|share (more )?details|would that be helpful|open to|want me to send|is that correct)\b/i.test(
      lastAgentText,
    );
  return agentAsked;
}

export function declinedPitch(text: string) {
  if (isNegative(text)) return true;
  const t = normalizeSpoken(text);
  return /\b(not now|busy|no time|call later|in a meeting|don'?t have (a )?minute|do not have|another time)\b/.test(t);
}

export function isNotInterested(text: string) {
  return /\b(not interested|stop calling|remove me|don'?t call|do not call|never call|leave me alone)\b/i.test(text);
}

/** Caller is wrapping up / saying goodbye. */
export function callerSaidBye(text: string) {
  const t = normalizeSpoken(text);
  if (!t) return false;
  return (
    /\b(bye|goodbye|good bye|bye bye|talk later|talk soon|gotta go|got to go|have to go|i'?m good|all good|that'?s (all|it|enough)|nothing else|no questions|take care|hang up)\b/.test(
      t,
    ) || /^(thanks|thank you|ok thanks|okay thanks|thanks bye|thank you bye)[.!]?$/.test(t)
  );
}

/** Agent speech that signals the call is finished. */
export function agentWrappingUp(speak: string) {
  return /\b(goodbye|good bye|talk soon|take care|you'?re all set|all set|have a (good|great) (one|day|evening)|catch you|nice talking|thanks for (your )?time|i'?ll (send|email)|we'?ll (send|email)|sent (you )?the|follow(ing)? up (by |on )?email)\b/i.test(
    speak,
  );
}

export function meansThisNumber(text: string) {
  const t = normalizeSpoken(text);
  if (!t) return false;
  return (
    /\b(this (number|phone|one)|same (number|phone|one)|the (same )?number you('re| are)? (calling|on)|the one you('re| are)? calling|number you('re| are) calling|number you called|you('re| are) calling (me )?(on|from)|call(ing)? (me )?on this|use (the )?same (number|phone|one)|use this (number|phone|one)|keep this number|same as (this|the) call)\b/.test(
      t,
    ) || /^(this one|same one|this number|same number|use this|use that|this phone)[.!]?$/.test(t)
  );
}

export function isBareAffirmative(text: string) {
  const t = normalizeSpoken(text);
  return /^(yes|yeah|yep|yup|yea|ya|sure|ok|okay|correct|right|haan|ji|haan ji|absolutely|of course|that's me|thats me|that is me|this is me|speaking)(\s+(it is|i am))?$/.test(t);
}

export function isBareNegative(text: string) {
  const t = normalizeSpoken(text);
  return /^(no|nope|nah|not me|wrong|not interested|busy|not now)$/.test(t);
}

export function extractPhone(text: string) {
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

/** True when the caller is asking something or raising a topic — not a simple yes/no. */
export function hasConversationalContent(text: string) {
  const raw = (text || "").trim();
  const t = normalizeSpoken(raw);
  if (!t) return false;
  if (isBareAffirmative(raw) || isBareNegative(raw)) return false;
  if (asksToRepeat(raw)) return false;
  // Intake answers like "use the same number you're calling on" are not product questions
  if (meansThisNumber(raw) || wantsListedEmail(raw)) return false;
  if (/\?/.test(raw) && !asksToRepeat(raw)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 4) return true;
  if (
    /\b(what|what's|whats|how|why|when|where|who|which|can you|could you|tell me|explain|price|pricing|cost|feature|features|integrate|integration|support|after.?hours|demo|trial|setup|onboard|ralvie|ai|receptionist|front.?desk|website|calling|purpose|about|busy|later|depends|depending|go ahead|go on|continue|speaking|maybe)\b/.test(
      t,
    )
  ) {
    if (asksToRepeat(raw)) return false;
    if (/^(yes|yeah|yep|sure|ok|okay)\b/.test(t) && /\bdo you have\b/.test(t) && words.length <= 5) return false;
    return true;
  }
  return false;
}

/** Early-call replies that aren't yes/no but still deserve a reasoned response. */
export function isEngagingReply(text: string) {
  const raw = (text || "").trim();
  if (!raw) return false;
  if (isBareAffirmative(raw) || isBareNegative(raw)) return false;
  if (asksToRepeat(raw)) return false;
  if (hasConversationalContent(raw)) return true;
  const t = normalizeSpoken(raw);
  const words = t.split(/\s+/).filter(Boolean);
  // Any multi-word reply at identity gate should be handled by the model
  if (words.length >= 2) return true;
  return false;
}

/** Caller wants the last line repeated — not a product question. */
export function asksToRepeat(text: string) {
  const t = normalizeSpoken(text);
  return /\b(repeat|say (that|it) again|come again|pardon|what did you say|didn't (quite )?catch|say again|one more time)\b/.test(
    t,
  ) || /^(can you )?(please )?repeat\??$/.test(t) || /^sorry\??$/.test(t) || /^what\??$/.test(t);
}

export function looksLikeName(text: string) {
  const t = text.trim().replace(/^(this is|i am|i'm|my name is|it's|it is)\s+/i, "").trim();
  if (t.length < 2 || t.length > 60) return false;
  if (isAffirmative(t) || isNegative(t)) return false;
  if (isUnclear(t)) return false;
  return /^[a-zA-Z][a-zA-Z .'-]{1,40}$/.test(t);
}

export function extractSpokenName(text: string) {
  const t = text.trim().replace(/^(this is|i am|i'm|my name is|it's|it is)\s+/i, "").trim();
  return t.split(/[,.]/)[0]?.trim() || t;
}

export { extractEmail, speakEmail, wantsListedEmail } from "./email";

function escapeReg(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
