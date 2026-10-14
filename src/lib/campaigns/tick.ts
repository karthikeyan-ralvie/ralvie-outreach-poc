import { prisma } from "../prisma";
import { secretsOf, webhookBase } from "../workspace";
import { twilioClient } from "../twilio";
import { tryAddCampaignTick } from "../queues";
import { toCallerId, toE164 } from "../contacts/map-columns";
import { completeCall } from "../voice/complete-call";
import { playThenListen, twilioSpeechLanguage } from "../voice/twiml";
import { openingLine } from "../voice/ralvie";
import { contactFirstName, contactVars, fillTemplate, spokenAgentName } from "../contacts/person";
import { saveTtsMp3 } from "../tts-store";
import { resolveVoiceId } from "../voice/resolve-voice";

const ACTIVE = ["queued", "ringing", "in_progress"];
const TWILIO_STATUS: Record<string, string> = {
  queued: "queued",
  initiated: "queued",
  ringing: "ringing",
  "in-progress": "in_progress",
  completed: "completed",
  busy: "busy",
  failed: "failed",
  "no-answer": "no_answer",
  canceled: "failed",
};

const localTicks = new Map<string, ReturnType<typeof setTimeout>>();

export async function queueCampaignTick(campaignId: string, delay = 0) {
  try {
    await tryAddCampaignTick(campaignId, delay || undefined);
  } catch {
    const prev = localTicks.get(campaignId);
    if (prev) clearTimeout(prev);
    localTicks.set(
      campaignId,
      setTimeout(() => {
        localTicks.delete(campaignId);
        void tickCampaign(campaignId);
      }, delay),
    );
  }
}

