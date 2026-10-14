import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { slugKey } from "@/lib/utils";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const form = await prisma.intakeForm.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(form);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const existing = await prisma.intakeForm.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as {
    name?: string;
    questions?: { key?: string; prompt: string; type?: string; options?: string[]; scenarioSlug?: string | null }[];
  };

  const form = await prisma.$transaction(async (tx) => {
    if (body.questions) {
      await tx.intakeQuestion.deleteMany({ where: { formId: id } });
      await tx.intakeQuestion.createMany({
        data: body.questions.map((q, i) => ({
          formId: id,
          order: i,
          key: slugKey(q.key || q.prompt),
          prompt: q.prompt,
          type: q.type || "text",
          options: q.options || undefined,
          scenarioSlug: q.scenarioSlug?.trim() || null,
        })),
      });
    }
    return tx.intakeForm.update({
      where: { id },
      data: { name: body.name?.trim() || existing.name },
      include: { questions: { orderBy: { order: "asc" } } },
    });
  });
  return NextResponse.json(form);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const existing = await prisma.intakeForm.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.intakeForm.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
