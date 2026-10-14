import { NextResponse } from "next/server";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { decrypt } from "./crypto";

export async function requireWorkspace() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
    include: { workspace: { include: { settings: true } } },
  });

  if (!member) {
    return {
      error: NextResponse.json({ error: "No workspace" }, { status: 403 }),
    } as const;
  }

  return { session, workspace: member.workspace, member } as const;
}

export function secretsOf(settings: {
  deepseekApiKey?: string | null;
  elevenlabsApiKey?: string | null;
  twilioAccountSid?: string | null;
  twilioAuthToken?: string | null;
  twilioFromNumber?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPass?: string | null;
  smtpFrom?: string | null;
  webhookBaseUrl?: string | null;
} | null) {
  return {
    deepseekApiKey: decrypt(settings?.deepseekApiKey) || process.env.DEEPSEEK_API_KEY || null,
    elevenlabsApiKey: decrypt(settings?.elevenlabsApiKey) || process.env.ELEVENLABS_API_KEY || null,
    twilioAccountSid: decrypt(settings?.twilioAccountSid) || settings?.twilioAccountSid || null,
    twilioAuthToken: decrypt(settings?.twilioAuthToken),
    twilioFromNumber: settings?.twilioFromNumber || null,
    smtpHost: settings?.smtpHost || null,
    smtpPort: settings?.smtpPort || null,
    smtpUser: settings?.smtpUser || null,
    smtpPass: decrypt(settings?.smtpPass),
    smtpFrom: settings?.smtpFrom || null,
    webhookBaseUrl: settings?.webhookBaseUrl || process.env.TWILIO_WEBHOOK_BASE_URL || null,
  };
}

export function webhookBase(settings: { webhookBaseUrl?: string | null } | null) {
  return (
    settings?.webhookBaseUrl ||
    process.env.TWILIO_WEBHOOK_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
