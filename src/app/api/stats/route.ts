import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export async function GET() {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const workspaceId = ctx.workspace.id;
  const [agents, lists, campaigns, calls, running] = await Promise.all([
    prisma.agent.count({ where: { workspaceId } }),
    prisma.contact.count({ where: { list: { workspaceId } } }),
    prisma.campaign.count({ where: { workspaceId } }),
    prisma.call.count({ where: { workspaceId } }),
    prisma.campaign.count({ where: { workspaceId, status: "running" } }),
  ]);
  const recent = await prisma.call.findMany({
    where: { workspaceId },
    include: { contact: true, agent: true, campaign: true },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  return NextResponse.json({ agents, contacts: lists, campaigns, calls, running, recent });
}
