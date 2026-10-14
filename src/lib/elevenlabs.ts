export type ElevenVoice = {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
};

export async function listElevenVoices(apiKey: string): Promise<ElevenVoice[]> {
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ElevenLabs voices error ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { voices?: ElevenVoice[] };
  return data.voices || [];
}

export async function synthesizeSpeech(apiKey: string, voiceId: string, text: string) {
  // Keep phone replies short — less audio to generate = faster turns
  const spoken = text
    .replace(/\s+/g, " ")
    .replace(/([.!?])\s+/g, "$1 ")
    .trim()
    .slice(0, 500);

  const trySynth = async (model: string) => {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: spoken,
        model_id: model,
        // Lean settings = faster Flash synthesis
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.7,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ElevenLabs TTS error ${res.status}: ${err.slice(0, 300)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  };

  try {
    // Flash keeps turns fast on phone
    return await trySynth("eleven_flash_v2_5");
  } catch (err) {
    console.log("[tts-retry]", err instanceof Error ? err.message.slice(0, 120) : "flash failed");
    return trySynth("eleven_turbo_v2_5");
  }
}
