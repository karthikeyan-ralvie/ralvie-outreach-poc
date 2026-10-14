import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import { crawlWebsite } from "@/lib/knowledge/crawl";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const kb = await prisma.knowledgeBase.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!kb) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as { url?: string };
  let url = body.url?.trim() || "";
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "A valid website URL is required" }, { status: 400 });
  }

  const doc = await prisma.knowledgeDoc.create({
    data: {
      knowledgeBaseId: id,
      type: "website",
      title: `Syncing ${url}`,
      url,
      content: "Crawling…",
      metadata: { status: "running" },
    },
  });

  try {
    await crawlWebsite(doc.id, url);
  } catch (err) {
    await prisma.knowledgeDoc.update({
      where: { id: doc.id },
      data: {
        content: err instanceof Error ? err.message : "Crawl failed",
        metadata: { status: "failed" },
      },
    });
  }

  const fresh = await prisma.knowledgeDoc.findUnique({ where: { id: doc.id } });
  return NextResponse.json(fresh);
}
