import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const campaignId = req.nextUrl.searchParams.get("campaignId") || undefined;
  const calls = await prisma.call.findMany({
    where: { workspaceId: ctx.workspace.id, ...(campaignId ? { campaignId } : {}) },
    include: { contact: true, agent: true, campaign: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(calls);
}
