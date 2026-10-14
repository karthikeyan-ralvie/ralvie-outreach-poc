import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { secretsOf, webhookBase } from "@/lib/workspace";
import { formToParams, validateTwilioRequest } from "@/lib/twilio";
import {
  hangup,
  listenOnly,
  playAndHangup,
  playThenListen,
  sayAndHangup,
  sayThenListen,
  twilioSpeechLanguage,
  twiml,
  type GatherOpts,
} from "@/lib/voice/twiml";
import { runTurn, type TranscriptTurn } from "@/lib/voice/run-turn";
import { saveTtsMp3 } from "@/lib/tts-store";
import { completeCall } from "@/lib/voice/complete-call";
import { contactFirstName, contactVars, fillTemplate, spokenAgentName } from "@/lib/contacts/person";
import { speechFromTwilio, correctProductMishearings, isGarbledOrIncomplete, stripConfidenceMarker, agentWrappingUp } from "@/lib/voice/listen";
import { openingLine } from "@/lib/voice/ralvie";
import { resolveVoiceId } from "@/lib/voice/resolve-voice";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  try {
    return await handleTwilioVoice(req);
  } catch (err) {
    console.error("[voice-crash]", err instanceof Error ? err.stack : err);
    // Avoid Twilio Say on crash if possible — silent hangup is better than robot voice
    return twiml(hangup());
  }
}