export async function tickCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      agent: true,
      list: true,
      workspace: { include: { settings: true } },
    },
  });
  if (!campaign || campaign.status !== "running") return { ok: true, reason: "not_running" };

  await expireStaleCalls(campaignId);

  const secrets = secretsOf(campaign.workspace.settings);
  if (!secrets.twilioAccountSid || !secrets.twilioAuthToken || !secrets.twilioFromNumber) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "paused" },
    });
    return { ok: false, reason: "missing_twilio" };
  }

  const client = twilioClient(secrets.twilioAccountSid, secrets.twilioAuthToken);
  await syncTwilioCalls(campaignId, client);

  const active = await prisma.call.count({
    where: { campaignId, status: { in: ACTIVE } },
  });
  const slots = Math.max(0, campaign.concurrency - active);

  if (slots === 0) {
    try {
      await queueCampaignTick(campaignId, 4000);
    } catch {
      /* redis optional until campaigns run */
    }
    return { ok: true, reason: "at_capacity" };
  }

  const remaining = await prisma.contact.findMany({
    where: {
      listId: campaign.listId,
      calls: { none: { campaignId } },
    },
    take: slots,
    orderBy: { createdAt: "asc" },
  });

  if (!remaining.length && active === 0) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "completed" } });
    return { ok: true, reason: "completed" };
  }

  const base = webhookBase(campaign.workspace.settings);
  await warmupVoiceRoute();

  for (const contact of remaining) {
    const firstName = contactFirstName(contact);
    const agentName = spokenAgentName(campaign.agent.name, campaign.agent.systemPrompt);
    const intro =
      fillTemplate(campaign.agent.greeting || "", {
        ...contactVars(contact),
        "agent name": agentName,
        agentname: agentName,
        agent: agentName,
      }).trim() || openingLine(agentName, firstName);
    // Never allow a stale Ava greeting when the prompt identity is different
    const safeIntro = intro.replace(/\bAva\b/gi, agentName);
    console.log("[dial-intro]", "spokenName=", agentName, "intro=", safeIntro.slice(0, 80));
    const call = await prisma.call.create({
      data: {
        workspaceId: campaign.workspaceId,
        campaignId: campaign.id,
        contactId: contact.id,
        agentId: campaign.agentId,
        status: "queued",
        // Leave empty until greeting is actually played — seeding early skips webhook greeting
        // when dial falls back to url: and Twilio never hears the intro.
        transcript: [],
      },
    });

    try {
      const to = toE164(contact.phone, campaign.list.countryCode);
      const from = toCallerId(secrets.twilioFromNumber);
      const action = `${base}/api/voice/twilio?callId=${call.id}`;
      const lang = twilioSpeechLanguage(campaign.agent.language);
      const gather = {
        hints: [firstName, "yes", "yeah", "that's me", "no", "Ralvie", "Frontdesk"].filter(Boolean),
        speechModel: "phone_call" as const,
        timeout: 12,
        speechTimeout: "1.5" as const,
      };
      // Always synthesize intro with ElevenLabs before dial — never start on Twilio Say
      let greetingXml: string | null = null;
      const voiceId = await resolveVoiceId(secrets.elevenlabsApiKey, campaign.agent.elevenlabsVoiceId);
      if (secrets.elevenlabsApiKey && voiceId) {
        for (let attempt = 0; attempt < 2 && !greetingXml; attempt++) {
          try {
            const audioId = await saveTtsMp3(secrets.elevenlabsApiKey, voiceId, safeIntro);
            if (audioId) {
              greetingXml = playThenListen(`${base}/api/voice/audio/${audioId}`, action, lang, gather);
              console.log("[dial-voice]", "elevenlabs", attempt === 0 ? "ok" : "retry-ok");
            }
          } catch (err) {
            console.log("[dial-tts]", err instanceof Error ? err.message.slice(0, 120) : "tts failed", "attempt", attempt);
          }
        }
      } else {
        console.error("[dial-voice]", "missing elevenlabs key or voice — webhook will try on connect");
      }
      // Only seed transcript when inline TwiML will play the greeting (webhook path needs empty transcript)
      if (greetingXml) {
        await prisma.call.update({
          where: { id: call.id },
          data: {
            transcript: [{ role: "agent", text: safeIntro, at: new Date().toISOString() }],
          },
        });
      }
      const shared = {
        to,
        from,
        statusCallback: `${base}/api/voice/status?callId=${call.id}`,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        record: true as const,
        recordingStatusCallback: `${base}/api/voice/recording?callId=${call.id}`,
        recordingStatusCallbackEvent: ["completed"],
      };
      let twilioCall;
      try {
        if (greetingXml) {
          twilioCall = await client.calls.create({ ...shared, twiml: greetingXml });
        } else {
          // Webhook path synthesizes ElevenLabs on first connect (still no Say)
          twilioCall = await client.calls.create({ ...shared, url: action });
        }
      } catch (err) {
        console.log("[dial-twiml]", err instanceof Error ? err.message.slice(0, 160) : "create rejected");
        twilioCall = await client.calls.create({
          ...shared,
          url: action,
        });
      }
      console.log("[dial]", call.id, "to", maskNumber(to), "from", maskNumber(from), "twilio", twilioCall.status);
      await prisma.call.update({
        where: { id: call.id },
        data: {
          twilioCallSid: twilioCall.sid,
          status: TWILIO_STATUS[twilioCall.status] || "queued",
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Twilio create failed";
      console.log("[dial-failed]", call.id, message.slice(0, 200));
      await prisma.call.update({
        where: { id: call.id },
        data: {
          status: "failed",
          outcome: "failed",
          error: friendlyTwilioError(message),
          endedAt: new Date(),
        },
      });
    }
  }

  try {
    await queueCampaignTick(campaignId, 4000);
  } catch {
    /* next tick is already scheduled locally when Redis is down */
  }
  return { ok: true, reason: "dialed" };
}

async function expireStaleCalls(campaignId: string) {
  const cutoff = new Date(Date.now() - 75_000);
  await prisma.call.updateMany({
    where: {
      campaignId,
      endedAt: null,
      status: { in: ["queued", "ringing"] },
      createdAt: { lt: cutoff },
    },
    data: {
      status: "failed",
      outcome: "failed",
      error:
        "Call never reached the phone. On a Twilio trial, verify this mobile in Twilio Console → Phone Numbers → Verified Caller IDs. Also keep ngrok running.",
      endedAt: new Date(),
    },
  });
}

async function syncTwilioCalls(campaignId: string, client: ReturnType<typeof twilioClient>) {
  const active = await prisma.call.findMany({
    where: { campaignId, endedAt: null, twilioCallSid: { not: null }, status: { in: ACTIVE } },
  });
  for (const call of active) {
    try {
      const remote = await client.calls(call.twilioCallSid!).fetch();
      const mapped = TWILIO_STATUS[remote.status] || remote.status;
      let err = "";
      if (["failed", "busy", "no_answer", "completed"].includes(mapped)) {
        try {
          const notes = await client.calls(call.twilioCallSid!).notifications.list({ limit: 5 });
          err = friendlyTwilioError(
            notes.map((n) => `${n.errorCode || ""} ${n.messageText || ""}`.trim()).filter(Boolean).join("; "),
          );
        } catch {
          /* notifications are optional */
        }
      }
      if (["completed", "busy", "failed", "no_answer"].includes(mapped)) {
        await completeCall(call.id, {
          status: mapped,
          outcome: mapped === "completed" ? call.outcome || "completed" : mapped,
          error: err || undefined,
        });
      } else if (mapped !== call.status) {
        await prisma.call.update({
          where: { id: call.id },
          data: { status: mapped, ...(err ? { error: err } : {}) },
        });
      } else if (err && err !== call.error) {
        await prisma.call.update({ where: { id: call.id }, data: { error: err } });
      }
    } catch (err) {
      console.log("[twilio-fetch]", call.id, err instanceof Error ? err.message : "fetch failed");
    }
  }
}

function friendlyTwilioError(message: string) {
  if (!message) return "";
  if (/21219|21608|unverified/i.test(message)) {
    return "Twilio trial can only call numbers you verified in Twilio Console → Phone Numbers → Verified Caller IDs.";
  }
  if (/21215|13227|permission/i.test(message)) {
    return "Twilio blocked this destination. Enable geographic permissions for this country in Twilio Console.";
  }
  return message.slice(0, 400);
}

function maskNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "(none)";
  return `+${digits.slice(0, Math.max(0, digits.length - 4)).replace(/./g, "•")}${digits.slice(-4)}`;
}

export async function warmupVoiceRoute() {
  const origin = (process.env.NEXTAUTH_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
  try {
    await fetch(`${origin}/api/voice/twilio`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "CallSid=warmup",
      signal: AbortSignal.timeout(45000),
    });
  } catch (err) {
    console.log("[voice-warmup]", err instanceof Error ? err.message : "failed");
  }
}
