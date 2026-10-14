import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const scenarioId = req.nextUrl.searchParams.get("scenarioId") || undefined;
  const leads = await prisma.crmLead.findMany({
    where: { workspaceId: ctx.workspace.id, ...(scenarioId ? { scenarioId } : {}) },
    include: {
      scenario: true,
      contact: true,
      call: { include: { agent: true, campaign: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  return NextResponse.json(leads);
}
