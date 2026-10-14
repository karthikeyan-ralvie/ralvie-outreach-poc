"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Button, Card, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { COUNTRY_CODES } from "@/lib/contacts/map-columns";

type List = { id: string; name: string; countryCode?: string; _count: { contacts: number; campaigns: number } };

export default function ContactsPage() {
  const [items, setItems] = useState<List[]>([]);
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("+91");

  useEffect(() => {
    api<List[]>("/api/contacts").then(setItems);
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const list = await api<List>("/api/contacts", {
      method: "POST",
      body: JSON.stringify({ name, countryCode }),
    });
    window.location.href = `/contacts/${list.id}`;
  }

  return (
    <div>
      <PageHeader title="Contacts" description="Create a list, then upload CSV or Excel. Columns are mapped automatically." />
      <form onSubmit={create} className="mb-8 grid max-w-lg gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="New list">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Q3 outbound" required />
        </Field>
        <Field label="Country code">
          <Select value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
            {COUNTRY_CODES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" className="sm:col-span-2 w-fit">
          Create
        </Button>
      </form>
      {items.length === 0 ? (
        <EmptyState title="No lists" body="Create a list and import contacts with phone numbers." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((l) => (
            <Link key={l.id} href={`/contacts/${l.id}`}>
              <Card>
                <p className="font-medium">{l.name}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  {l._count.contacts} contacts · {l._count.campaigns} campaigns · {l.countryCode || "+91"}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
