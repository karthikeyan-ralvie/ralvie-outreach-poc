"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Card, EmptyState, ErrorText, Field, PageHeader, Select } from "@/components/ui";
import { COUNTRY_CODES, type ColumnField } from "@/lib/contacts/map-columns";

type Contact = { id: string; name: string | null; phone: string; email: string | null; company: string | null };
type List = { id: string; name: string; countryCode: string; contacts: Contact[] };

const FIELDS: ColumnField[] = ["name", "phone", "email", "company", "skip"];

export default function ContactListPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [list, setList] = useState<List | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [countryCode, setCountryCode] = useState("+91");
  const [preview, setPreview] = useState<{
    headers: string[];
    suggested: Record<string, ColumnField>;
    preview: Record<string, unknown>[];
    total: number;
  } | null>(null);
  const [mapping, setMapping] = useState<Record<string, ColumnField>>({});
  const [imported, setImported] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"detect" | "import" | "country" | "">("");

  async function reload() {
    const data = await api<List>(`/api/contacts/${id}`);
    setList(data);
    setCountryCode(data.countryCode || "+91");
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof Error ? err.message : "Could not load list"));
  }, [id]);

  async function saveCountry(next: string) {
    setCountryCode(next);
    setBusy("country");
    setError("");
    try {
      const data = await api<List>(`/api/contacts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ countryCode: next }),
      });
      setList(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save country code");
    } finally {
      setBusy("");
    }
  }

  async function previewUpload() {
    if (!file) return;
    setBusy("detect");
    setError("");
    setImported("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("countryCode", countryCode);
      const data = await api<NonNullable<typeof preview>>(`/api/contacts/${id}/upload`, { method: "POST", body: fd });
      setPreview(data);
      setMapping(data.suggested);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Could not read that file");
    } finally {
      setBusy("");
    }
  }

  async function confirmImport() {
    if (!file) return;
    setBusy("import");
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mapping", JSON.stringify(mapping));
      fd.append("countryCode", countryCode);
      const res = await api<{ imported: number; skipped?: number }>(`/api/contacts/${id}/upload`, {
        method: "POST",
        body: fd,
      });
      const skipped = res.skipped ? ` Skipped ${res.skipped} rows without a valid phone.` : "";
      setImported(`Imported ${res.imported} contacts.${skipped}`);
      setPreview(null);
      setFile(null);
      setFileKey((n) => n + 1);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy("");
    }
  }

  if (!list) return <p className="text-sm text-ink-soft">{error || "Loading…"}</p>;

  return (
    <div>
      <PageHeader
        title={list.name}
        description="Numbers without a + country code get this prefix when you import and when we dial."
        actions={
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirm("Delete this list?")) return;
              await api(`/api/contacts/${id}`, { method: "DELETE" });
              router.push("/contacts");
            }}
          >
            Delete list
          </Button>
        }
      />
      <Card className="mb-6 space-y-3">
        <p className="serif text-xl">Upload CSV or Excel</p>
        <Field label="Country code for this list">
          <Select value={countryCode} disabled={busy === "country"} onChange={(e) => saveCountry(e.target.value)}>
            {COUNTRY_CODES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <input
          key={fileKey}
          type="file"
          accept=".csv,.xlsx,.xls,.txt"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setPreview(null);
            setImported("");
            setError("");
          }}
        />
        <Button variant="secondary" onClick={previewUpload} disabled={!file || Boolean(busy)}>
          {busy === "detect" ? "Reading file…" : "Detect columns"}
        </Button>
        <ErrorText>{error}</ErrorText>
        {preview ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">
              {preview.total} rows found. Map the phone column, then import. Local numbers will be saved as {countryCode}…
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {preview.headers.map((h) => (
                <Field key={h} label={h || "(empty column)"}>
                  <Select
                    value={mapping[h] || "skip"}
                    onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value as ColumnField }))}
                  >
                    {FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    {preview.headers.map((h) => (
                      <th key={h} className="p-1">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, i) => (
                    <tr key={i}>
                      {preview.headers.map((h) => (
                        <td key={h} className="p-1 text-ink-soft">
                          {String(row[h] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button onClick={confirmImport} disabled={busy === "import"}>
              {busy === "import" ? "Importing…" : "Import contacts"}
            </Button>
          </div>
        ) : null}
        {imported ? <p className="text-sm text-pine">{imported}</p> : null}
      </Card>
      {list.contacts.length === 0 ? (
        <EmptyState title="No contacts yet" body="Choose a country code, upload a CSV or Excel file, detect columns, then import." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-2 text-xs uppercase text-ink-soft">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Company</th>
              </tr>
            </thead>
            <tbody>
              {list.contacts.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-4 py-2">{c.name || "—"}</td>
                  <td className="px-4 py-2">{c.phone}</td>
                  <td className="px-4 py-2">{c.email || "—"}</td>
                  <td className="px-4 py-2">{c.company || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
