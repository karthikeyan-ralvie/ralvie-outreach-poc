import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { slugKey } from "@/lib/utils";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const existing = await prisma.crmScenario.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as { name?: string; description?: string; phrases?: string };
  const item = await prisma.crmScenario.update({
    where: { id },
    data: {
      name: body.name?.trim() || existing.name,
      slug: body.name?.trim() ? slugKey(body.name) : existing.slug,
      description: body.description === undefined ? existing.description : body.description.trim() || null,
      phrases: body.phrases === undefined ? existing.phrases : body.phrases,
    },
  });
  return NextResponse.json(item);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const existing = await prisma.crmScenario.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.crmScenario.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
