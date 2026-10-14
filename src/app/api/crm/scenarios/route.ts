import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { slugKey } from "@/lib/utils";

export async function GET() {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const scenarios = await prisma.crmScenario.findMany({
    where: { workspaceId: ctx.workspace.id },
    include: { _count: { select: { leads: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(scenarios);
}

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const body = (await req.json()) as { name?: string; description?: string; phrases?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  let slug = slugKey(body.name);
  const clash = await prisma.crmScenario.findUnique({
    where: { workspaceId_slug: { workspaceId: ctx.workspace.id, slug } },
  });
  if (clash) slug = `${slug}_${Date.now().toString(36)}`;
  const item = await prisma.crmScenario.create({
    data: {
      workspaceId: ctx.workspace.id,
      name: body.name.trim(),
      slug,
      description: body.description?.trim() || null,
      phrases: body.phrases?.trim() || body.name.trim(),
    },
  });
  return NextResponse.json(item);
}
