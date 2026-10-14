"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Calendar,
  ChevronDown,
  ClipboardList,
  Globe,
  Languages,
  Lightbulb,
  Link2,
  MessageCircle,
  PhoneForwarded,
  PhoneCall,
  Send,
  Volume2,
} from "lucide-react";
import { api } from "@/lib/client";
import { Button, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";

type Voice = { voice_id: string; name: string };
type Faq = { question: string; answer: string };
type Question = { key: string; prompt: string; type: string; options?: string[]; scenarioSlug?: string };
type Playbook = { name: string; when: string; instructions: string };
type Scenario = { id: string; name: string; slug: string };

type AgentPayload = {
  id: string;
  name: string;
  role: string;
  language: string;
  systemPrompt: string;
  greeting: string;
  voicemailMessage: string | null;
  elevenlabsVoiceId: string | null;
  playbooks: Playbook[] | null;
  transferTo: string | null;
  transferPhrases: string | null;
  smsMessage: string | null;
  bookingNotes: string | null;
  followUpText: string | null;
  webhookUrl: string | null;
  knowledge: { businessInfo: string; websiteUrl: string; websitePreview: string; faqs: Faq[] };
  intake: { questions: Question[] };
};

const emptyForm = {
  name: "Ava",
  role: "sales",
  language: "English",
  greeting: "Hey, I am {agent name}. Is this {first name}?",
  voicemailMessage: "Sorry we missed you. We will try again soon.",
  elevenlabsVoiceId: "",
  systemPrompt:
    "After they confirm their name, pitch Ralvie AI Frontdesk: an AI front desk that answers business calls. Collect intake answers one at a time, repeat each answer back, and do not hang up if they talk over you.",
  businessInfo: "",
  websiteUrl: "",
  faqs: [] as Faq[],
  playbooks: [] as Playbook[],
  questions: [] as Question[],
  transferTo: "",
  transferPhrases: "speak to a person, transfer, human",
  smsMessage: "",
  bookingNotes: "",
  followUpText: "",
  webhookUrl: "",
};

export function AgentEditor({ id }: { id: string | null }) {
  const isNew = !id;
  const router = useRouter();
  const [open, setOpen] = useState<string>(isNew ? "greeting" : "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    api<{ voices: Voice[] }>("/api/voices")
      .then((d) => setVoices(d.voices || []))
      .catch(() => setVoices([]));
    api<Scenario[]>("/api/crm/scenarios")
      .then((s) => setScenarios(s || []))
      .catch(() => setScenarios([]));
    if (!id) return;
    api<AgentPayload>(`/api/agents/${id}`).then((a) =>
      setForm({
        name: a.name,
        role: a.role,
        language: a.language || "English",
        greeting: a.greeting,
        voicemailMessage: a.voicemailMessage || "",
        elevenlabsVoiceId: a.elevenlabsVoiceId || "",
        systemPrompt: a.systemPrompt,
        businessInfo: a.knowledge?.businessInfo || "",
        websiteUrl: a.knowledge?.websiteUrl || "",
        faqs: a.knowledge?.faqs?.length ? a.knowledge.faqs : [],
        playbooks: Array.isArray(a.playbooks) ? a.playbooks : [],
        questions: a.intake?.questions?.length
          ? a.intake.questions.map((q) => ({
              key: q.key,
              prompt: q.prompt,
              type: q.type,
              options: q.options || [],
              scenarioSlug: q.scenarioSlug || "",
            }))
          : [],
        transferTo: a.transferTo || "",
        transferPhrases: a.transferPhrases || "",
        smsMessage: a.smsMessage || "",
        bookingNotes: a.bookingNotes || "",
        followUpText: a.followUpText || "",
        webhookUrl: a.webhookUrl || "",
      }),
    );
  }, [id]);

  function toggle(key: string) {
    setOpen((current) => (current === key ? "" : key));
  }

  async function save() {
    setError("");
    setSaving(true);
    const payload = {
      ...form,
      elevenlabsVoiceId: form.elevenlabsVoiceId || null,
      transferTo: form.transferTo || null,
      transferPhrases: form.transferPhrases || null,
      smsMessage: form.smsMessage || null,
      bookingNotes: form.bookingNotes || null,
      followUpText: form.followUpText || null,
      webhookUrl: form.webhookUrl || null,
    };
    try {
      if (id) {
        await api(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        const created = await api<{ id: string }>("/api/agents", { method: "POST", body: JSON.stringify(payload) });
        router.push(`/agents/${created.id}`);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const voiceName = voices.find((v) => v.voice_id === form.elevenlabsVoiceId)?.name;
  const faqPreview = form.faqs[0]?.question || "Frequently asked questions this agent can reference.";
  const intakePreview = form.questions.length
    ? `${form.questions.length} question${form.questions.length === 1 ? "" : "s"} to collect on the call`
    : "Not set up yet";

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Input
            className="serif border-0 bg-transparent px-0 text-4xl shadow-none ring-0 focus:ring-0"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <p className="text-sm text-ink-soft">
            Everything this agent knows and does on a call. Select a card to edit it. If Custom instructions say “You are
            Alex…”, calls use that name in the greeting — not a placeholder title.
          </p>
        </div>
        <div className="flex gap-2">
          {id ? (
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm("Delete this agent and its knowledge and intake form?")) return;
                await api(`/api/agents/${id}`, { method: "DELETE" });
                router.push("/agents");
              }}
            >
              Delete
            </Button>
          ) : null}
          <Button onClick={save} disabled={saving}>
            <PhoneCall size={16} />
            {saving ? "Saving…" : isNew ? "Save agent" : "Save & test"}
          </Button>
        </div>
      </div>

      <Step n={1} title="The phone rings" subtitle="How the call is answered">
        <SetupCard
          icon={<MessageCircle size={18} />}
          title="Greeting"
          preview={form.greeting}
          open={open === "greeting"}
          onToggle={() => toggle("greeting")}
        >
          <Field label="What they hear first">
            <Textarea value={form.greeting} onChange={(e) => setForm({ ...form, greeting: e.target.value })} />
          </Field>
          <p className="text-xs text-ink-soft">
            Use {"{agent name}"} and {"{first name}"}. {"{agent name}"} comes from Custom instructions when they say “You
            are Alex…”, otherwise from the agent title above.
          </p>
          <Field label="Voicemail">
            <Textarea value={form.voicemailMessage} onChange={(e) => setForm({ ...form, voicemailMessage: e.target.value })} />
          </Field>
        </SetupCard>
        <SetupCard
          icon={<Volume2 size={18} />}
          title="Voice"
          preview={voiceName ? `${voiceName}` : "Select an ElevenLabs voice"}
          open={open === "voice"}
          onToggle={() => toggle("voice")}
        >
          <Field label="ElevenLabs voice">
            <Select value={form.elevenlabsVoiceId} onChange={(e) => setForm({ ...form, elevenlabsVoiceId: e.target.value })}>
              <option value="">Select a voice</option>
              {voices.map((v) => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-ink-soft">Add your ElevenLabs key in Settings to load voices.</p>
        </SetupCard>
        <SetupCard
          icon={<Languages size={18} />}
          title="Languages"
          preview={form.language}
          open={open === "language"}
          onToggle={() => toggle("language")}
        >
          <Field label="Primary language">
            <Select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
              {["English", "Spanish", "French", "Hindi", "Arabic", "Portuguese", "German"].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="sales">Sales</option>
              <option value="support">Support / receptionist</option>
              <option value="custom">Custom</option>
            </Select>
          </Field>
        </SetupCard>
      </Step>

      <Step n={2} title="What it knows" subtitle="Answers it can give — private to this agent">
        <SetupCard
          icon={<BookOpen size={18} />}
          title="Business information"
          preview={form.businessInfo || "Name, address, hours, products, policies"}
          open={open === "business"}
          onToggle={() => toggle("business")}
        >
          <Field label="Business details">
            <Textarea
              className="min-h-40"
              placeholder="Business name, address, hours, what you sell, pricing, policies…"
              value={form.businessInfo}
              onChange={(e) => setForm({ ...form, businessInfo: e.target.value })}
            />
          </Field>
        </SetupCard>
        <SetupCard
          icon={<span className="text-lg font-semibold">?</span>}
          title="Common questions"
          preview={faqPreview}
          open={open === "faqs"}
          onToggle={() => toggle("faqs")}
        >
          <p className="mb-3 text-sm text-ink-soft">FAQs only this agent can reference.</p>
          <div className="space-y-3">
            {form.faqs.map((faq, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-line p-3">
                <Input
                  placeholder="Question"
                  value={faq.question}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      faqs: form.faqs.map((f, idx) => (idx === i ? { ...f, question: e.target.value } : f)),
                    })
                  }
                />
                <Textarea
                  placeholder="Answer"
                  value={faq.answer}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      faqs: form.faqs.map((f, idx) => (idx === i ? { ...f, answer: e.target.value } : f)),
                    })
                  }
                />
                <button
                  type="button"
                  className="text-left text-xs text-ink-soft"
                  onClick={() => setForm({ ...form, faqs: form.faqs.filter((_, idx) => idx !== i) })}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => setForm({ ...form, faqs: [...form.faqs, { question: "", answer: "" }] })}
          >
            Add question
          </Button>
        </SetupCard>
        <SetupCard
          icon={<span className="font-mono text-sm">&gt;_</span>}
          title="Custom instructions"
          preview={form.systemPrompt}
          open={open === "instructions"}
          onToggle={() => toggle("instructions")}
        >
          <Field label="How this agent should behave on the call">
            <Textarea
              className="min-h-44"
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              placeholder="Tone, pitch, what to say after name confirm, how to qualify, when to offer a demo, how to close…"
            />
          </Field>
          <p className="mt-2 text-xs text-ink-soft">
            This is the primary brain of the agent. Live calls follow these instructions for tone and process; knowledge,
            scenarios, and intake questions support them.
          </p>
        </SetupCard>
        <SetupCard
          icon={<Globe size={18} />}
          title="Website"
          preview={form.websiteUrl || "Sync pages from your site into this agent"}
          open={open === "website"}
          onToggle={() => toggle("website")}
        >
          <Field label="Website URL">
            <Input
              placeholder="https://example.com"
              value={form.websiteUrl}
              onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
            />
          </Field>
          <p className="text-xs text-ink-soft">Saved with the agent. Syncs when you click Save.</p>
        </SetupCard>
        <SetupCard
          icon={<Lightbulb size={18} />}
          title="Playbooks"
          preview={
            form.playbooks[0]?.name
              ? form.playbooks.map((p) => p.name).join(", ")
              : "Focused instructions that switch on based on what the call is about"
          }
          open={open === "playbooks"}
          onToggle={() => toggle("playbooks")}
        >
          <div className="space-y-3">
            {form.playbooks.map((p, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-line p-3">
                <Input
                  placeholder="Playbook name (e.g. Pricing objection)"
                  value={p.name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      playbooks: form.playbooks.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)),
                    })
                  }
                />
                <Input
                  placeholder="When to use it"
                  value={p.when}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      playbooks: form.playbooks.map((x, idx) => (idx === i ? { ...x, when: e.target.value } : x)),
                    })
                  }
                />
                <Textarea
                  placeholder="What to do / say"
                  value={p.instructions}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      playbooks: form.playbooks.map((x, idx) => (idx === i ? { ...x, instructions: e.target.value } : x)),
                    })
                  }
                />
                <button
                  type="button"
                  className="text-left text-xs text-ink-soft"
                  onClick={() => setForm({ ...form, playbooks: form.playbooks.filter((_, idx) => idx !== i) })}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() =>
              setForm({ ...form, playbooks: [...form.playbooks, { name: "", when: "", instructions: "" }] })
            }
          >
            Add playbook
          </Button>
        </SetupCard>
      </Step>

      <Step n={3} title="What it can do" subtitle="Actions during the call">
        <SetupCard
          icon={<PhoneForwarded size={18} />}
          title="Transfer the call"
          preview={form.transferTo ? `Transfer to ${form.transferTo}` : "Not set up yet"}
          open={open === "transfer"}
          onToggle={() => toggle("transfer")}
        >
          <Field label="Transfer to number">
            <Input placeholder="+15551234567" value={form.transferTo} onChange={(e) => setForm({ ...form, transferTo: e.target.value })} />
          </Field>
          <Field label="Phrases that trigger a transfer">
            <Input value={form.transferPhrases} onChange={(e) => setForm({ ...form, transferPhrases: e.target.value })} />
          </Field>
        </SetupCard>
        <SetupCard
          icon={<MessageCircle size={18} />}
          title="Send a text"
          preview={form.smsMessage || "Not set up yet"}
          open={open === "sms"}
          onToggle={() => toggle("sms")}
        >
          <Field label="Message the agent may promise to send">
            <Textarea value={form.smsMessage} onChange={(e) => setForm({ ...form, smsMessage: e.target.value })} />
          </Field>
        </SetupCard>
        <SetupCard
          icon={<Calendar size={18} />}
          title="Book an appointment"
          preview={form.bookingNotes || "Not set up yet"}
          open={open === "booking"}
          onToggle={() => toggle("booking")}
        >
          <Field label="How booking should work on this call">
            <Textarea
              placeholder="Collect a preferred date and time, then confirm someone will send a calendar invite."
              value={form.bookingNotes}
              onChange={(e) => setForm({ ...form, bookingNotes: e.target.value })}
            />
          </Field>
        </SetupCard>
        <SetupCard
          icon={<ClipboardList size={18} />}
          title="Collect information"
          preview={intakePreview}
          open={open === "intake"}
          onToggle={() => toggle("intake")}
        >
          <p className="mb-3 text-sm text-ink-soft">
            Link questions to a CRM scenario so the agent only asks them when that situation comes up. Leave as
            “Anytime” for general discovery.
          </p>
          <div className="space-y-3">
            {form.questions.map((q, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-line p-3 md:grid-cols-3">
                <Input
                  placeholder="Field key"
                  value={q.key}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      questions: form.questions.map((x, idx) => (idx === i ? { ...x, key: e.target.value } : x)),
                    })
                  }
                />
                <Input
                  className="md:col-span-2"
                  placeholder="Spoken question"
                  value={q.prompt}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      questions: form.questions.map((x, idx) => (idx === i ? { ...x, prompt: e.target.value } : x)),
                    })
                  }
                />
                <Select
                  value={q.type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      questions: form.questions.map((x, idx) => (idx === i ? { ...x, type: e.target.value } : x)),
                    })
                  }
                >
                  <option value="text">Text</option>
                  <option value="yes_no">Yes / no</option>
                  <option value="choice">Choice</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                </Select>
                <Select
                  className="md:col-span-2"
                  value={q.scenarioSlug || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      questions: form.questions.map((x, idx) =>
                        idx === i ? { ...x, scenarioSlug: e.target.value } : x,
                      ),
                    })
                  }
                >
                  <option value="">Anytime (after name confirm)</option>
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.slug}>
                      When scenario: {s.name}
                    </option>
                  ))}
                </Select>
                {q.type === "choice" ? (
                  <Input
                    className="md:col-span-3"
                    placeholder="Choices, comma separated"
                    value={(q.options || []).join(", ")}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        questions: form.questions.map((x, idx) =>
                          idx === i
                            ? { ...x, options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }
                            : x,
                        ),
                      })
                    }
                  />
                ) : null}
                <button
                  type="button"
                  className="text-left text-xs text-ink-soft md:col-span-3"
                  onClick={() => setForm({ ...form, questions: form.questions.filter((_, idx) => idx !== i) })}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() =>
              setForm({
                ...form,
                questions: [
                  ...form.questions,
                  { key: `q${form.questions.length + 1}`, prompt: "", type: "text", options: [], scenarioSlug: "" },
                ],
              })
            }
          >
            Add question
          </Button>
        </SetupCard>
      </Step>

      <Step n={4} title="After the call" subtitle="Where the call goes">
        <SetupCard
          icon={<Send size={18} />}
          title="Follow-up message"
          preview={form.followUpText || "Email or note after hangup — workflows can still send templates"}
          open={open === "followup"}
          onToggle={() => toggle("followup")}
        >
          <Field label="Follow-up copy">
            <Textarea value={form.followUpText} onChange={(e) => setForm({ ...form, followUpText: e.target.value })} />
          </Field>
        </SetupCard>
        <SetupCard
          icon={<Link2 size={18} />}
          title="Webhook"
          preview={form.webhookUrl || "Send call data to a custom endpoint"}
          open={open === "webhook"}
          onToggle={() => toggle("webhook")}
        >
          <Field label="Webhook URL">
            <Input
              placeholder="https://example.com/hooks/calls"
              value={form.webhookUrl}
              onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
            />
          </Field>
        </SetupCard>
      </Step>

      <ErrorText>{error}</ErrorText>
      <div className="mt-6">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save agent"}
        </Button>
      </div>
    </div>
  );
}

function Step({ n, title, subtitle, children }: { n: number; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">Step {n}</p>
      <h2 className="serif mt-1 text-3xl">{title}</h2>
      <p className="mb-4 text-sm text-ink-soft">{subtitle}</p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function SetupCard({
  icon,
  title,
  preview,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  preview: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-4 px-5 py-4 text-left">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper-2 text-ink">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          <p className="truncate text-sm text-ink-soft">{preview}</p>
        </div>
        <ChevronDown size={18} className={`shrink-0 text-ink-soft transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="space-y-3 border-t border-line px-5 py-4">{children}</div> : null}
    </div>
  );
}
