import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace, secretsOf } from "@/lib/workspace";

export const runtime = "nodejs";

/** Twilio voice recordings are available as mp3 or wav (not true video mp4). */
const FORMATS: Record<string, { ext: string; contentType: string }> = {
  mp3: { ext: "mp3", contentType: "audio/mpeg" },
  wav: { ext: "wav", contentType: "audio/wav" },
  // Alias: some UIs ask for mp4; serve mp3 audio with a clear filename
  mp4: { ext: "mp3", contentType: "audio/mpeg" },
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const call = await prisma.call.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!call?.recordingSid && !call?.recordingUrl) {
    return NextResponse.json({ error: "No recording" }, { status: 404 });
  }
  const secrets = secretsOf(ctx.workspace.settings);
  if (!secrets.twilioAccountSid || !secrets.twilioAuthToken) {
    return NextResponse.json({ error: "Twilio is not configured" }, { status: 400 });
  }

  const formatKey = (req.nextUrl.searchParams.get("format") || "mp3").toLowerCase();
  const format = FORMATS[formatKey] || FORMATS.mp3;
  const download = req.nextUrl.searchParams.get("download") === "1";

  const baseUrl = call.recordingUrl
    ? call.recordingUrl.replace(/\.(mp3|wav)$/i, "")
    : `https://api.twilio.com/2010-04-01/Accounts/${secrets.twilioAccountSid}/Recordings/${call.recordingSid}`;
  const url = `${baseUrl}.${format.ext === "mp3" && formatKey === "mp4" ? "mp3" : format.ext}`;

  const auth = Buffer.from(`${secrets.twilioAccountSid}:${secrets.twilioAuthToken}`).toString("base64");
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) return NextResponse.json({ error: "Could not load recording" }, { status: 502 });
  const buf = Buffer.from(await res.arrayBuffer());

  const contact = await prisma.call.findFirst({
    where: { id },
    select: { contact: { select: { name: true, phone: true } }, createdAt: true },
  });
  const who = (contact?.contact.name || contact?.contact.phone || id)
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 40);
  const day = (contact?.createdAt || new Date()).toISOString().slice(0, 10);
  const filename = `call-${who}-${day}.${formatKey === "mp4" ? "mp3" : format.ext}`;

  const headers: Record<string, string> = {
    "Content-Type": format.contentType,
    "Cache-Control": "private, max-age=3600",
  };
  if (download) {
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }

  return new NextResponse(new Uint8Array(buf), { headers });
}
