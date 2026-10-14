import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { applyAgentSetup, type AgentSetupInput } from "@/lib/agents/setup";

export async function GET() {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const agents = await prisma.agent.findMany({
    where: { workspaceId: ctx.workspace.id },
    include: {
      intakeForm: { include: { _count: { select: { questions: true } } } },
      ownedKnowledgeBase: { include: { _count: { select: { docs: true } } } },
      _count: { select: { campaigns: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(agents);
}

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const body = (await req.json()) as AgentSetupInput;
  if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const created = await prisma.agent.create({
    data: {
      workspaceId: ctx.workspace.id,
      name: body.name.trim(),
      role: body.role || "sales",
      language: body.language || "English",
      systemPrompt:
        body.systemPrompt?.trim() ||
        "You are a helpful outbound agent. Be concise, polite, and stay on the goal of the call.",
      greeting: body.greeting?.trim() || `Hey, I am ${body.name.trim()}. Is this {first name}?`,
      voicemailMessage: body.voicemailMessage?.trim() || null,
    },
  });

  const agent = await applyAgentSetup(created.id, ctx.workspace.id, body);
  return NextResponse.json(agent);
}
