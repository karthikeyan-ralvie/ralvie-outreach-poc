import { NextResponse } from "next/server";
import { requireWorkspace, secretsOf } from "@/lib/workspace";
import { listElevenVoices } from "@/lib/elevenlabs";

export async function GET() {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const secrets = secretsOf(ctx.workspace.settings);
  if (!secrets.elevenlabsApiKey) {
    return NextResponse.json({ error: "Add your ElevenLabs API key in Settings first.", voices: [] }, { status: 400 });
  }
  try {
    const voices = await listElevenVoices(secrets.elevenlabsApiKey);
    return NextResponse.json({ voices });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load voices", voices: [] },
      { status: 502 },
    );
  }
}
