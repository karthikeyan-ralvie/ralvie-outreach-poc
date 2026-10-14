import { NextRequest, NextResponse } from "next/server";
import { tickCampaign } from "@/lib/campaigns/tick";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron calls this every minute. It advances every running campaign
// because setTimeout chains in tick.ts do not survive on serverless.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided =
    req.nextUrl.searchParams.get("secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const running = await prisma.campaign.findMany({
    where: { status: "running" },
    select: { id: true },
    take: 10,
  });
  const results: Record<string, unknown>[] = [];
  for (const c of running) {
    try {
      results.push({ id: c.id, ...(await tickCampaign(c.id)) });
    } catch (err) {
      results.push({ id: c.id, ok: false, reason: err instanceof Error ? err.message : "tick failed" });
    }
  }
  return NextResponse.json({ ok: true, ticked: results.length, results });
}
