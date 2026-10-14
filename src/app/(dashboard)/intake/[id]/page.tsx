"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";

type Question = { key: string; prompt: string; type: string; options?: string[] };
type Form = { id: string; name: string; questions: Question[] };

export default function IntakeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);

  useEffect(() => {
    api<Form>(`/api/intake/${id}`).then((f) => {
      setName(f.name);
      setQuestions(
        f.questions.map((q) => ({
          key: q.key,
          prompt: q.prompt,
          type: q.type,
          options: q.options,
        })),
      );
    });
  }, [id]);

  function update(i: number, patch: Partial<Question>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }

  async function save() {
    await api(`/api/intake/${id}`, { method: "PATCH", body: JSON.stringify({ name, questions }) });
  }

  return (
    <div>
      <PageHeader
        title="Edit intake form"
        actions={
          <div className="flex gap-2">
            <Button onClick={save}>Save</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm("Delete this form?")) return;
                await api(`/api/intake/${id}`, { method: "DELETE" });
                router.push("/intake");
              }}
            >
              Delete
            </Button>
          </div>
        }
      />
      <Field label="Name">
        <Input className="max-w-md" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="mt-6 space-y-3">
        {questions.map((q, i) => (
          <Card key={i} className="grid gap-3 md:grid-cols-4">
            <Field label="Field key">
              <Input value={q.key} onChange={(e) => update(i, { key: e.target.value })} />
            </Field>
            <Field label="Spoken question">
              <Input value={q.prompt} onChange={(e) => update(i, { prompt: e.target.value })} />
            </Field>
            <Field label="Type">
              <Select value={q.type} onChange={(e) => update(i, { type: e.target.value })}>
                <option value="text">Text</option>
                <option value="yes_no">Yes / no</option>
                <option value="choice">Choice</option>
                <option value="email">Email</option>
              </Select>
            </Field>
            <div className="flex items-end">
              <Button variant="ghost" onClick={() => setQuestions((qs) => qs.filter((_, idx) => idx !== i))}>
                Remove
              </Button>
            </div>
            {q.type === "choice" ? (
              <div className="md:col-span-4">
                <Field label="Choices (comma separated)">
                  <Input
                    value={(q.options || []).join(", ")}
                    onChange={(e) =>
                      update(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
                    }
                  />
                </Field>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
      <Button
        className="mt-4"
        variant="secondary"
        onClick={() => setQuestions((qs) => [...qs, { key: `q${qs.length + 1}`, prompt: "", type: "text" }])}
      >
        Add question
      </Button>
    </div>
  );
}
