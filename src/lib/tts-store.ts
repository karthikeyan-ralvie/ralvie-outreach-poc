import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { synthesizeSpeech } from "./elevenlabs";

const dir = path.join(process.cwd(), "data", "tts");

/** In-memory map of content-hash → file id (survives for process lifetime). */
const memCache = new Map<string, string>();

function cacheKey(voiceId: string, text: string) {
  return createHash("sha1").update(voiceId).update("\n").update(text.trim()).digest("hex");
}

function bucketName() {
  return process.env.SUPABASE_TTS_BUCKET || process.env.TTS_BUCKET || "tts";
}

function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function supabaseClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

function objectPath(id: string) {
  return `${id}.mp3`;
}

export async function saveTtsMp3(apiKey: string, voiceId: string, text: string) {
  const spoken = text.slice(0, 4500).trim();
  const key = cacheKey(voiceId, spoken);
  const hit = memCache.get(key);
  if (hit) {
    try {
      const existing = await readTtsMp3(hit);
      if (existing) return hit;
      memCache.delete(key);
    } catch {
      memCache.delete(key);
    }
  }

  const audio = await synthesizeSpeech(apiKey, voiceId, spoken);
  const id = randomUUID();

  if (supabaseConfigured()) {
    const supabase = await supabaseClient();
    const { error } = await supabase.storage
      .from(bucketName())
      .upload(objectPath(id), audio, { contentType: "audio/mpeg", upsert: true });
    if (error) throw new Error(`TTS upload failed: ${error.message}`);
  } else {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${id}.mp3`), audio);
  }

  memCache.set(key, id);
  // Bound memory growth
  if (memCache.size > 200) {
    const first = memCache.keys().next().value;
    if (first) memCache.delete(first);
  }
  return id;
}

export async function readTtsMp3(id: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) return null;
  if (supabaseConfigured()) {
    try {
      const supabase = await supabaseClient();
      const { data, error } = await supabase.storage.from(bucketName()).download(objectPath(id));
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    } catch {
      return null;
    }
  }
  try {
    return await readFile(path.join(dir, `${id}.mp3`));
  } catch {
    return null;
  }
}
