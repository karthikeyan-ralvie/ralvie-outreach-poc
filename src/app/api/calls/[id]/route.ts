import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const call = await prisma.call.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: {
      contact: true,
      agent: true,
      campaign: true,
      workflowRuns: { include: { workflow: true }, orderBy: { createdAt: "asc" } },
      crmLeads: { include: { scenario: true } },
    },
  });
  if (!call) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(call);
}
