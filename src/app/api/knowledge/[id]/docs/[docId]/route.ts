import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id, docId } = await params;
  const doc = await prisma.knowledgeDoc.findFirst({
    where: { id: docId, knowledgeBase: { id, workspaceId: ctx.workspace.id } },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.knowledgeDoc.delete({ where: { id: docId } });
  return NextResponse.json({ ok: true });
}
