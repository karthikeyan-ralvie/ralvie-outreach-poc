import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const existing = await prisma.crmLead.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as { scenarioId?: string };
  if (!body.scenarioId) return NextResponse.json({ error: "scenarioId required" }, { status: 400 });
  const scenario = await prisma.crmScenario.findFirst({
    where: { id: body.scenarioId, workspaceId: ctx.workspace.id },
  });
  if (!scenario) return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  const lead = await prisma.crmLead.update({
    where: { id },
    data: { scenarioId: scenario.id, reason: `Moved to ${scenario.name}` },
  });
  return NextResponse.json(lead);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const existing = await prisma.crmLead.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.crmLead.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
