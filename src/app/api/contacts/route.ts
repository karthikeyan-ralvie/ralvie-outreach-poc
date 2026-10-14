import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export async function GET() {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const lists = await prisma.contactList.findMany({
    where: { workspaceId: ctx.workspace.id },
    include: { _count: { select: { contacts: true, campaigns: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(lists);
}

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const body = (await req.json()) as { name?: string; countryCode?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const countryCode = body.countryCode?.trim() || "+91";
  const list = await prisma.contactList.create({
    data: { workspaceId: ctx.workspace.id, name: body.name.trim(), countryCode },
  });
  return NextResponse.json(list);
}
