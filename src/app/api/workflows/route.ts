import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export async function GET() {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const items = await prisma.workflow.findMany({
    where: { workspaceId: ctx.workspace.id },
    include: { agent: true, _count: { select: { runs: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const body = (await req.json()) as {
    name?: string;
    agentId?: string | null;
    trigger?: string;
    condition?: string;
    emailSubject?: string;
    emailBody?: string;
    enabled?: boolean;
  };
  if (!body.name?.trim() || !body.emailSubject?.trim() || !body.emailBody?.trim()) {
    return NextResponse.json({ error: "Name, subject, and body are required" }, { status: 400 });
  }
  const item = await prisma.workflow.create({
    data: {
      workspaceId: ctx.workspace.id,
      name: body.name.trim(),
      agentId: body.agentId || null,
      trigger: body.trigger || "always",
      condition: body.condition?.trim() || null,
      emailSubject: body.emailSubject.trim(),
      emailBody: body.emailBody,
      enabled: body.enabled !== false,
    },
  });
  return NextResponse.json(item);
}
