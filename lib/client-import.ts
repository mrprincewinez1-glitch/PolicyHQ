import { findInsuranceCompany, insuranceCategoryForPolicyType, insuranceCompanies } from "@/lib/insurance";
import type { LapseShieldStatementRow } from "@/lib/lapse-shield";
import { isValidPolicyNumber, normalizePolicyNumber } from "@/lib/policy-number";
import type { PolicyType, PolicyWithClient } from "@/lib/types";
import { normalizeGhanaPhoneNumber } from "@/lib/utils";

export type ImportClientRow = {
  client_name: string;
  phone_number: string;
  policy_number: string;
  policy_type: PolicyType | "";
  insurer_name: string;
  policy_start_date: string;
  policy_end_date: string;
  vehicle_number?: string;
  property_location?: string;
  premium?: number;
  commission_rate?: number;
  commission_amount?: number;
  commission_status?: "Paid" | "Pending";
  commission_payment_date?: string;
  email?: string;
  date_of_birth?: string;
  notes?: string;
};

export type LapseShieldStatementParseResult = {
  rows: LapseShieldStatementRow[];
  errors: string[];
};

export type LapseShieldReview = {
  matched: PolicyWithClient[];
  missing: PolicyWithClient[];
  unknown: LapseShieldStatementRow[];
  statementRows: number;
};

const policyTypes: PolicyType[] = ["Life", "Health", "Motor", "Property", "Fire", "Marine", "Travel", "Accident"];

