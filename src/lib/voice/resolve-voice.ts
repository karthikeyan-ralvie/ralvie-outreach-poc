import { listElevenVoices } from "../elevenlabs";

const PREFERRED = ["rachel", "sarah", "jessica", "matilda", "charlotte", "lily", "alice", "george"];

let cachedDefault: string | null | undefined;

export async function resolveVoiceId(apiKey: string | null, voiceId: string | null | undefined) {
  if (voiceId) return voiceId;
  if (!apiKey) return null;
  if (cachedDefault !== undefined) return cachedDefault;

  try {
    const voices = await listElevenVoices(apiKey);
    const preferred = voices.find((v) => PREFERRED.some((n) => v.name.toLowerCase().includes(n)));
    cachedDefault = preferred?.voice_id || voices[0]?.voice_id || null;
    console.log("[tts-voice]", preferred?.name || voices[0]?.name || "none", cachedDefault ? "ok" : "missing");
  } catch (err) {
    console.log("[tts-voice]", err instanceof Error ? err.message.slice(0, 120) : "list failed");
    cachedDefault = null;
  }
  return cachedDefault;
}
