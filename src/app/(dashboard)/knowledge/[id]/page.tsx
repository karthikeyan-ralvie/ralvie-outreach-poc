"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Badge, Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";

type Doc = {
  id: string;
  type: string;
  title: string;
  url: string | null;
  content: string;
  createdAt: string;
};

type KB = { id: string; name: string; description: string | null; docs: Doc[] };

export default function KnowledgeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [kb, setKb] = useState<KB | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");

  async function reload() {
    setKb(await api<KB>(`/api/knowledge/${id}`));
  }

  useEffect(() => {
    reload();
  }, [id]);

  if (!kb) return <p className="text-sm text-ink-soft">Loading…</p>;

  return (
    <div>
      <PageHeader
        title={kb.name}
        description="Add FAQs, notes, or crawl a site. The agent retrieves this during calls."
        actions={
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirm("Delete this knowledge base?")) return;
              await api(`/api/knowledge/${id}`, { method: "DELETE" });
              router.push("/knowledge");
            }}
          >
            Delete
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3">
          <p className="serif text-xl">FAQ</p>
          <Field label="Question">
            <Input value={question} onChange={(e) => setQuestion(e.target.value)} />
          </Field>
          <Field label="Answer">
            <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} />
          </Field>
          <Button
            onClick={async () => {
              await api(`/api/knowledge/${id}/faq`, { method: "POST", body: JSON.stringify({ question, answer }) });
              setQuestion("");
              setAnswer("");
              reload();
            }}
          >
            Add FAQ
          </Button>
        </Card>
        <Card className="space-y-3">
          <p className="serif text-xl">Notes</p>
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Content">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Button
            onClick={async () => {
              await api(`/api/knowledge/${id}/text`, { method: "POST", body: JSON.stringify({ title, content: text }) });
              setTitle("");
              setText("");
              reload();
            }}
          >
            Add text
          </Button>
        </Card>
        <Card className="space-y-3">
          <p className="serif text-xl">Website sync</p>
          <Field label="URL">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
          </Field>
          <p className="text-xs text-ink-soft">Crawls same-host pages (up to 12). Keep the worker running.</p>
          <Button
            onClick={async () => {
              await api(`/api/knowledge/${id}/website`, { method: "POST", body: JSON.stringify({ url }) });
              setUrl("");
              reload();
            }}
          >
            Sync website
          </Button>
        </Card>
      </div>
      <div className="mt-8 space-y-3">
        {kb.docs.map((d) => (
          <Card key={d.id} className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge>{d.type}</Badge>
                <p className="font-medium">{d.title}</p>
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-ink-soft">{d.content}</p>
            </div>
            <Button
              variant="ghost"
              onClick={async () => {
                await api(`/api/knowledge/${id}/docs/${d.id}`, { method: "DELETE" });
                reload();
              }}
            >
              Remove
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
