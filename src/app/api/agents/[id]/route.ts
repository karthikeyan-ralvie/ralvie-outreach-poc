import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { agentInclude, applyAgentSetup, serializeAgent, type AgentSetupInput } from "@/lib/agents/setup";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const agent = await prisma.agent.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: agentInclude,
  });
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(serializeAgent(agent));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const existing = await prisma.agent.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as AgentSetupInput;
  const agent = await applyAgentSetup(id, ctx.workspace.id, { ...body, name: body.name || existing.name });
  return NextResponse.json(agent);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const existing = await prisma.agent.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const kbId = existing.ownedKnowledgeBaseId;
  const formId = existing.intakeFormId;
  await prisma.agent.delete({ where: { id } });
  if (kbId) {
    await prisma.knowledgeBase.deleteMany({ where: { id: kbId } });
  }
  if (formId) {
    const stillUsed = await prisma.agent.count({ where: { intakeFormId: formId } });
    if (!stillUsed) await prisma.intakeForm.deleteMany({ where: { id: formId } });
  }
  return NextResponse.json({ ok: true });
}
