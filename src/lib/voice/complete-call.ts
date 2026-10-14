import { prisma } from "../prisma";
import { deepseekChat } from "../deepseek";
import { secretsOf } from "../workspace";
import { addEmailJob } from "../queues";
import { assignCrmLead } from "../crm/match";
import { contactVars, fillTemplate } from "../contacts/person";
import { ensureFollowUpWorkflows } from "../agents/interested-intake";

export async function completeCall(callId: string, extra?: { status?: string; outcome?: string; error?: string }) {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      contact: true,
      agent: true,
      workspace: { include: { settings: true } },
    },
  });
  if (!call) return;

  const transcript = Array.isArray(call.transcript) ? call.transcript : [];
  const secrets = secretsOf(call.workspace.settings);
  let summary = "";
  if (secrets.deepseekApiKey && transcript.length) {
    try {
      summary = await Promise.race([
        deepseekChat(secrets.deepseekApiKey, [
          {
            role: "system",
            content: "Summarize this outbound sales/support call in 3 short sentences. Mention any next step.",
          },
          { role: "user", content: JSON.stringify(transcript).slice(0, 4000) },
        ], { maxTokens: 120, maxChars: 5000, timeoutMs: 4000, singleAttempt: true }),
        new Promise<string>((resolve) => setTimeout(() => resolve(""), 3500)),
      ]);
    } catch {
      summary = "";
    }
  }

  const outcome = pickOutcome(call.outcome, extra?.outcome, call.status, extra?.status);
  const status = extra?.status || "completed";

  await prisma.call.update({
    where: { id: call.id },
    data: {
      status,
      outcome,
      endedAt: call.endedAt || new Date(),
      ...(extra?.error ? { error: extra.error } : {}),
    },
  });

  await assignCrmLead({
    workspaceId: call.workspaceId,
    contactId: call.contactId,
    callId: call.id,
    tag: call.scenarioTag,
    transcript: call.transcript,
  });

  if (call.agent.webhookUrl) {
    fetch(call.agent.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callId: call.id,
        outcome,
        scenarioTag: call.scenarioTag,
        contact: call.contact,
        answers: call.intakeAnswers,
        summary,
        followUpText: call.agent.followUpText,
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  }

  await fireFollowUpEmails(callId, outcome, summary);
}

const followUpInFlight = new Set<string>();

async function fireFollowUpEmails(callId: string, outcome: string, summary: string) {
  if (followUpInFlight.has(callId)) return;
  followUpInFlight.add(callId);
  try {
    const already = await prisma.workflowRun.count({ where: { callId } });
    if (already) return;

  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { agent: true },
  });
  if (!call) return;

  await ensureFollowUpWorkflows(call.workspaceId).catch(() => {});

  const workflows = await prisma.workflow.findMany({
    where: {
      workspaceId: call.workspaceId,
      enabled: true,
      OR: [{ agentId: call.agentId }, { agentId: null }],
    },
  });

  const matched = workflows.filter((wf) =>
    matchesWorkflow(wf.trigger, wf.condition, outcome, call.scenarioTag),
  );
  // Avoid sending two nearly identical emails (outcome + scenario) for the same call
  const picked: typeof matched = [];
  const seen = new Set<string>();
  for (const wf of matched) {
    const key = `${wf.emailSubject}::${wf.condition || wf.trigger}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(wf);
  }
  if (!picked.length) return;

  for (const wf of picked) {
    const run = await prisma.workflowRun.create({
      data: { workflowId: wf.id, callId: call.id, status: "queued" },
    });
    try {
      await addEmailJob({
        workflowId: wf.id,
        callId: call.id,
        summary,
      });
    } catch (err) {
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: "failed", error: err instanceof Error ? err.message : "Send failed" },
      });
    }
  }
  } finally {
    setTimeout(() => followUpInFlight.delete(callId), 15000);
  }
}

function pickOutcome(
  existing: string | null | undefined,
  incoming: string | null | undefined,
  currentStatus: string,
  incomingStatus?: string,
) {
  const kept = ["interested", "not_interested", "callback", "voicemail"];
  if (existing && kept.includes(existing) && (!incoming || incoming === "completed")) return existing;
  return incoming || existing || inferOutcome(currentStatus, incomingStatus);
}

function inferOutcome(current: string, status?: string) {
  if (status === "no-answer" || status === "no_answer") return "no_answer";
  if (status === "busy") return "busy";
  if (status === "failed") return "failed";
  if (current === "voicemail") return "voicemail";
  return "completed";
}

export function matchesWorkflow(
  trigger: string,
  condition: string | null | undefined,
  outcome: string | null | undefined,
  scenario: string | null | undefined,
) {
  if (trigger === "always") return !["failed", "busy", "no_answer"].includes(outcome || "");
  if (trigger === "outcome") {
    if (!condition) return true;
    const wanted = condition.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
    if (wanted.includes(outcome || "")) return true;
    return false;
  }
  if (trigger === "scenario") {
    if (!condition) return false;
    // Interested / not-interested emails require matching outcome — scenario alone is not enough
    if (condition === "interested") return outcome === "interested";
    if (condition === "not_interested") return outcome === "not_interested";
    if (condition === scenario || slugMatch(condition, scenario)) return true;
    if (condition === "interested" && outcome === "interested") return true;
    if (condition === "not_interested" && outcome === "not_interested") return true;
    return false;
  }
  return false;
}

function slugMatch(condition: string, scenario?: string | null) {
  return Boolean(scenario) && condition.trim().toLowerCase().replace(/\s+/g, "_") === scenario;
}

export function interpolate(template: string, ctx: Record<string, string>) {
  return fillTemplate(template, ctx);
}

export function workflowContext(input: {
  contact: { name?: string | null; email?: string | null; company?: string | null; phone: string; extra?: unknown };
  outcome?: string | null;
  scenarioTag?: string | null;
  summary?: string;
  answers?: Record<string, unknown> | null;
  website?: string | null;
  demoLink?: string | null;
}) {
  const ctx: Record<string, string> = {
    ...contactVars(input.contact),
    outcome: input.outcome || "",
    scenario: input.scenarioTag || "",
    summary: input.summary || "",
    website: input.website || "",
    site: input.website || "",
    demo_link: input.demoLink || input.website || "",
    demolink: input.demoLink || input.website || "",
    "demo link": input.demoLink || input.website || "",
  };
  const answers = (input.answers || {}) as Record<string, unknown>;
  const answerLines: string[] = [];
  for (const [k, v] of Object.entries(answers)) {
    if (["pending_intake_key", "pending_email", "name_confirmed", "minute_ok"].includes(k)) continue;
    ctx[`answers.${k}`] = String(v ?? "");
    answerLines.push(`${k}: ${String(v ?? "")}`);
  }
  ctx.answers = answerLines.join("\n");
  return ctx;
}