export function downloadClientImportTemplate() {
  const headers = ["client_name", "phone_number", "policy_number", "policy_type", "insurer_name", "policy_start_date", "policy_end_date", "vehicle_number", "property_location", "premium", "commission_rate", "commission_status", "commission_payment_date", "email", "date_of_birth", "notes"];
  const example = ["Ama Mensah", "+233241234567", "POL-GH-MOT-2026-001", "Motor", "Enterprise Insurance LTD", "2026-01-01", "2026-12-31", "GR-4421-26", "", "1200", "7.5", "Paid", "2026-02-07", "ama@example.com", "1990-05-18", "Imported client"];
  const csv = `${headers.join(",")}\n${example.map((value) => `"${value}"`).join(",")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "policyhq-client-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function parseClientImportFile(file: File): Promise<{ rows: ImportClientRow[]; errors: string[] }> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    return parseClientCsv(await file.text());
  }
  if (lowerName.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    const rows = await readSheet(file);
    return parseClientTable(rows.map((row) => row.map((cell) => formatStatementCell(cell))));
  }
  return { rows: [], errors: ["Upload a CSV or Excel .xlsx file."] };
}

export async function parseLapseShieldStatementFile(file: File): Promise<LapseShieldStatementParseResult> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    return parseLapseShieldStatementCsv(await file.text());
  }
  if (lowerName.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    const rows = await readSheet(file);
    return parseLapseShieldStatementTable(rows.map((row) => row.map((cell) => formatStatementCell(cell))));
  }
  return {
    rows: [],
    errors: ["Upload a CSV, Excel .xlsx, or text-based PDF commission statement."]
  };
}

export function statementKindForFile(file: File) {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".xlsx")) return "Excel";
  if (lowerName.endsWith(".pdf")) return "PDF";
  if (lowerName.endsWith(".csv")) return "CSV";
  return "CSV, Excel, or PDF";
}

export function compareLapseShieldStatement(lifePolicies: PolicyWithClient[], statementRows: LapseShieldStatementRow[]): LapseShieldReview {
  const statementPolicyNumbers = new Set(statementRows.map((row) => row.policy_number));
  const policyNumbers = new Set(lifePolicies.map((policy) => normalizePolicyNumber(policy.policy_number)));
  return {
    matched: lifePolicies.filter((policy) => statementPolicyNumbers.has(normalizePolicyNumber(policy.policy_number))),
    missing: lifePolicies.filter((policy) => !statementPolicyNumbers.has(normalizePolicyNumber(policy.policy_number))),
    unknown: statementRows.filter((row) => !policyNumbers.has(row.policy_number)),
    statementRows: statementRows.length
  };
}

export function validateImportRows(rows: ImportClientRow[]) {
  return rows.flatMap((row, index) => importRowIssues(row, index + 2));
}

export function importRowIssues(row: ImportClientRow, rowNumber: number) {
  const errors: string[] = [];
  if (!row.client_name.trim()) errors.push(`Row ${rowNumber}: add the client name.`);
  if (!row.policy_number.trim()) errors.push(`Row ${rowNumber}: add the policy number.`);
  if (row.policy_number && !isValidPolicyNumber(row.policy_number)) errors.push(`Row ${rowNumber}: policy number format needs checking.`);
  if (!row.policy_type) errors.push(`Row ${rowNumber}: choose the policy type.`);
  if (!row.insurer_name.trim()) errors.push(`Row ${rowNumber}: add the insurer name.`);
  if (row.insurer_name && !resolveImportInsurerName(row.insurer_name, row.policy_type)) errors.push(`Row ${rowNumber}: choose an approved insurer name.`);
  if (!row.policy_end_date) errors.push(`Row ${rowNumber}: add the policy end date.`);
  if (row.policy_start_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.policy_start_date)) errors.push(`Row ${rowNumber}: start date must be YYYY-MM-DD.`);
  if (row.policy_end_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.policy_end_date)) errors.push(`Row ${rowNumber}: end date must be YYYY-MM-DD.`);
  if (row.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(row.date_of_birth)) errors.push(`Row ${rowNumber}: date of birth must be YYYY-MM-DD.`);
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push(`Row ${rowNumber}: email is invalid.`);
  if (row.phone_number && !/^\+?[0-9 ()-]{8,20}$/.test(row.phone_number)) errors.push(`Row ${rowNumber}: phone number format needs checking.`);
  if (row.commission_rate !== undefined && row.commission_rate < 0) errors.push(`Row ${rowNumber}: commission rate cannot be negative.`);
  if (row.commission_status === "Paid" && row.commission_payment_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.commission_payment_date)) errors.push(`Row ${rowNumber}: commission payment date must be YYYY-MM-DD.`);
  return errors;
}

export function importReviewWarnings(rows: ImportClientRow[]) {
  const warnings: string[] = [];
  rows.forEach((row, index) => {
    const missing = importRowReviewNotes(row);
    if (missing.length) warnings.push(`Row ${index + 2}: ${missing.join(", ")} missing.`);
  });
  return warnings;
}

export function importRowReviewNotes(row: ImportClientRow) {
  const missing: string[] = [];
  if (!row.phone_number.trim()) missing.push("phone");
  if (!row.policy_start_date) missing.push("start date");
  if (row.premium === undefined) missing.push("premium");
  if (row.commission_rate === undefined) missing.push("commission rate");
  if (row.policy_type === "Motor" && !row.vehicle_number?.trim()) missing.push("vehicle number");
  if (row.policy_type === "Property" && !row.property_location?.trim()) missing.push("property location");
  return missing;
}

export function resolveImportInsurerName(value: string, policyType: PolicyType | "") {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const category = policyType ? insuranceCategoryForPolicyType(policyType) : null;
  const exact = findInsuranceCompany(trimmed);
  if (exact && (!category || exact.category === category)) return exact.name;

  const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
  const candidates = insuranceCompanies.filter((company) => !category || company.category === category);
  const match = candidates.find((company) => {
    const companyName = company.name.toLowerCase();
    return companyName.includes(normalized) || normalized.includes(companyName);
  });

  return match?.name ?? null;
}

export function dateOfBirthForDisplay(value: string | null | undefined) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function dateOfBirthToIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!match) return trimmed;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseClientCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  return parseClientTable(lines.map((line) => splitCsvLine(line)));
}

function parseClientTable(table: string[][]): { rows: ImportClientRow[]; errors: string[] } {
  const rowsWithContent = table.filter((row) => row.some((cell) => cell.trim()));
  if (rowsWithContent.length < 2) return { rows: [], errors: ["The file needs a header row and at least one client row."] };
  const headers = rowsWithContent[0].map((header) => normalizeImportHeader(header));
  const recognizedHeaders = ["client_name", "phone_number", "policy_number", "policy_type", "insurer_name", "policy_start_date", "policy_end_date", "premium", "email", "date_of_birth", "notes", "vehicle_number", "property_location", "commission_rate", "commission_amount", "commission_status", "commission_payment_date", "commission_released"];
  if (!headers.some((header) => recognizedHeaders.includes(header))) {
    return { rows: [], errors: ["We could not match this file's columns. Use the template or rename the first row to include client/policy fields."] };
  }

  const rows: ImportClientRow[] = [];
  rowsWithContent.slice(1).forEach((values) => {
    const record = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex]?.trim() ?? ""])) as Record<string, string>;
    if (!record.insurer_name && isEnterprisePolicyExport(headers)) record.insurer_name = "Enterprise";
    record.policy_start_date = normalizeImportDate(record.policy_start_date);
    record.policy_end_date = normalizeImportDate(record.policy_end_date);
    record.date_of_birth = normalizeImportDate(record.date_of_birth);
    const premium = parseImportMoney(record.premium);
    const commissionAmount = parseImportMoney(record.commission_amount);
    const explicitRate = record.commission_rate ? Number(record.commission_rate) : undefined;
    const commissionRate = Number.isFinite(explicitRate) && explicitRate !== undefined
      ? roundPercent(explicitRate)
      : commissionAmount && premium
        ? roundPercent(commissionAmount / premium * 100)
        : undefined;

    // Enterprise exports are monthly commission statements, so older policy months
    // can usually be treated as already paid unless the file says otherwise.
    const commissionStatus = importCommissionStatus(record, isEnterprisePolicyExport(headers));
    const commissionPaymentDate = importCommissionPaymentDate(record, commissionStatus);
    const policyType = normalizeImportPolicyType(record.policy_type);
    rows.push({
      client_name: record.client_name ?? "",
      phone_number: record.phone_number ? normalizeGhanaPhoneNumber(record.phone_number) : "",
      policy_number: record.policy_number ? normalizePolicyNumber(record.policy_number) : "",
      policy_type: policyType,
      insurer_name: resolveImportInsurerName(record.insurer_name ?? "", policyType) ?? record.insurer_name ?? "",
      policy_start_date: record.policy_start_date ?? "",
      policy_end_date: record.policy_end_date ?? "",
      vehicle_number: record.vehicle_number || undefined,
      property_location: record.property_location || undefined,
      premium,
      commission_rate: commissionRate,
      commission_amount: commissionAmount ?? (premium && commissionRate !== undefined ? Number((premium * commissionRate / 100).toFixed(2)) : undefined),
      commission_status: commissionStatus,
      commission_payment_date: commissionPaymentDate,
      email: record.email || undefined,
      date_of_birth: record.date_of_birth || undefined,
      notes: record.notes || undefined
    });
  });
  return { rows, errors: [] };
}

export function normalizeImportPolicyType(value: string | undefined): PolicyType | "" {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "";
  const match = policyTypes.find((type) => type.toLowerCase() === normalized);
  if (match) return match;
  if (normalized.includes("motor") || normalized.includes("vehicle") || normalized.includes("auto")) return "Motor";
  if (normalized.includes("life")) return "Life";
  if (normalized.includes("health") || normalized.includes("medical")) return "Health";
  if (normalized.includes("fire")) return "Fire";
  if (normalized.includes("marine")) return "Marine";
  if (normalized.includes("travel")) return "Travel";
  if (normalized.includes("property") || normalized.includes("building") || normalized.includes("home")) return "Property";
  if (normalized.includes("accident") || normalized === "pa") return "Accident";
  return match ?? "";
}

function normalizeImportHeader(header: string) {
  const normalized = header.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s./-]+/g, "_").replace(/^_+|_+$/g, "");
  const aliases: Record<string, string> = {
    client_name: "client_name",
    client: "client_name",
    customer_name: "client_name",
    insured_name: "client_name",
    policyholder_name: "client_name",
    phone_number: "phone_number",
    phone: "phone_number",
    telephone: "phone_number",
    mobile: "phone_number",
    mobile_number: "phone_number",
    contact_number: "phone_number",
    policy_number: "policy_number",
    policy_no: "policy_number",
    policy: "policy_number",
    policy_type: "policy_type",
    insurance: "policy_type",
    insurance_type: "policy_type",
    class: "policy_type",
    business_class: "policy_type",
    insurer_name: "insurer_name",
    insurer: "insurer_name",
    insurance_company: "insurer_name",
    company: "insurer_name",
    policy_start_date: "policy_start_date",
    start_date: "policy_start_date",
    effective_date: "policy_start_date",
    inception_date: "policy_start_date",
    policy_end_date: "policy_end_date",
    expiry_date: "policy_end_date",
    expiration_date: "policy_end_date",
    end_date: "policy_end_date",
    policy_expiry_date: "policy_end_date",
    premium: "premium",
    premium_amount: "premium",
    commission_due: "commission_amount",
    commission: "commission_amount",
    commission_amount: "commission_amount",
    commission_rate: "commission_rate",
    rate: "commission_rate",
    commission_status: "commission_status",
    payment_status: "commission_status",
    commission_payment_date: "commission_payment_date",
    payment_date: "commission_payment_date",
    released: "commission_released",
    date_of_birth: "date_of_birth",
    dob: "date_of_birth",
    notes: "notes",
    note: "notes",
    vehicle_number: "vehicle_number",
    vehicle_no: "vehicle_number",
    registration_number: "vehicle_number",
    reg_no: "vehicle_number",
    property_location: "property_location",
    property_address: "property_location",
    address: "property_location"
  };
  return aliases[normalized] ?? normalized;
}

function isEnterprisePolicyExport(headers: string[]) {
  return headers.includes("trans_date") && headers.includes("commission_amount") && headers.includes("policy_number");
}

function importCommissionStatus(record: Record<string, string>, enterpriseExport: boolean): "Paid" | "Pending" {
  const explicitStatus = record.commission_status?.trim().toLowerCase();
  if (["paid", "released", "yes"].includes(explicitStatus)) return "Paid";
  if (["pending", "unpaid", "no"].includes(explicitStatus)) return "Pending";

  const released = record.commission_released?.trim().toLowerCase();
  if (released && released !== "no" && released !== "pending") return "Paid";

  if (!enterpriseExport || !record.policy_start_date) return "Pending";
  return isPastPolicyMonth(record.policy_start_date) ? "Paid" : "Pending";
}

function importCommissionPaymentDate(record: Record<string, string>, status: "Paid" | "Pending") {
  if (status !== "Paid") return "";
  const explicitPaymentDate = normalizeImportDate(record.commission_payment_date || record.commission_released);
  if (explicitPaymentDate) return explicitPaymentDate;
  return seventhDayOfNextMonth(record.policy_start_date);
}

function isPastPolicyMonth(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  const thisMonth = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const policyMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  return policyMonth < thisMonth;
}

function seventhDayOfNextMonth(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  const paymentDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 7));
  return paymentDate.toISOString().slice(0, 10);
}

export function roundPercent(value: number) {
  return Number(value.toFixed(2));
}

function normalizeImportDate(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const slashDate = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashDate) {
    const [, day, month, year] = slashDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const withoutOrdinals = trimmed.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1");
  const parsed = new Date(`${withoutOrdinals} UTC`);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toISOString().slice(0, 10);
}

export function parseImportMoney(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const amount = Number(trimmed.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(amount) || amount === 0) return undefined;
  return Math.abs(amount);
}

function parseLapseShieldStatementCsv(text: string): LapseShieldStatementParseResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { rows: [], errors: ["The statement needs a header row and at least one policy row."] };
  return parseLapseShieldStatementTable(lines.map((line) => splitCsvLine(line)));
}

function parseLapseShieldStatementTable(table: string[][]): LapseShieldStatementParseResult {
  const rowsWithContent = table.filter((row) => row.some((cell) => cell.trim()));
  if (rowsWithContent.length < 2) return { rows: [], errors: ["The statement needs a header row and at least one policy row."] };
  const headers = rowsWithContent[0].map((header) => normalizeImportHeader(header));
  const policyNumberIndex = headers.indexOf("policy_number");
  if (policyNumberIndex === -1) return { rows: [], errors: ["We could not find a policy number column. Rename the column to policy_number or Policy Number and try again."] };
  const clientNameIndex = headers.indexOf("client_name");
  const rows = rowsWithContent.slice(1).flatMap((values, index) => {
    const policyNumber = normalizePolicyNumber(values[policyNumberIndex]?.trim() ?? "");
    if (!policyNumber) return [];
    return {
      rowNumber: index + 2,
      policy_number: policyNumber,
      client_name: clientNameIndex >= 0 ? values[clientNameIndex]?.trim() ?? "" : ""
    };
  });
  if (!rows.length) return { rows: [], errors: ["We found the policy number column, but no policy numbers were readable."] };
  return { rows, errors: [] };
}

function formatStatementCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}
