import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const list = await prisma.contactList.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { contacts: { orderBy: { createdAt: "desc" }, take: 500 } },
  });
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(list);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const existing = await prisma.contactList.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as { countryCode?: string };
  const countryCode = body.countryCode?.trim();
  if (!countryCode || !/^\+\d{1,4}$/.test(countryCode)) {
    return NextResponse.json({ error: "Choose a valid country code" }, { status: 400 });
  }
  const list = await prisma.contactList.update({
    where: { id },
    data: { countryCode },
    include: { contacts: { orderBy: { createdAt: "desc" }, take: 500 } },
  });
  return NextResponse.json(list);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const existing = await prisma.contactList.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.contactList.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
