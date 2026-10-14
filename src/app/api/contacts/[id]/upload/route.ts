import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";
import {
  applyMapping,
  cellString,
  isDialable,
  suggestMapping,
  toE164,
  type ColumnField,
} from "@/lib/contacts/map-columns";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const list = await prisma.contactList.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const mappingRaw = form.get("mapping");
  const countryCode = String(form.get("countryCode") || list.countryCode || "+91");
  if (!isUpload(file)) return NextResponse.json({ error: "Upload a CSV or Excel file" }, { status: 400 });

  let rows: Record<string, unknown>[];
  try {
    rows = await parseFile(file);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not read that file" }, { status: 400 });
  }
  if (!rows.length) {
    return NextResponse.json({ error: "No rows found. Check that the first row has column headers." }, { status: 400 });
  }
  const headers = Object.keys(rows[0]).filter(Boolean);

  if (!mappingRaw) {
    return NextResponse.json({
      headers,
      suggested: suggestMapping(headers),
      preview: rows.slice(0, 8),
      total: rows.length,
      countryCode,
    });
  }

  let mapping: Record<string, ColumnField>;
  try {
    mapping = JSON.parse(String(mappingRaw)) as Record<string, ColumnField>;
  } catch {
    return NextResponse.json({ error: "Column mapping was invalid" }, { status: 400 });
  }

  if (!Object.values(mapping).includes("phone")) {
    return NextResponse.json({ error: "Map one column to phone before importing" }, { status: 400 });
  }

  const contacts = applyMapping(rows, mapping)
    .map((c) => ({
      listId: id,
      name: c.name || null,
      phone: toE164(c.phone || "", countryCode),
      email: c.email || null,
      company: c.company || null,
      extra: (c.extra ?? {}) as Prisma.InputJsonValue,
    }))
    .filter((c) => isDialable(c.phone));

  if (!contacts.length) {
    return NextResponse.json(
      { error: "No valid phone numbers after mapping. Check the phone column and country code." },
      { status: 400 },
    );
  }

  if (list.countryCode !== countryCode) {
    await prisma.contactList.update({ where: { id }, data: { countryCode } });
  }

  await prisma.contact.createMany({ data: contacts });
  return NextResponse.json({ imported: contacts.length, skipped: rows.length - contacts.length });
}

function isUpload(value: FormDataEntryValue | null): value is File {
  return !!value && typeof value !== "string" && typeof (value as File).arrayBuffer === "function";
}

async function parseFile(file: Blob) {
  const name = "name" in file && typeof file.name === "string" ? file.name.toLowerCase() : "";
  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.length) throw new Error("The file is empty");

  if (!name || name.endsWith(".csv") || name.endsWith(".txt") || looksLikeText(buf)) {
    const text = stripBom(buf.toString("utf8"));
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      delimiter: "",
      transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
    });
    const rows = (parsed.data || [])
      .map(normalizeRow)
      .filter((row) => Object.values(row).some((v) => v));
    if (rows.length) return rows;
    if (name.endsWith(".csv") || name.endsWith(".txt")) {
      throw new Error(parsed.errors[0]?.message || "No rows found in that CSV");
    }
  }

  const workbook = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The spreadsheet has no sheets");
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true })
    .map(normalizeRow)
    .filter((row) => Object.values(row).some((v) => v));
}

function looksLikeText(buf: Buffer) {
  const sample = buf.subarray(0, 200).toString("utf8");
  return sample.includes(",") || sample.includes(";") || sample.includes("\t") || sample.includes("\n");
}

function stripBom(text: string) {
  return text.replace(/^\uFEFF/, "");
}

function normalizeRow(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const header = key.replace(/^\uFEFF/, "").trim();
    if (!header) continue;
    out[header] = cellString(value);
  }
  return out;
}
