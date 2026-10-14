import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { slugKey } from "@/lib/utils";

export async function GET() {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const forms = await prisma.intakeForm.findMany({
    where: { workspaceId: ctx.workspace.id },
    include: { questions: { orderBy: { order: "asc" } }, _count: { select: { agents: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(forms);
}

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const body = (await req.json()) as {
    name?: string;
    questions?: { key?: string; prompt: string; type?: string; options?: string[] }[];
  };
  if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const form = await prisma.intakeForm.create({
    data: {
      workspaceId: ctx.workspace.id,
      name: body.name.trim(),
      questions: {
        create: (body.questions || []).map((q, i) => ({
          order: i,
          key: slugKey(q.key || q.prompt),
          prompt: q.prompt,
          type: q.type || "text",
          options: q.options || undefined,
        })),
      },
    },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(form);
}
