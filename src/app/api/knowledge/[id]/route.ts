import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

async function load(ctxWorkspaceId: string, id: string) {
  return prisma.knowledgeBase.findFirst({
    where: { id, workspaceId: ctxWorkspaceId },
    include: { docs: { orderBy: { createdAt: "desc" } } },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const item = await load(ctx.workspace.id, id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const existing = await load(ctx.workspace.id, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as { name?: string; description?: string };
  const item = await prisma.knowledgeBase.update({
    where: { id },
    data: {
      name: body.name?.trim() || existing.name,
      description: body.description !== undefined ? body.description : existing.description,
    },
  });
  return NextResponse.json(item);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const existing = await load(ctx.workspace.id, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.knowledgeBase.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
