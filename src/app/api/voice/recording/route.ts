import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formToParams } from "@/lib/twilio";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const params = formToParams(form);
  const callId = req.nextUrl.searchParams.get("callId") || "";
  const recordingSid = params.RecordingSid || "";
  const recordingUrl = (params.RecordingUrl || "").replace(/\.json$/i, "");
  if (!callId) return NextResponse.json({ ok: false }, { status: 400 });
  await prisma.call.updateMany({
    where: { id: callId },
    data: {
      recordingSid: recordingSid || undefined,
      recordingUrl: recordingUrl || undefined,
    },
  });
  return NextResponse.json({ ok: true });
}
