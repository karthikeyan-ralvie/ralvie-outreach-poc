import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { campaignAnalytics } from "@/lib/campaigns/analytics";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const lite = req.nextUrl.searchParams.get("lite") === "1";
  const campaign = await prisma.campaign.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: {
      agent: true,
      list: { include: { _count: { select: { contacts: true } } } },
      calls: { include: { contact: true }, orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const analytics = lite ? null : await campaignAnalytics(id, ctx.workspace.id);
  return NextResponse.json({
    ...campaign,
    stats: {
      completed: analytics?.connected || 0,
      failed: analytics?.byOutcome.filter((o) => ["failed", "busy", "no_answer"].includes(o.label)).reduce((n, o) => n + o.count, 0) || 0,
      total: campaign.list._count.contacts,
    },
    analytics,
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const existing = await prisma.campaign.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "running") {
    return NextResponse.json({ error: "Pause the campaign before deleting it" }, { status: 400 });
  }
  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
