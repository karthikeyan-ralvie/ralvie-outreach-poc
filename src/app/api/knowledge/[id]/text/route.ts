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
  const body = (await req.json()) as { title?: string; content?: string };
  if (!body.content?.trim()) return NextResponse.json({ error: "Content is required" }, { status: 400 });
  const doc = await prisma.knowledgeDoc.create({
    data: {
      knowledgeBaseId: id,
      type: "text",
      title: body.title?.trim() || "Notes",
      content: body.content.trim(),
      chunks: {
        create: chunkText(body.content.trim()).map((c) => ({ knowledgeBaseId: id, content: c })),
      },
    },
  });
  return NextResponse.json(doc);
}
