"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Card, ErrorText, Field, Input, PageHeader } from "@/components/ui";

type Settings = {
  deepseekApiKeySet: boolean;
  elevenlabsApiKeySet: boolean;
  twilioAccountSidSet: boolean;
  twilioAuthTokenSet: boolean;
  twilioFromNumber: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassSet: boolean;
  smtpFrom: string;
  webhookBaseUrl: string;
};

export default function SettingsPage() {
  const [form, setForm] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState<Settings | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Settings>("/api/settings").then((s) => {
      setLoaded(s);
      setForm({
        twilioFromNumber: s.twilioFromNumber,
        smtpHost: s.smtpHost,
        smtpPort: String(s.smtpPort),
        smtpUser: s.smtpUser,
        smtpFrom: s.smtpFrom,
        webhookBaseUrl: s.webhookBaseUrl,
      });
    });
  }, []);

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      await api("/api/settings", { method: "POST", body: JSON.stringify(form) });
      setMsg("Saved.");
      const s = await api<Settings>("/api/settings");
      setLoaded(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Keys stay in your workspace, encrypted at rest. Leave a secret blank to keep the saved value."
      />
      <form onSubmit={save} className="grid max-w-3xl gap-4">
        <Card className="space-y-4">
          <p className="serif text-xl">Models</p>
          <Field label={`DeepSeek API key${loaded?.deepseekApiKeySet ? " (saved)" : ""}`}>
            <Input type="password" placeholder="sk-…" value={form.deepseekApiKey || ""} onChange={(e) => set("deepseekApiKey", e.target.value)} />
          </Field>
          <Field label={`ElevenLabs API key${loaded?.elevenlabsApiKeySet ? " (saved)" : ""}`}>
            <Input type="password" value={form.elevenlabsApiKey || ""} onChange={(e) => set("elevenlabsApiKey", e.target.value)} />
          </Field>
        </Card>
        <Card className="space-y-4">
          <p className="serif text-xl">Twilio</p>
          <Field label={`Account SID${loaded?.twilioAccountSidSet ? " (saved)" : ""}`}>
            <Input value={form.twilioAccountSid || ""} onChange={(e) => set("twilioAccountSid", e.target.value)} />
          </Field>
          <Field label={`Auth token${loaded?.twilioAuthTokenSet ? " (saved)" : ""}`}>
            <Input type="password" value={form.twilioAuthToken || ""} onChange={(e) => set("twilioAuthToken", e.target.value)} />
          </Field>
          <Field label="From number">
            <Input placeholder="+14015870638" value={form.twilioFromNumber || ""} onChange={(e) => set("twilioFromNumber", e.target.value)} />
            <p className="mt-1 text-xs text-ink-soft">
              Use E.164, e.g. +14015870638. A US trial number can place a call to a verified Indian mobile, but the handset often never rings until you upgrade Twilio and enable India in Voice geographic permissions.
            </p>
          </Field>
          <Field label="Public webhook base URL (ngrok HTTPS origin)">
            <Input placeholder="https://abc.ngrok-free.app" value={form.webhookBaseUrl || ""} onChange={(e) => set("webhookBaseUrl", e.target.value)} />
          </Field>
        </Card>
        <Card className="space-y-4">
          <p className="serif text-xl">Email (SMTP)</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Host">
              <Input value={form.smtpHost || ""} onChange={(e) => set("smtpHost", e.target.value)} />
            </Field>
            <Field label="Port">
              <Input value={form.smtpPort || ""} onChange={(e) => set("smtpPort", e.target.value)} />
            </Field>
            <Field label="Username">
              <Input value={form.smtpUser || ""} onChange={(e) => set("smtpUser", e.target.value)} />
            </Field>
            <Field label={`Password${loaded?.smtpPassSet ? " (saved)" : ""}`}>
              <Input type="password" value={form.smtpPass || ""} onChange={(e) => set("smtpPass", e.target.value)} />
            </Field>
          </div>
          <Field label="From address">
            <Input value={form.smtpFrom || ""} onChange={(e) => set("smtpFrom", e.target.value)} />
          </Field>
        </Card>
        <ErrorText>{error}</ErrorText>
        {msg ? <p className="text-sm text-pine">{msg}</p> : null}
        <Button type="submit" className="w-fit">Save settings</Button>
      </form>
    </div>
  );
}