async function handleTwilioVoice(req: NextRequest) {
  const params = await readParams(req);
  const callId = req.nextUrl.searchParams.get("callId") || params.callId || "";
  const rawSpeech = speechFromTwilio(params);
  const silenceFlag = req.nextUrl.searchParams.get("silence") === "1";

  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      agent: true,
      contact: true,
      workspace: { include: { settings: true } },
    },
  });
  if (!call) return twiml(hangup());

  const secrets = secretsOf(call.workspace.settings);
  const base = webhookBase(call.workspace.settings);
  const url = `${base}${req.nextUrl.pathname}${req.nextUrl.search}`;
  const signature = req.headers.get("x-twilio-signature");
  if (
    secrets.twilioAuthToken &&
    process.env.TWILIO_SKIP_VALIDATION !== "1" &&
    !validateTwilioRequest(secrets.twilioAuthToken, signature, url, params)
  ) {
    return new Response("Invalid signature", { status: 403 });
  }

  if (call.twilioCallSid !== params.CallSid && params.CallSid) {
    await prisma.call.update({ where: { id: call.id }, data: { twilioCallSid: params.CallSid } });
  }

  const action = `${base}/api/voice/twilio?callId=${call.id}`;
  const lang = twilioSpeechLanguage(call.agent.language);
  const agentName = spokenAgentName(call.agent.name, call.agent.systemPrompt);
  const firstName = contactFirstName(call.contact);
  const vars = {
    ...contactVars(call.contact),
    "agent name": agentName,
    agentname: agentName,
    agent: agentName,
  };
  const introRaw =
    fillTemplate(call.agent.greeting || "", vars).trim() || openingLine(agentName, firstName);
  const intro = introRaw.replace(/\bAva\b/gi, agentName);

  const productHints = productSpeechHints(call.agent.systemPrompt, call.agent.name);
  const speech = rawSpeech ? correctProductMishearings(rawSpeech, productHints) : "";
  const listenOpts: GatherOpts = {
    hints: [
      firstName,
      agentName,
      ...productHints,
      "Ralvie",
      "Frontdesk",
      "transfer",
      "appointment",
      "after hours",
      "email",
      "yes",
      "yeah",
      "that's me",
      "no",
      "gmail.com",
      "at",
      "dot",
    ].filter(Boolean) as string[],
    speechModel: "phone_call",
    timeout: 14,
    speechTimeout: "1.5",
  };

  const voiceId = await resolveVoiceId(secrets.elevenlabsApiKey, call.agent.elevenlabsVoiceId);
  const voiceOpts = {
    apiKey: secrets.elevenlabsApiKey,
    voiceId,
    base,
    language: lang,
  };

  if (!secrets.elevenlabsApiKey || !voiceId) {
    console.error("[tts-missing]", {
      key: Boolean(secrets.elevenlabsApiKey),
      voiceId,
      agent: call.agent.name,
    });
  }

  const transcript = (Array.isArray(call.transcript) ? call.transcript : []) as TranscriptTurn[];
  const userTurns = transcript.filter((t) => t.role === "user").length;
  const answers = {
    ...((call.intakeAnswers as Record<string, string> | null) || {}),
  };

  const noSpeech = !speech?.trim();
  // Timeouts hit ?silence=1 via Redirect; empty barge-in noise may POST with no speech.
  const emptyStreak = noSpeech ? Number(answers._empty_streak || 0) + 1 : 0;
  const isSilence =
    Boolean(speech?.trim())
      ? false
      : silenceFlag || emptyStreak >= 2 || (noSpeech && userTurns === 0 && transcript.length > 0);

  console.log("[voice]", call.id, {
    raw: rawSpeech,
    speech,
    confidence: params.Confidence || "",
    silence: isSilence,
    silenceFlag,
    emptyStreak,
    garbled: Boolean(speech && isGarbledOrIncomplete(speech)),
    digits: params.Digits || "",
    turns: transcript.length,
    el: Boolean(secrets.elevenlabsApiKey && voiceId),
  });

  // First connect only — never re-play the greeting on barge-in / empty gather
  if (transcript.length === 0) {
    const seeded = [{ role: "agent", text: intro, at: new Date().toISOString() }] satisfies TranscriptTurn[];
    await prisma.call.update({
      where: { id: call.id },
      data: {
        status: "in_progress",
        startedAt: new Date(),
        transcript: seeded,
        intakeAnswers: { ...answers, _empty_streak: "0" },
      },
    });
    return speakThenListen(intro, action, lang, voiceOpts, {
      hints: [firstName, agentName, "yes", "yeah", "that's me", "no", ...productHints].filter(Boolean) as string[],
      speechModel: "phone_call",
      timeout: 12,
      speechTimeout: "1.5",
    });
  }

  if (!call.startedAt) {
    await prisma.call.update({
      where: { id: call.id },
      data: { status: "in_progress", startedAt: new Date() },
    });
  }

  if (speech?.trim() && answers._empty_streak && answers._empty_streak !== "0") {
    delete answers._empty_streak;
    await prisma.call.update({ where: { id: call.id }, data: { intakeAnswers: answers } });
  } else if (noSpeech) {
    answers._empty_streak = String(emptyStreak);
    await prisma.call.update({ where: { id: call.id }, data: { intakeAnswers: answers } });
  }

  // First empty mid-call (often a barge-in glitch): listen again without talking
  if (noSpeech && !isSilence && userTurns > 0) {
    console.log("[voice-relisten]", call.id, "streak", emptyStreak);
    return twiml(listenOnly(action, lang, listenOpts));
  }

  // After a wrap-up / "I'll send details" line, silence means hang up — don't keep chatting
  if (isSilence && !speech?.trim()) {
    const lastAgent = [...transcript].reverse().find((t) => t.role === "agent")?.text || "";
    if (
      agentWrappingUp(lastAgent) ||
      /\b(i('ll| will) send|details to .+ at .+ dot|talk soon|goodbye)\b/i.test(lastAgent)
    ) {
      console.log("[voice-hangup-silence]", call.id);
      await completeCall(call.id, {
        status: "completed",
        outcome: (call.outcome as string) || "completed",
      });
      return twiml(hangup());
    }
  }

  if (!secrets.deepseekApiKey) {
    await completeCall(call.id, { status: "completed", outcome: "failed", error: "missing_deepseek" });
    return hangupSpeak("Sorry — this agent isn't fully configured yet. Goodbye.", voiceOpts);
  }

  // Cut-off / low-confidence STT — ask to repeat instead of inventing an answer
  if (speech && isGarbledOrIncomplete(speech) && !isSilence) {
    const clarify = "Sorry, I didn't catch that clearly — could you say that one more time?";
    console.log("[voice-garbled]", call.id, speech);
    const prior = (Array.isArray(call.transcript) ? call.transcript : []) as TranscriptTurn[];
    await prisma.call.update({
      where: { id: call.id },
      data: {
        transcript: [
          ...prior,
          { role: "user", text: `[unclear] ${stripConfidenceMarker(speech)}`, at: new Date().toISOString() },
          { role: "agent", text: clarify, at: new Date().toISOString() },
        ],
        status: "in_progress",
        startedAt: call.startedAt || new Date(),
      },
    });
    return speakThenListen(clarify, action, lang, voiceOpts, listenOpts);
  }

  try {
    const turn = await runTurn({
      apiKey: secrets.deepseekApiKey,
      callId: call.id,
      userText: speech ? stripConfidenceMarker(speech) : null,
      silence: isSilence && !speech,
    });

    // Never repeat the exact previous agent line
    const lastAgent = [...transcript].reverse().find((t) => t.role === "agent")?.text || "";
    if (turn.speak.trim() && lastAgent.trim() && norm(turn.speak) === norm(lastAgent)) {
      turn.speak = isSilence
        ? "Hey — you still with me?"
        : "Got it — what would you like to know?";
      const fresh = await prisma.call.findUnique({ where: { id: call.id }, select: { transcript: true } });
      const updated = (Array.isArray(fresh?.transcript) ? fresh!.transcript : []) as TranscriptTurn[];
      if (updated.length && updated[updated.length - 1]?.role === "agent") {
        updated[updated.length - 1] = { role: "agent", text: turn.speak, at: new Date().toISOString() };
        await prisma.call.update({ where: { id: call.id }, data: { transcript: updated } });
      }
    }

    // Hard stop on FAQ / prompt-leak speech before TTS
    const cleaned = scrubSpeech(turn.speak, agentName);
    if (cleaned !== turn.speak) {
      turn.speak = cleaned;
      const fresh = await prisma.call.findUnique({ where: { id: call.id }, select: { transcript: true } });
      const updated = (Array.isArray(fresh?.transcript) ? fresh!.transcript : []) as TranscriptTurn[];
      if (updated.length && updated[updated.length - 1]?.role === "agent") {
        updated[updated.length - 1] = { role: "agent", text: cleaned, at: new Date().toISOString() };
        await prisma.call.update({ where: { id: call.id }, data: { transcript: updated } });
      }
    }

    if (turn.endCall) {
      await completeCall(call.id, {
        status: "completed",
        outcome: turn.outcome || "completed",
      });
      return hangupSpeak(turn.speak, voiceOpts);
    }

    return speakThenListen(turn.speak, action, lang, voiceOpts, listenOpts);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent error";
    console.error("[voice-turn]", call.id, message);
    await prisma.call.update({ where: { id: call.id }, data: { error: message.slice(0, 400) } });
    return speakThenListen(
      "Sorry, I missed that for a second — what were you saying?",
      action,
      lang,
      voiceOpts,
      listenOpts,
    );
  }
}

function productSpeechHints(systemPrompt?: string | null, agentName?: string | null) {
  const text = `${systemPrompt || ""} ${agentName || ""}`;
  const hints = new Set<string>();
  for (const m of text.matchAll(/\b(Ralvie(?:\s+AI)?(?:\s+Frontdesk)?|Frontdesk|Twilio|ElevenLabs)\b/gi)) {
    hints.add(m[0]);
  }
  // Common capability words from sales calls — boosts STT
  for (const w of ["receptionist", "transfer", "appointment", "after hours", "demo", "pricing"]) {
    if (new RegExp(w, "i").test(text)) hints.add(w);
  }
  return Array.from(hints).slice(0, 8);
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Last-line defense so TTS never speaks FAQ labels or prompt instructions. */
function scrubSpeech(text: string, agentName: string) {
  let s = (text || "").replace(/\s+/g, " ").trim();
  const faq = s.match(/Q:\s*[\s\S]*?\s*A:\s*([\s\S]+)/i);
  if (faq?.[1]) s = faq[1].trim();
  s = s.replace(/\bQ:\s*/gi, "").replace(/\bA:\s*/gi, "");
  s = s.replace(
    /\byou are\s+[A-Za-z][A-Za-z'-]{1,24},?\s+(?:an?\s+)?(?:AI\s+)?(?:outbound\s+)?(?:sales\s+)?(?:assistant|agent|representative)[^.?!]*[.?!]?\s*/gi,
    "",
  );
  s = s.replace(/\bwant me to go deeper(?: on that)?\??\s*/gi, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return `I'm ${agentName} — how can I help?`;
  return s;
}

/** Keep TTS under a few short spoken sentences for lower latency. */
function clipForPhone(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 420) return clean;
  const parts = clean.split(/(?<=[.!?])\s+/);
  let out = "";
  for (const p of parts) {
    if (!out) {
      out = p;
      continue;
    }
    if ((out + " " + p).length > 420) break;
    out = `${out} ${p}`;
    if (out.split(/(?<=[.!?])/).filter(Boolean).length >= 3) break;
  }
  return out || clean.slice(0, 420);
}

async function readParams(req: NextRequest) {
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  try {
    const form = await req.formData();
    Object.assign(params, formToParams(form));
  } catch {
    // GET redirects have no form body
  }
  return params;
}

async function speakThenListen(
  text: string,
  action: string,
  language: string,
  opts: { apiKey: string | null; voiceId: string | null; base: string; language: string },
  gather?: GatherOpts,
) {
  // Cap spoken length so TTS stays fast on the phone
  const spoken = clipForPhone(text);
  const audio = await ttsUrl(opts.apiKey, opts.voiceId, spoken, opts.base, false);
  if (audio) {
    console.log("[tts-used]", "elevenlabs");
    return twiml(playThenListen(audio, action, language, gather));
  }
  // Prefer hearing the answer (Twilio Say) over a silent re-listen after the model reasoned
  console.error("[tts-fallback-say]", opts.apiKey && opts.voiceId ? "ElevenLabs failed" : "No ElevenLabs key/voice");
  return twiml(sayThenListen(spoken, action, language, gather));
}

async function hangupSpeak(
  text: string,
  opts: { apiKey: string | null; voiceId: string | null; base: string; language: string },
) {
  // End-of-call: allow one TTS retry so goodbye isn't silent
  const spoken = clipForPhone(text);
  const audio = await ttsUrl(opts.apiKey, opts.voiceId, spoken, opts.base, true);
  if (audio) {
    console.log("[tts-used]", "elevenlabs-hangup");
    return twiml(playAndHangup(audio));
  }
  if (opts.apiKey && opts.voiceId) {
    console.error("[tts-fail]", "ElevenLabs failed on hangup — silent hangup");
    return twiml(hangup());
  }
  return twiml(sayAndHangup(text, opts.language));
}

async function ttsUrl(
  apiKey: string | null,
  voiceId: string | null,
  text: string,
  base: string,
  retry = false,
) {
  if (!apiKey || !voiceId || !text.trim()) return null;
  const attempt = async () => {
    const id = await saveTtsMp3(apiKey, voiceId, text);
    return `${base}/api/voice/audio/${id}`;
  };
  try {
    const first = await Promise.race([
      attempt(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5500)),
    ]);
    if (first) return first;
    if (!retry) return null;
    console.log("[tts-retry-hard]");
    return await attempt();
  } catch (err) {
    console.error("[tts]", err instanceof Error ? err.message.slice(0, 200) : "failed");
    if (!retry) return null;
    try {
      return await attempt();
    } catch (err2) {
      console.error("[tts]", err2 instanceof Error ? err2.message.slice(0, 200) : "retry failed");
      return null;
    }
  }
}
