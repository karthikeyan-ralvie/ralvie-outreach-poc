export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function statusTone(status: string): "neutral" | "good" | "warn" | "bad" | "run" {
  if (["completed", "sent", "interested"].includes(status)) return "good";
  if (["running", "in_progress", "ringing", "queued"].includes(status)) return "run";
  if (["paused", "callback", "voicemail"].includes(status)) return "warn";
  if (["failed", "busy", "no_answer", "not_interested"].includes(status)) return "bad";
  return "neutral";
}
