import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const agents = await p.agent.findMany({
  include: {
    intakeForm: { include: { questions: { orderBy: { order: "asc" } } } },
    knowledgeBases: true,
  },
});
for (const a of agents) {
  console.log(
    JSON.stringify(
      {
        name: a.name,
        promptPreview: (a.systemPrompt || "").slice(0, 180),
        greeting: (a.greeting || "").slice(0, 80),
        voice: a.elevenlabsVoiceId ? "set" : "missing",
        intake: a.intakeForm?.name || null,
        questions: (a.intakeForm?.questions || []).map((q) => ({ key: q.key, type: q.type, prompt: q.prompt.slice(0, 80) })),
        kbs: a.knowledgeBases.length,
      },
      null,
      2,
    ),
  );
}
const scenarios = await p.crmScenario.findMany({ take: 20 });
console.log(
  "scenarios",
  scenarios.map((s) => ({ name: s.name, slug: s.slug, phrases: s.phrases.slice(0, 60) })),
);
await p.$disconnect();
