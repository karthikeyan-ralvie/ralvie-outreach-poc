import nodemailer from "nodemailer";
import { prisma } from "./prisma";
import { secretsOf } from "./workspace";
import { interpolate, workflowContext } from "./voice/complete-call";

export async function sendWorkflowEmail(workflowId: string, callId: string, summary: string) {
  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      contact: true,
      agent: {
        include: {
          knowledgeBases: { include: { knowledgeBase: { include: { docs: true } } } },
        },
      },
      workspace: { include: { settings: true } },
    },
  });
  const run = await prisma.workflowRun.findFirst({
    where: { workflowId, callId },
    orderBy: { createdAt: "desc" },
  });

  if (!workflow || !call) return;

  const secrets = secretsOf(call.workspace.settings);
  const answers = (call.intakeAnswers || {}) as Record<string, string>;
  const { pickRecipientEmail } = await import("./voice/email");
  const to = pickRecipientEmail(answers.email, call.contact.email);
  if (!to || !to.includes("@")) {
    if (run) {
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: "skipped", error: "No recipient email on the contact or from the call" },
      });
    }
    return;
  }

  if (!secrets.smtpHost || !secrets.smtpUser || !secrets.smtpPass) {
    if (run) {
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: "failed", error: "SMTP is not configured" },
      });
    }
    return;
  }

  const docs = call.agent.knowledgeBases.flatMap((kb) => kb.knowledgeBase.docs);
  const website =
    docs.find((d) => d.type === "website" && d.url)?.url || "https://frontdesk.ralvie.ai/";
  const demoLink =
    answers.demo_link ||
    (call.agent.followUpText && /^https?:\/\//i.test(call.agent.followUpText.trim())
      ? call.agent.followUpText.trim()
      : "") ||
    website;

  const ctx = workflowContext({
    contact: { ...call.contact, email: to },
    outcome: call.outcome,
    scenarioTag: call.scenarioTag,
    summary,
    answers: call.intakeAnswers as Record<string, unknown> | null,
    website,
    demoLink,
  });

  const port = secrets.smtpPort || 587;
  const transporter = nodemailer.createTransport({
    host: secrets.smtpHost,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user: secrets.smtpUser, pass: secrets.smtpPass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });

  try {
    await transporter.sendMail({
      from: secrets.smtpFrom || secrets.smtpUser,
      to,
      subject: interpolate(workflow.emailSubject, ctx),
      text: interpolate(workflow.emailBody, ctx),
    });
    if (run) {
      await prisma.workflowRun.update({ where: { id: run.id }, data: { status: "sent" } });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    if (run) {
      await prisma.workflowRun.update({ where: { id: run.id }, data: { status: "failed", error: message } });
    }
    throw err;
  }
}
