import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { requireWorkspace } from "@/lib/workspace";
import { toCallerId } from "@/lib/contacts/map-columns";

export async function GET() {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const s = ctx.workspace.settings;
  return NextResponse.json({
    deepseekApiKeySet: Boolean(s?.deepseekApiKey),
    elevenlabsApiKeySet: Boolean(s?.elevenlabsApiKey),
    twilioAccountSidSet: Boolean(s?.twilioAccountSid),
    twilioAuthTokenSet: Boolean(s?.twilioAuthToken),
    twilioFromNumber: s?.twilioFromNumber || "",
    smtpHost: s?.smtpHost || "",
    smtpPort: s?.smtpPort || 587,
    smtpUser: s?.smtpUser || "",
    smtpPassSet: Boolean(s?.smtpPass),
    smtpFrom: s?.smtpFrom || "",
    webhookBaseUrl: s?.webhookBaseUrl || process.env.TWILIO_WEBHOOK_BASE_URL || "",
  });
}

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const body = (await req.json()) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const str = (key: string) => (typeof body[key] === "string" ? body[key].trim() : "");

  if (str("deepseekApiKey")) data.deepseekApiKey = encrypt(str("deepseekApiKey"));
  if (str("elevenlabsApiKey")) data.elevenlabsApiKey = encrypt(str("elevenlabsApiKey"));
  if (str("twilioAccountSid")) data.twilioAccountSid = encrypt(str("twilioAccountSid"));
  if (str("twilioAuthToken")) data.twilioAuthToken = encrypt(str("twilioAuthToken"));
  if ("twilioFromNumber" in body) data.twilioFromNumber = toCallerId(str("twilioFromNumber")) || null;
  if ("smtpHost" in body) data.smtpHost = str("smtpHost") || null;
  if ("smtpPort" in body) data.smtpPort = Number(body.smtpPort) || 587;
  if ("smtpUser" in body) data.smtpUser = str("smtpUser") || null;
  if (str("smtpPass")) data.smtpPass = encrypt(str("smtpPass"));
  if ("smtpFrom" in body) data.smtpFrom = str("smtpFrom") || null;
  if ("webhookBaseUrl" in body) data.webhookBaseUrl = str("webhookBaseUrl").replace(/\/$/, "") || null;

  await prisma.workspaceSettings.upsert({
    where: { workspaceId: ctx.workspace.id },
    update: data,
    create: { workspaceId: ctx.workspace.id, ...data },
  });

  // Keep DeepSeek / ElevenLabs / Twilio keys the same across every workspace this user belongs to
  const sharedKeys = [
    "deepseekApiKey",
    "elevenlabsApiKey",
    "twilioAccountSid",
    "twilioAuthToken",
    "twilioFromNumber",
    "webhookBaseUrl",
  ] as const;
  const shared: Record<string, unknown> = {};
  for (const key of sharedKeys) {
    if (key in data) shared[key] = data[key];
  }
  if (Object.keys(shared).length) {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: ctx.session.user.id },
      select: { workspaceId: true },
    });
    for (const m of memberships) {
      if (m.workspaceId === ctx.workspace.id) continue;
      await prisma.workspaceSettings.upsert({
        where: { workspaceId: m.workspaceId },
        update: shared,
        create: { workspaceId: m.workspaceId, ...shared },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
