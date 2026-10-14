import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const item = await prisma.workflow.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { agent: true, runs: { include: { call: { include: { contact: true } } }, take: 20, orderBy: { createdAt: "desc" } } },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const existing = await prisma.workflow.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as {
    name?: string;
    agentId?: string | null;
    trigger?: string;
    condition?: string | null;
    emailSubject?: string;
    emailBody?: string;
    enabled?: boolean;
  };
  const item = await prisma.workflow.update({
    where: { id },
    data: {
      name: body.name?.trim() || existing.name,
      agentId: body.agentId === undefined ? existing.agentId : body.agentId,
      trigger: body.trigger || existing.trigger,
      condition: body.condition === undefined ? existing.condition : body.condition,
      emailSubject: body.emailSubject?.trim() || existing.emailSubject,
      emailBody: body.emailBody ?? existing.emailBody,
      enabled: body.enabled ?? existing.enabled,
    },
  });
  return NextResponse.json(item);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const existing = await prisma.workflow.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.workflow.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
