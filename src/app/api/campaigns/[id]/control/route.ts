import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace, secretsOf } from "@/lib/workspace";
import { queueCampaignTick, warmupVoiceRoute } from "@/lib/campaigns/tick";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as { action?: string };

  if (body.action === "start") {
    const secrets = secretsOf(ctx.workspace.settings);
    if (!secrets.twilioAccountSid || !secrets.twilioAuthToken || !secrets.twilioFromNumber) {
      return NextResponse.json({ error: "Add Twilio credentials and a from-number in Settings" }, { status: 400 });
    }
    if (!secrets.deepseekApiKey) {
      return NextResponse.json({ error: "Add a DeepSeek API key in Settings" }, { status: 400 });
    }
    await prisma.campaign.update({
      where: { id },
      data: { status: "running", startedAt: campaign.startedAt || new Date() },
    });
    void warmupVoiceRoute();
    await queueCampaignTick(id);
    return NextResponse.json({ ok: true, status: "running" });
  }

  if (body.action === "pause") {
    await prisma.campaign.update({ where: { id }, data: { status: "paused" } });
    return NextResponse.json({ ok: true, status: "paused" });
  }

  if (body.action === "stop") {
    await prisma.campaign.update({ where: { id }, data: { status: "completed" } });
    return NextResponse.json({ ok: true, status: "completed" });
  }

  if (body.action === "restart") {
    await prisma.campaign.update({ where: { id }, data: { status: "paused" } });
    await prisma.call.deleteMany({ where: { campaignId: id } });
    await prisma.campaign.update({
      where: { id },
      data: { status: "draft", startedAt: null },
    });
    return NextResponse.json({ ok: true, status: "draft" });
  }

  if (body.action === "duplicate") {
    const copy = await prisma.campaign.create({
      data: {
        workspaceId: campaign.workspaceId,
        name: copyName(campaign.name),
        agentId: campaign.agentId,
        listId: campaign.listId,
        concurrency: campaign.concurrency,
        status: "draft",
      },
    });
    return NextResponse.json({ ok: true, id: copy.id, status: "draft" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

function copyName(name: string) {
  const base = name.replace(/\s+copy(?:\s+\d+)?$/i, "").trim() || name;
  return `${base} copy`;
}
