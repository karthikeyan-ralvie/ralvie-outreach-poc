import { prisma } from "../prisma";
import { chunkText } from "../knowledge/search";
import { slugKey } from "../utils";
import { crawlWebsite } from "../knowledge/crawl";
import { ensureInterestedQuestions, ensureInterestedScenario } from "./interested-intake";

export type FaqInput = { question: string; answer: string };
export type QuestionInput = {
  key?: string;
  prompt: string;
  type?: string;
  options?: string[];
  scenarioSlug?: string | null;
};
export type PlaybookInput = { name: string; when: string; instructions: string };

export type AgentSetupInput = {
  name?: string;
  role?: string;
  language?: string;
  systemPrompt?: string;
  greeting?: string;
  voicemailMessage?: string | null;
  elevenlabsVoiceId?: string | null;
  businessInfo?: string;
  websiteUrl?: string;
  faqs?: FaqInput[];
  playbooks?: PlaybookInput[];
  questions?: QuestionInput[];
  transferTo?: string | null;
  transferPhrases?: string | null;
  smsMessage?: string | null;
  bookingNotes?: string | null;
  followUpText?: string | null;
  webhookUrl?: string | null;
};

export async function ensureAgentResources(agentId: string, workspaceId: string, name: string) {
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
  let kbId = agent.ownedKnowledgeBaseId;
  let formId = agent.intakeFormId;

  if (!kbId) {
    const kb = await prisma.knowledgeBase.create({
      data: {
        workspaceId,
        name: `${name} knowledge`,
        description: "Private to this agent",
      },
    });
    kbId = kb.id;
    await prisma.agentKnowledgeBase.upsert({
      where: { agentId_knowledgeBaseId: { agentId, knowledgeBaseId: kbId } },
      create: { agentId, knowledgeBaseId: kbId },
      update: {},
    });
  }

  if (!formId) {
    const form = await prisma.intakeForm.create({
      data: { workspaceId, name: `${name} intake` },
    });
    formId = form.id;
  }

  if (kbId !== agent.ownedKnowledgeBaseId || formId !== agent.intakeFormId) {
    await prisma.agent.update({
      where: { id: agentId },
      data: { ownedKnowledgeBaseId: kbId, intakeFormId: formId },
    });
  }

  await ensureInterestedQuestions(formId!);
  await ensureInterestedScenario(workspaceId);

  return { kbId: kbId!, formId: formId! };
}

export async function applyAgentSetup(agentId: string, workspaceId: string, input: AgentSetupInput) {
  const name = input.name?.trim() || "Agent";
  const { kbId, formId } = await ensureAgentResources(agentId, workspaceId, name);

  await prisma.agent.update({
    where: { id: agentId },
    data: {
      name,
      role: input.role || "sales",
      language: input.language || "English",
      systemPrompt: input.systemPrompt ?? undefined,
      greeting: input.greeting ?? undefined,
      voicemailMessage: input.voicemailMessage === undefined ? undefined : input.voicemailMessage,
      elevenlabsVoiceId: input.elevenlabsVoiceId === undefined ? undefined : input.elevenlabsVoiceId,
      playbooks: input.playbooks ?? undefined,
      transferTo: input.transferTo === undefined ? undefined : input.transferTo,
      transferPhrases: input.transferPhrases === undefined ? undefined : input.transferPhrases,
      smsMessage: input.smsMessage === undefined ? undefined : input.smsMessage,
      bookingNotes: input.bookingNotes === undefined ? undefined : input.bookingNotes,
      followUpText: input.followUpText === undefined ? undefined : input.followUpText,
      webhookUrl: input.webhookUrl === undefined ? undefined : input.webhookUrl,
    },
  });

  if (input.businessInfo !== undefined) {
    await replaceDocs(kbId, "text", input.businessInfo.trim()
      ? [{ title: "Business information", content: input.businessInfo.trim() }]
      : []);
  }

  if (input.faqs) {
    await replaceDocs(
      kbId,
      "faq",
      input.faqs
        .filter((f) => f.question.trim() && f.answer.trim())
        .map((f) => ({
          title: f.question.trim().slice(0, 120),
          content: `Q: ${f.question.trim()}\nA: ${f.answer.trim()}`,
          metadata: { question: f.question.trim(), answer: f.answer.trim() },
        })),
    );
  }

  if (input.questions) {
    await prisma.intakeQuestion.deleteMany({ where: { formId } });
    if (input.questions.length) {
      await prisma.intakeQuestion.createMany({
        data: input.questions
          .filter((q) => q.prompt.trim())
          .map((q, i) => ({
            formId,
            order: i,
            key: slugKey(q.key || q.prompt),
            prompt: q.prompt.trim(),
            type: q.type || "text",
            options: q.options || undefined,
            scenarioSlug: q.scenarioSlug?.trim() || null,
          })),
      });
    }
    await ensureInterestedQuestions(formId);
  }

  await ensureInterestedScenario(workspaceId);

  if (input.websiteUrl !== undefined) {
    const url = normalizeUrl(input.websiteUrl);
    const existingSite = await prisma.knowledgeDoc.findFirst({
      where: { knowledgeBaseId: kbId, type: "website" },
    });
    if ((existingSite?.url || "") !== url) {
      await prisma.knowledgeDoc.deleteMany({ where: { knowledgeBaseId: kbId, type: "website" } });
      if (url) {
        const doc = await prisma.knowledgeDoc.create({
          data: {
            knowledgeBaseId: kbId,
            type: "website",
            title: `Website ${url}`,
            url,
            content: "Crawling…",
            metadata: { status: "running" },
          },
        });
        try {
          await crawlWebsite(doc.id, url);
        } catch {
          await prisma.knowledgeDoc.update({
            where: { id: doc.id },
            data: { content: "Could not crawl this site.", metadata: { status: "failed" } },
          });
        }
      }
    }
  }

  return serializeAgent(
    await prisma.agent.findUniqueOrThrow({
      where: { id: agentId },
      include: agentInclude,
    }),
  );
}

