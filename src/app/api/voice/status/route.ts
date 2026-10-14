import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formToParams } from "@/lib/twilio";
import { completeCall } from "@/lib/voice/complete-call";
import { queueCampaignTick } from "@/lib/campaigns/tick";

export const runtime = "nodejs";

const STATUS_MAP: Record<string, string> = {
  queued: "queued",
  initiated: "queued",
  ringing: "ringing",
  "in-progress": "in_progress",
  completed: "completed",
  busy: "busy",
  failed: "failed",
  "no-answer": "no_answer",
  canceled: "failed",
};

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const params = formToParams(form);
  const callId = req.nextUrl.searchParams.get("callId") || "";
  const callStatus = params.CallStatus || "";
  const mapped = STATUS_MAP[callStatus] || callStatus;
  const twilioError = [params.ErrorCode, params.ErrorMessage].filter(Boolean).join(" ");

  console.log("[twilio-status]", callId, callStatus, twilioError || "", maskNumber(params.To || ""));

  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call) return NextResponse.json({ ok: false });

  if (twilioError && !call.error) {
    await prisma.call.update({
      where: { id: call.id },
      data: { error: twilioError.slice(0, 500) },
    });
  }

  if (["busy", "failed", "no_answer"].includes(mapped)) {
    await completeCall(call.id, {
      status: mapped,
      outcome: mapped === "no_answer" ? "no_answer" : mapped,
      error: twilioError || call.error || undefined,
    });
    await queueCampaignTick(call.campaignId);
    return NextResponse.json({ ok: true });
  }

  if (mapped === "completed") {
    const duration = params.CallDuration ? Number(params.CallDuration) : undefined;
    if (duration && !Number.isNaN(duration)) {
      await prisma.call.update({ where: { id: call.id }, data: { duration } });
    }
    await completeCall(call.id, {
      status: "completed",
      outcome: call.outcome || undefined,
      error: twilioError || undefined,
    });
    await queueCampaignTick(call.campaignId);
    return NextResponse.json({ ok: true });
  }

  if (["queued", "ringing", "in_progress"].includes(mapped) && !call.endedAt) {
    await prisma.call.update({
      where: { id: call.id },
      data: { status: mapped, ...(twilioError ? { error: twilioError.slice(0, 500) } : {}) },
    });
  }

  return NextResponse.json({ ok: true });
}

function maskNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "(none)";
  return `+${digits.slice(0, digits.length - 4).replace(/./g, "•")}${digits.slice(-4)}`;
}
