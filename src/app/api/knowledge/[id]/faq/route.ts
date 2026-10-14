import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { chunkText } from "@/lib/knowledge/search";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const kb = await prisma.knowledgeBase.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!kb) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as { question?: string; answer?: string };
  if (!body.question?.trim() || !body.answer?.trim()) {
    return NextResponse.json({ error: "Question and answer are required" }, { status: 400 });
  }
  const content = `Q: ${body.question.trim()}\nA: ${body.answer.trim()}`;
  const doc = await prisma.knowledgeDoc.create({
    data: {
      knowledgeBaseId: id,
      type: "faq",
      title: body.question.trim().slice(0, 120),
      content,
      metadata: { question: body.question.trim(), answer: body.answer.trim() },
      chunks: {
        create: chunkText(content, 1200).map((c) => ({ knowledgeBaseId: id, content: c })),
      },
    },
  });
  return NextResponse.json(doc);
}