export const agentInclude = {
  intakeForm: { include: { questions: { orderBy: { order: "asc" as const } } } },
  ownedKnowledgeBase: { include: { docs: { orderBy: { createdAt: "asc" as const } } } },
  knowledgeBases: { include: { knowledgeBase: true } },
};

export function serializeAgent(agent: {
  intakeForm: {
    questions: { key: string; prompt: string; type: string; options: unknown; scenarioSlug?: string | null }[];
  } | null;
  ownedKnowledgeBase: {
    id: string;
    docs: { id: string; type: string; title: string; url: string | null; content: string; metadata: unknown }[];
  } | null;
  [key: string]: unknown;
}) {
  const docs = agent.ownedKnowledgeBase?.docs || [];
  const business = docs.find((d) => d.type === "text");
  const website = docs.find((d) => d.type === "website");
  const faqs = docs
    .filter((d) => d.type === "faq")
    .map((d) => {
      const meta = (d.metadata || {}) as { question?: string; answer?: string };
      return {
        id: d.id,
        question: meta.question || d.title,
        answer: meta.answer || d.content.replace(/^Q:[\s\S]*?\nA:\s*/, ""),
      };
    });

  return {
    ...agent,
    knowledge: {
      id: agent.ownedKnowledgeBase?.id || null,
      businessInfo: business?.content || "",
      websiteUrl: website?.url || "",
      websitePreview: website?.content?.slice(0, 180) || "",
      faqs,
    },
    intake: {
      id: agent.intakeFormId,
      questions: (agent.intakeForm?.questions || []).map((q) => ({
        key: q.key,
        prompt: q.prompt,
        type: q.type,
        options: Array.isArray(q.options) ? (q.options as string[]) : [],
        scenarioSlug: q.scenarioSlug || "",
      })),
    },
  };
}

async function replaceDocs(
  knowledgeBaseId: string,
  type: string,
  docs: { title: string; content: string; metadata?: object }[],
) {
  await prisma.knowledgeDoc.deleteMany({ where: { knowledgeBaseId, type } });
  for (const doc of docs) {
    await prisma.knowledgeDoc.create({
      data: {
        knowledgeBaseId,
        type,
        title: doc.title,
        content: doc.content,
        metadata: doc.metadata,
        chunks: {
          create: chunkText(doc.content).map((content) => ({ knowledgeBaseId, content })),
        },
      },
    });
  }
}

function normalizeUrl(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  const withProto = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withProto).href;
  } catch {
    return "";
  }
}
