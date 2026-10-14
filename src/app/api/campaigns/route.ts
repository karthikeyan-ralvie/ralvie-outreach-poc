import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { campaignListSummaries } from "@/lib/campaigns/analytics";

export async function GET() {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const campaigns = await prisma.campaign.findMany({
    where: { workspaceId: ctx.workspace.id },
    include: {
      agent: true,
      list: { include: { _count: { select: { contacts: true } } } },
      _count: { select: { calls: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const summaries = await campaignListSummaries(campaigns.map((c) => c.id));
  return NextResponse.json(
    campaigns.map((campaign) => ({
      ...campaign,
      analytics: summaries[campaign.id],
    })),
  );
}

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const body = (await req.json()) as {
    name?: string;
    agentId?: string;
    listId?: string;
    concurrency?: number;
  };
  if (!body.name?.trim() || !body.agentId || !body.listId) {
    return NextResponse.json({ error: "Name, agent, and contact list are required" }, { status: 400 });
  }
  const [agent, list] = await Promise.all([
    prisma.agent.findFirst({ where: { id: body.agentId, workspaceId: ctx.workspace.id } }),
    prisma.contactList.findFirst({ where: { id: body.listId, workspaceId: ctx.workspace.id } }),
  ]);
  if (!agent || !list) return NextResponse.json({ error: "Agent or list not found" }, { status: 400 });

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: ctx.workspace.id,
      name: body.name.trim(),
      agentId: agent.id,
      listId: list.id,
      concurrency: Math.min(Math.max(Number(body.concurrency) || 1, 1), 10),
    },
  });
  return NextResponse.json(campaign);
}
