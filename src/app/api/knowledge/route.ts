import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export async function GET() {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const items = await prisma.knowledgeBase.findMany({
    where: { workspaceId: ctx.workspace.id },
    include: { _count: { select: { docs: true, agents: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const body = (await req.json()) as { name?: string; description?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const item = await prisma.knowledgeBase.create({
    data: {
      workspaceId: ctx.workspace.id,
      name: body.name.trim(),
      description: body.description?.trim() || null,
    },
  });
  return NextResponse.json(item);
}
