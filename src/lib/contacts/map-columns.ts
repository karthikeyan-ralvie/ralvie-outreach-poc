export type ColumnField = "name" | "phone" | "email" | "company" | "skip";

export const COUNTRY_CODES = [
  { code: "+91", label: "India (+91)" },
  { code: "+1", label: "United States / Canada (+1)" },
  { code: "+44", label: "United Kingdom (+44)" },
  { code: "+971", label: "United Arab Emirates (+971)" },
  { code: "+966", label: "Saudi Arabia (+966)" },
  { code: "+65", label: "Singapore (+65)" },
  { code: "+61", label: "Australia (+61)" },
  { code: "+49", label: "Germany (+49)" },
  { code: "+33", label: "France (+33)" },
  { code: "+31", label: "Netherlands (+31)" },
  { code: "+353", label: "Ireland (+353)" },
  { code: "+92", label: "Pakistan (+92)" },
  { code: "+880", label: "Bangladesh (+880)" },
  { code: "+94", label: "Sri Lanka (+94)" },
  { code: "+977", label: "Nepal (+977)" },
  { code: "+63", label: "Philippines (+63)" },
  { code: "+60", label: "Malaysia (+60)" },
  { code: "+62", label: "Indonesia (+62)" },
  { code: "+27", label: "South Africa (+27)" },
  { code: "+234", label: "Nigeria (+234)" },
  { code: "+254", label: "Kenya (+254)" },
  { code: "+55", label: "Brazil (+55)" },
  { code: "+52", label: "Mexico (+52)" },
] as const;

const aliases: Record<Exclude<ColumnField, "skip">, string[]> = {
  phone: [
    "phone",
    "phone number",
    "phonenumber",
    "phone no",
    "phone no.",
    "mobile",
    "mobile number",
    "mobile no",
    "mobile no.",
    "cell",
    "cellphone",
    "telephone",
    "tel",
    "msisdn",
    "whatsapp",
    "contact number",
    "contact no",
    "contact no.",
    "caller",
    "dial",
  ],
  name: ["name", "full name", "fullname", "contact name", "first name", "firstname", "customer", "lead"],
  email: ["email", "e mail", "e-mail", "email address", "mail"],
  company: ["company", "organization", "organisation", "account", "business", "firm"],
};

function normalizeHeader(h: string) {
  return h.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_./-]+/g, " ").replace(/\s+/g, " ");
}

function scoreHeader(header: string, field: Exclude<ColumnField, "skip">) {
  const n = normalizeHeader(header);
  let best = 0;
  for (const alias of aliases[field]) {
    if (n === alias) best = Math.max(best, 3);
    else if (n.startsWith(alias + " ") || n.endsWith(" " + alias)) best = Math.max(best, 2);
    else if (n.includes(alias)) best = Math.max(best, 1);
  }
  if (field === "phone" && /phone|mobile|cell|tel|whatsapp|msisdn/.test(n)) best = Math.max(best, 2);
  if (field === "phone" && /\b(number|no)\b/.test(n) && /contact|phone|mobile|cell|tel/.test(n)) best = Math.max(best, 3);
  return best;
}

export function suggestMapping(headers: string[]): Record<string, ColumnField> {
  const mapping: Record<string, ColumnField> = {};
  const fields: Exclude<ColumnField, "skip">[] = ["phone", "name", "email", "company"];

  for (const field of fields) {
    let bestHeader = "";
    let bestScore = 0;
    for (const header of headers) {
      if (mapping[header] && mapping[header] !== "skip") continue;
      const score = scoreHeader(header, field);
      if (score > bestScore) {
        bestScore = score;
        bestHeader = header;
      }
    }
    if (bestHeader && bestScore > 0) {
      mapping[bestHeader] = field;
    }
  }

  for (const header of headers) {
    if (!mapping[header]) mapping[header] = "skip";
  }
  return mapping;
}

export function applyMapping(
  rows: Record<string, unknown>[],
  mapping: Record<string, ColumnField>,
) {
  return rows.map((row) => {
    const extra: Record<string, unknown> = {};
    const mapped: { name?: string; phone?: string; email?: string; company?: string; extra: Record<string, unknown> } = {
      extra,
    };
    for (const [header, value] of Object.entries(row)) {
      const field = mapping[header] || "skip";
      const str = cellString(value);
      if (!str) continue;
      if (field === "skip") extra[header] = str;
      else mapped[field] = str;
    }
    return mapped;
  });
}

export function cellString(value: unknown) {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Math.abs(value) >= 1e10 || Number.isInteger(value)) return String(Math.round(value));
    return String(value);
  }
  return String(value).replace(/^\uFEFF/, "").trim();
}

export function toE164(phone: string, countryCode = "+91") {
  const raw = cellString(phone);
  if (!raw) return "";
  let compact = raw.replace(/[^\d+]/g, "");
  if (compact.startsWith("00")) compact = `+${compact.slice(2)}`;

  const ccDigits = countryCode.replace(/\D/g, "") || "91";
  let national = compact.startsWith("+") ? compact.slice(1).replace(/\D/g, "") : compact.replace(/\D/g, "");
  national = national.replace(/^0+/, "");
  if (!national) return "";

  if (compact.startsWith("+")) return `+${national}`;
  if (national.startsWith(ccDigits) && national.length >= ccDigits.length + 7) return `+${national}`;
  return `+${ccDigits}${national}`;
}

/** Twilio From / caller ID. 10-digit values are treated as US/Canada, not the contact-list country. */
export function toCallerId(phone: string) {
  const raw = cellString(phone);
  if (!raw) return "";
  let compact = raw.replace(/[^\d+]/g, "");
  if (compact.startsWith("00")) compact = `+${compact.slice(2)}`;
  if (compact.startsWith("+")) {
    const digits = compact.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : "";
  }
  const digits = compact.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return digits ? `+${digits}` : "";
}

export function isDialable(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export function normalizePhone(phone: string, countryCode = "+91") {
  return toE164(phone, countryCode);
}
