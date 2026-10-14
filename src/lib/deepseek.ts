export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type DeepseekOpts = {
  json?: boolean;
  /** Cap output tokens (voice turns should stay short). */
  maxTokens?: number;
  /** Cap total prompt size before send. */
  maxChars?: number;
  /** Fetch timeout ms. */
  timeoutMs?: number;
  /** Prefer a single request — skip the json-mode retry. */
  singleAttempt?: boolean;
};

export async function deepseekChat(
  apiKey: string,
  messages: ChatMessage[],
  jsonOrOpts: boolean | DeepseekOpts = false,
) {
  const opts: DeepseekOpts =
    typeof jsonOrOpts === "boolean" ? { json: jsonOrOpts } : jsonOrOpts || {};
  const json = Boolean(opts.json);
  const maxTokens = opts.maxTokens ?? (json ? 360 : 220);
  const maxChars = opts.maxChars ?? 16000;
  const timeoutMs = opts.timeoutMs ?? 10000;
  const singleAttempt = opts.singleAttempt ?? false;

  const trimmed = trimMessages(messages, maxChars);

  const attempt = async (useJson: boolean) => {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: trimmed,
        temperature: useJson ? 0.55 : 0.65,
        max_tokens: useJson ? maxTokens : Math.min(maxTokens, 180),
        ...(useJson ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`DeepSeek error ${res.status}: ${text.slice(0, 400)}`);
    }

    let data: {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      error?: { message?: string };
    };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      throw new Error(`DeepSeek invalid JSON body: ${text.slice(0, 200)}`);
    }

    const content = data.choices?.[0]?.message?.content?.trim() || "";
    const finish = data.choices?.[0]?.finish_reason || "";
    if (!content) {
      throw new Error(
        `DeepSeek empty response finish=${finish}${data.error?.message ? ` err=${data.error.message}` : ""} body=${text.slice(0, 180)}`,
      );
    }
    return content;
  };

  // Voice: prefer JSON mode for structured speak; fall back to plain wrap.
  if (json) {
    try {
      const structured = await attempt(true);
      if (structured.includes("{") && structured.includes("}")) return structured;
      const speak = structured.replace(/^```[\s\S]*?```$/g, "").trim().slice(0, 500);
      return JSON.stringify({
        speak,
        intakeAnswers: {},
        scenarioTag: null,
        outcome: null,
        endCall: false,
        askQuestionKey: null,
      });
    } catch (err) {
      console.error("[deepseek-json]", err instanceof Error ? err.message.slice(0, 180) : err);
      if (singleAttempt) {
        // One plain retry so a JSON-mode glitch doesn't blank the turn
        try {
          const plain = await attempt(false);
          if (plain.includes("{") && plain.includes("}")) return plain;
          const speak = plain.replace(/^```[\s\S]*?```$/g, "").trim().slice(0, 500);
          return JSON.stringify({
            speak,
            intakeAnswers: {},
            scenarioTag: null,
            outcome: null,
            endCall: false,
            askQuestionKey: null,
          });
        } catch (err2) {
          console.error("[deepseek-plain]", err2 instanceof Error ? err2.message.slice(0, 180) : err2);
          throw err2;
        }
      }
      try {
        return await attempt(false);
      } catch (err2) {
        console.error("[deepseek-plain]", err2 instanceof Error ? err2.message.slice(0, 180) : err2);
        throw err2;
      }
    }
  }

  return attempt(false);
}

function trimMessages(messages: ChatMessage[], maxChars: number) {
  const copy = messages.map((m) => ({ ...m }));
  let total = copy.reduce((n, m) => n + m.content.length, 0);
  if (total <= maxChars) return copy;

  // Never chop the first system message (owner custom prompt). Trim Knowledge in later system msgs.
  for (let i = 0; i < copy.length; i++) {
    const m = copy[i];
    if (m.role !== "system") continue;
    if (i === 0) continue; // protect owner prompt
    if (m.content.length <= 2800) continue;
    const knowledgeMarker = "\nKnowledge:\n";
    const ki = m.content.indexOf(knowledgeMarker);
    if (ki > 0) {
      const head = m.content.slice(0, ki + knowledgeMarker.length);
      const rest = m.content.slice(ki + knowledgeMarker.length);
      const openMarker = "\nEligible intake";
      const oi = rest.indexOf(openMarker);
      const knowledge = oi >= 0 ? rest.slice(0, oi) : rest;
      const tail = oi >= 0 ? rest.slice(oi) : "";
      m.content = head + knowledge.slice(0, 900) + "\n...(knowledge truncated)" + tail;
    } else if (m.content.length > 4000) {
      m.content = m.content.slice(0, 4000) + "\n...(truncated)";
    }
  }
  total = copy.reduce((n, m) => n + m.content.length, 0);
  while (total > maxChars && copy.length > 4) {
    const idx = copy.findIndex((m, i) => i > 1 && m.role !== "system");
    if (idx < 0) break;
    total -= copy[idx].content.length;
    copy.splice(idx, 1);
  }
  // Keep only last few turns if still too large
  while (total > maxChars && copy.length > 5) {
    const idx = copy.findIndex((m, i) => i > 2 && m.role !== "system");
    if (idx < 0) break;
    total -= copy[idx].content.length;
    copy.splice(idx, 1);
  }
  return copy;
}
