import { prisma } from "../prisma";

export const INTERESTED_QUESTIONS = [
  {
    key: "email",
    prompt: "What email should I send the details to?",
    type: "email",
    scenarioSlug: "interested",
  },
  {
    key: "phone",
    prompt: "What's the best phone number to reach you on?",
    type: "phone",
    scenarioSlug: "interested",
  },
] as const;

export async function ensureInterestedScenario(workspaceId: string) {
  await prisma.crmScenario.upsert({
    where: { workspaceId_slug: { workspaceId, slug: "interested" } },
    create: {
      workspaceId,
      name: "Interested",
      slug: "interested",
      description:
        "The person is interested / has a minute / wants details or a demo. Ask the intake questions linked to this scenario (usually email and phone), then follow up.",
      phrases:
        "i'm interested, we are interested, send me details, email me the details, book a demo, schedule a demo, schedule a meeting, yes send it, go ahead and send, please send the link, that would be helpful yes",
    },
    update: {
      description:
        "The person is interested / has a minute / wants details or a demo. Ask the intake questions linked to this scenario (usually email and phone), then follow up.",
    },
  });
}

export async function ensureInterestedQuestions(formId: string) {
  const existing = await prisma.intakeQuestion.findMany({
    where: { formId },
    orderBy: { order: "asc" },
  });
  const keys = new Set(existing.map((q) => q.key));
  let order = existing.length ? Math.max(...existing.map((q) => q.order)) + 1 : 0;

  // Backfill scenarioSlug on email/phone questions created before this field existed
  for (const q of existing) {
    if (
      !q.scenarioSlug &&
      (q.type === "email" ||
        q.type === "phone" ||
        q.key === "email" ||
        q.key === "phone" ||
        q.key === "contact_email")
    ) {
      await prisma.intakeQuestion.update({
        where: { id: q.id },
        data: { scenarioSlug: "interested" },
      });
    }
  }

  for (const q of INTERESTED_QUESTIONS) {
    if (keys.has(q.key)) continue;
    await prisma.intakeQuestion.create({
      data: {
        formId,
        order,
        key: q.key,
        prompt: q.prompt,
        type: q.type,
        scenarioSlug: q.scenarioSlug,
      },
    });
    order += 1;
  }
}

export async function ensureInterestedWorkflow(workspaceId: string) {
  const existing = await prisma.workflow.findFirst({
    where: {
      workspaceId,
      enabled: true,
      OR: [
        { trigger: "outcome", condition: { contains: "interested" } },
        { trigger: "scenario", condition: "interested" },
      ],
      NOT: [{ condition: { contains: "not_interested" } }],
    },
  });
  if (existing) {
    // Keep existing copy, but ensure body mentions the demo link if it was a stub
    if (!/demo|schedule|book|meeting/i.test(existing.emailBody)) {
      await prisma.workflow.update({
        where: { id: existing.id },
        data: {
          emailBody: INTERESTED_EMAIL_BODY,
        },
      });
    }
    return existing;
  }
  return prisma.workflow.create({
    data: {
      workspaceId,
      name: "Email — Interested",
      trigger: "scenario",
      condition: "interested",
      enabled: true,
      emailSubject: "Your Ralvie AI demo link, {first name}",
      emailBody: INTERESTED_EMAIL_BODY,
    },
  });
}

const INTERESTED_EMAIL_BODY = `Hi {first name},

Thanks for taking a minute on our call today. As promised, here's how to book a short demo of Ralvie AI Frontdesk:

Demo / booking: {demo_link}

You can also learn more on our site: {website}

Quick recap from the call:
{summary}

Looking forward to showing you around.

Best,
Ralvie AI`;

const NOT_INTERESTED_EMAIL_BODY = `Hi {first name},

Thanks for your time today — no pressure at all.

If anything changes later, you can always learn more about Ralvie AI Frontdesk here:
{website}

Take care,
Ralvie AI`;

export async function ensureNotInterestedWorkflow(workspaceId: string) {
  const existing = await prisma.workflow.findFirst({
    where: {
      workspaceId,
      enabled: true,
      OR: [
        { trigger: "outcome", condition: { contains: "not_interested" } },
        { trigger: "scenario", condition: "not_interested" },
      ],
    },
  });
  if (existing) {
    if (!/website|site|ralvie/i.test(existing.emailBody)) {
      await prisma.workflow.update({
        where: { id: existing.id },
        data: { emailBody: NOT_INTERESTED_EMAIL_BODY },
      });
    }
    return existing;
  }

  await prisma.crmScenario.upsert({
    where: { workspaceId_slug: { workspaceId, slug: "not_interested" } },
    create: {
      workspaceId,
      name: "Not interested",
      slug: "not_interested",
      description: "Caller declined or is not interested. Send a short thanks email with the website.",
      phrases: "not interested, no thanks, stop calling, remove me, don't call, do not call",
    },
    update: {},
  });

  return prisma.workflow.create({
    data: {
      workspaceId,
      name: "Email — Not interested",
      trigger: "scenario",
      condition: "not_interested",
      enabled: true,
      emailSubject: "Thanks for your time, {first name}",
      emailBody: NOT_INTERESTED_EMAIL_BODY,
    },
  });
}

export async function ensureFollowUpWorkflows(workspaceId: string) {
  await ensureInterestedWorkflow(workspaceId);
  await ensureNotInterestedWorkflow(workspaceId);
}

export async function ensureInterestedIntake(agentId: string, workspaceId: string) {
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
  let formId = agent.intakeFormId;
  if (!formId) {
    const form = await prisma.intakeForm.create({
      data: { workspaceId, name: `${agent.name} intake` },
    });
    formId = form.id;
    await prisma.agent.update({
      where: { id: agentId },
      data: { intakeFormId: formId },
    });
  }
  await ensureInterestedQuestions(formId);
  await ensureInterestedScenario(workspaceId);
  await ensureFollowUpWorkflows(workspaceId);
  return formId;
}
