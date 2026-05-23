"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isValidPolicyNumber, normalizePolicyNumber, policyNumberHelpText } from "@/lib/policy-number";
import { createClient } from "@/lib/supabase/server";
import { findInsuranceCompany, insuranceCategoryForPolicyType } from "@/lib/insurance";
import { normalizeGhanaPhoneNumber } from "@/lib/utils";
import type { ActivityNote, Client, Commission, PolicyWithClient, Prospect, RenewalStatus } from "@/lib/types";

const renewalStatusValues = ["Upcoming", "Contacted", "Quote Requested", "Payment Pending", "Renewed", "Lost"] as const;
const prospectStatusValues = ["New", "Interested", "Not Interested", "Call Back", "Converted"] as const;

const clientSchema = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().min(2, "Full name is required"),
  phone_number: z.string().regex(/^\+?[0-9 ()-]{8,20}$/, "Phone number is invalid"),
  email: z.string().email().optional().or(z.literal("")),
  date_of_birth: z.string().refine(isValidDateInput, "Date of birth is invalid").optional().or(z.literal("")),
  address: z.string().optional()
});

const policySchema = z.object({
  id: z.string().uuid().optional(),
  client_id: z.string().uuid("Select a client").optional().or(z.literal("")),
  client_full_name: z.string().optional(),
  client_phone_number: z.string().regex(/^\+?[0-9 ()-]{8,20}$/, "Client phone number is invalid").optional().or(z.literal("")),
  client_email: z.string().email().optional().or(z.literal("")),
  client_date_of_birth: z.string().refine(isValidDateInput, "Client date of birth is invalid").optional().or(z.literal("")),
  client_address: z.string().optional(),
  policy_number: z.string().transform(normalizePolicyNumber).refine(isValidPolicyNumber, policyNumberHelpText),
  policy_type: z.enum(["Life", "Health", "Motor", "Property", "Fire", "Marine", "Travel", "Accident"]),
  insurance_category: z.enum(["Life", "Non-Life", "Health"]),
  vehicle_number: z.string().optional(),
  property_location: z.string().optional(),
  insurer_name: z.string().min(2, "Insurer is required"),
  start_date: z.string().refine(isValidDateInput, "Start date is invalid"),
  expiry_date: z.string().refine(isValidDateInput, "Expiry date is invalid"),
  premium_amount: z.coerce.number().positive("Premium must be greater than zero"),
  commission_rate: z.coerce.number().positive("Commission rate must be greater than zero"),
  payment_status: z.enum(["Paid", "Pending"]),
  status: z.enum(["Active", "Expired", "Cancelled"]),
  renewal_status: z.enum(renewalStatusValues),
  notes: z.string().optional()
});

const renewalStatusSchema = z.object({
  policy_id: z.string().uuid("Policy is invalid"),
  renewal_status: z.enum(renewalStatusValues)
});

const activityNoteSchema = z.object({
  client_id: z.string().uuid("Client is invalid").optional().or(z.literal("")),
  policy_id: z.string().uuid("Policy is invalid").optional().or(z.literal("")),
  note_text: z.string().trim().min(2, "Write a short note before saving.").max(500, "Keep notes under 500 characters.")
}).refine((value) => value.client_id || value.policy_id, "Choose a client or policy for this note.");

const prospectSchema = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().trim().min(2, "Full name is required").max(120, "Full name is too long"),
  phone_number: z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/, "Phone number is invalid"),
  status: z.enum(prospectStatusValues),
  follow_up_date: z.string().refine(isValidDateInput, "Follow-up date is invalid").optional().or(z.literal("")),
  notes: z.string().max(500, "Notes are too long").optional().or(z.literal(""))
});

const importClientRowSchema = z.object({
  client_name: z.string().trim().min(2, "Client name is required"),
  phone_number: z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/, "Phone number is invalid").optional().or(z.literal("")),
  policy_number: z.string().transform(normalizePolicyNumber).refine(isValidPolicyNumber, policyNumberHelpText),
  policy_type: z.enum(["Life", "Health", "Motor", "Property", "Fire", "Marine", "Travel", "Accident"]),
  insurer_name: z.string().trim().min(2, "Insurer is required"),
  policy_start_date: z.string().refine(isValidDateInput, "Policy start date is invalid").optional().or(z.literal("")),
  policy_end_date: z.string().refine(isValidDateInput, "Policy end date is invalid"),
  vehicle_number: z.string().trim().optional().or(z.literal("")),
  property_location: z.string().trim().optional().or(z.literal("")),
  premium: z.coerce.number().positive("Premium must be greater than zero").optional(),
  commission_rate: z.coerce.number().nonnegative("Commission rate cannot be negative").optional(),
  commission_amount: z.coerce.number().nonnegative("Commission amount cannot be negative").optional(),
  commission_status: z.enum(["Paid", "Pending"]).optional(),
  commission_payment_date: z.string().refine(isValidDateInput, "Commission payment date is invalid").optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  date_of_birth: z.string().refine(isValidDateInput, "Date of birth is invalid").optional().or(z.literal("")),
  notes: z.string().max(500, "Notes are too long").optional().or(z.literal(""))
});

const importClientRowsSchema = z.array(importClientRowSchema).min(1, "Upload at least one valid row.").max(100, "Import 100 rows or fewer at a time.");

const commissionPaidSchema = z.object({
  commission_id: z.string().uuid("Commission is invalid")
});

const notificationSchema = z.object({
  notification_id: z.string().uuid("Notification is invalid")
});

const profileSchema = z.object({
  full_name: z.string().min(2, "Full name is required"),
  phone_number: z.string().regex(/^\+?[0-9 ()-]{8,20}$/, "Phone number is invalid").optional().or(z.literal("")),
  company_name: z.string().max(120, "Company name is too long").optional().or(z.literal(""))
});

const notificationSettingsSchema = z.object({
  whatsapp_enabled: z.boolean(),
  email_notifications_enabled: z.boolean(),
  birthday_messages_enabled: z.boolean(),
  agent_whatsapp_summary_enabled: z.boolean(),
  reminder_30_enabled: z.boolean(),
  reminder_14_enabled: z.boolean(),
  reminder_7_enabled: z.boolean()
});

const avatarAllowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);
const maxAvatarSize = 2 * 1024 * 1024;
const actionRateLimitWindowMs = 60_000;
const actionRateLimitGlobal = globalThis as typeof globalThis & {
  policyhqActionRateLimits?: Map<string, { count: number; resetAt: number }>;
};
const clientColumns = "id, agent_id, full_name, phone_number, email, date_of_birth, address, deleted_at, created_at, updated_at";
const policyColumns = "id, agent_id, client_id, policy_number, policy_type, insurance_category, vehicle_number, property_location, insurer_name, start_date, expiry_date, premium_amount, currency, status, renewal_status, notes, created_at, updated_at";
const commissionColumns = "id, policy_id, agent_id, commission_rate, commission_amount, payment_status, payment_date, created_at";
const profileColumns = "id, role, full_name, email, phone_number, company_name, avatar_url, whatsapp_enabled, email_notifications_enabled, birthday_messages_enabled, agent_whatsapp_summary_enabled, reminder_30_enabled, reminder_14_enabled, reminder_7_enabled";
const activityNoteColumns = "id, agent_id, client_id, policy_id, note_text, created_by, created_at";
const prospectColumns = "id, agent_id, full_name, phone_number, status, follow_up_date, notes, created_at";

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function inferImportStartDate(expiryDate: string) {
  const expiry = new Date(`${expiryDate}T00:00:00Z`);
  expiry.setUTCFullYear(expiry.getUTCFullYear() - 1);
  return expiry.toISOString().slice(0, 10);
}

function sanitizeText(value: string | undefined | null) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function importReviewReasons(row: z.infer<typeof importClientRowSchema>) {
  const reasons: string[] = [];
  if (!row.phone_number?.trim()) reasons.push("client phone number missing");
  if (!row.policy_start_date) reasons.push("policy start date inferred from expiry date");
  if (row.premium === undefined) reasons.push("premium amount missing");
  if (row.commission_rate === undefined) reasons.push("commission rate defaulted");
  if (row.policy_type === "Motor" && !row.vehicle_number?.trim()) reasons.push("vehicle number missing");
  if (row.policy_type === "Property" && !row.property_location?.trim()) reasons.push("property location missing");
  return reasons;
}

export async function upsertProspect(_: unknown, formData: FormData) {
  const parsed = prospectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check prospect details." };
  const { supabase, agentId } = await currentUserId();
  const limited = assertActionRateLimit(agentId, "upsert-prospect", 40);
  if (limited) return { ok: false, message: limited };

  const payload = {
    agent_id: agentId,
    full_name: sanitizeText(parsed.data.full_name),
    phone_number: normalizeGhanaPhoneNumber(parsed.data.phone_number),
    status: parsed.data.status,
    follow_up_date: parsed.data.follow_up_date || null,
    notes: sanitizeText(parsed.data.notes) || null
  };

  const query = parsed.data.id
    ? supabase.from("prospects").update(payload).eq("id", parsed.data.id).eq("agent_id", agentId).select(prospectColumns).single()
    : supabase.from("prospects").insert(payload).select(prospectColumns).single();

  const { data: prospect, error } = await query;
  if (error || !prospect) {
    console.error("Prospect save failed", { code: error?.code });
    if (error?.code === "42P01" || error?.code === "PGRST205") {
      return { ok: false, message: "Prospects setup is not complete yet. Run the prospects SQL in Supabase, then try again." };
    }
    if (error?.code === "42501") {
      return { ok: false, message: "Prospects permissions are not ready yet. Re-run the prospects SQL in Supabase." };
    }
    return { ok: false, message: `We could not save this prospect. Setup detail: ${error?.code ?? "unknown"}` };
  }
  revalidatePath("/prospects");
  revalidatePath("/dashboard");
  return { ok: true, message: "Prospect saved successfully.", prospect: prospect as Prospect };
}

async function currentUserId() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Unauthenticated");
  return { supabase, agentId: data.user.id };
}

function assertActionRateLimit(agentId: string, action: string, maxRequests: number) {
  if (!actionRateLimitGlobal.policyhqActionRateLimits) {
    actionRateLimitGlobal.policyhqActionRateLimits = new Map();
  }

  const key = `${agentId}:${action}`;
  const now = Date.now();
  const bucket = actionRateLimitGlobal.policyhqActionRateLimits.get(key);

  if (!bucket || bucket.resetAt <= now) {
    actionRateLimitGlobal.policyhqActionRateLimits.set(key, { count: 1, resetAt: now + actionRateLimitWindowMs });
    return null;
  }

  bucket.count += 1;
  return bucket.count > maxRequests ? "Too many requests. Please wait a minute and try again." : null;
}

async function insertClientAuditLog(
  supabase: ReturnType<typeof createClient>,
  agentId: string,
  action: "viewed" | "updated" | "deleted",
  clientId: string
) {
  const { error } = await supabase.from("audit_log").insert({
    user_id: agentId,
    action,
    table_name: "clients",
    record_id: clientId
  });
  if (error) {
    console.error("Client audit log insert failed");
  }
}

export async function upsertClient(_: unknown, formData: FormData) {
  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check client details." };
  const { supabase, agentId } = await currentUserId();
  const limited = assertActionRateLimit(agentId, "upsert-client", 40);
  if (limited) return { ok: false, message: limited };
  const payload = {
    ...parsed.data,
    agent_id: agentId,
    phone_number: normalizeGhanaPhoneNumber(parsed.data.phone_number),
    email: parsed.data.email || null,
    date_of_birth: parsed.data.date_of_birth || null
  };
  const query = parsed.data.id
    ? supabase.from("clients").update(payload).eq("id", parsed.data.id).eq("agent_id", agentId).is("deleted_at", null).select(clientColumns).single()
    : supabase.from("clients").insert(payload).select(clientColumns).single();
  const { data: client, error } = await query;
  if (error || !client) return { ok: false, message: "We could not save this client." };
  await insertClientAuditLog(supabase, agentId, "updated", client.id);
  revalidatePath("/clients");
  return { ok: true, message: "Client saved successfully.", client };
}

export async function deleteClient(clientId: string) {
  const { supabase, agentId } = await currentUserId();
  const { error } = await supabase
    .from("clients")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", clientId)
    .eq("agent_id", agentId)
    .is("deleted_at", null);
  if (error) return { ok: false, message: "We could not archive this client." };
  await insertClientAuditLog(supabase, agentId, "deleted", clientId);
  revalidatePath("/clients");
  revalidatePath("/policies");
  revalidatePath("/commissions");
  revalidatePath("/dashboard");
  return { ok: true, message: "Client archived." };
}

export async function upsertPolicy(_: unknown, formData: FormData) {
  const parsed = policySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check policy details." };
  const { supabase, agentId } = await currentUserId();
  const limited = assertActionRateLimit(agentId, "upsert-policy", 40);
  if (limited) return { ok: false, message: limited };
  if (!parsed.data.client_id && (!parsed.data.client_full_name?.trim() || !parsed.data.client_phone_number?.trim())) {
    return { ok: false, message: "Client name and phone number are required." };
  }
  if (parsed.data.policy_type === "Motor" && !parsed.data.vehicle_number?.trim()) {
    return { ok: false, message: "Vehicle number is required for motor insurance." };
  }
  if (parsed.data.policy_type === "Property" && !parsed.data.property_location?.trim()) {
    return { ok: false, message: "Property address/location is required for property insurance." };
  }

  const duplicate = await supabase
    .from("policies")
    .select("id")
    .eq("policy_number", parsed.data.policy_number)
    .eq("agent_id", agentId)
    .neq("id", parsed.data.id ?? "00000000-0000-0000-0000-000000000000")
    .maybeSingle();

  if (duplicate.data) return { ok: false, message: "Policy number already exists." };

  let clientId = parsed.data.client_id || "";
  if (clientId) {
    const existingClient = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("agent_id", agentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingClient.error || !existingClient.data) {
      return { ok: false, message: "Select an active client before saving this policy." };
    }
  }

  if (!clientId) {
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .insert({
        agent_id: agentId,
        full_name: parsed.data.client_full_name!.trim(),
        phone_number: normalizeGhanaPhoneNumber(parsed.data.client_phone_number!),
        email: parsed.data.client_email || null,
        date_of_birth: parsed.data.client_date_of_birth || null,
        address: parsed.data.client_address || null
      })
      .select("id")
      .single();
    if (clientError || !client) return { ok: false, message: "We could not save the client for this policy." };
    clientId = client.id;
  }

  const {
    client_full_name,
    client_phone_number,
    client_email,
    client_date_of_birth,
    client_address,
    commission_rate,
    payment_status,
    ...policyData
  } = parsed.data;

  const payload = {
    ...policyData,
    client_id: clientId,
    insurance_category: parsed.data.insurance_category,
    vehicle_number: parsed.data.policy_type === "Motor" ? parsed.data.vehicle_number?.trim() : null,
    property_location: parsed.data.policy_type === "Property" ? parsed.data.property_location?.trim() : null,
    agent_id: agentId,
    currency: "GHS"
  };
  const query = parsed.data.id
    ? supabase.from("policies").update(payload).eq("id", parsed.data.id).eq("agent_id", agentId).select(policyColumns).single()
    : supabase.from("policies").insert(payload).select(policyColumns).single();
  const { data: policy, error } = await query;
  if (error || !policy) return { ok: false, message: "We could not save this policy." };

  const existingCommission = parsed.data.id
    ? await supabase.from("commissions").select("id").eq("policy_id", policy.id).eq("agent_id", agentId).maybeSingle()
    : { data: null };
  const commissionPayload = {
    policy_id: policy.id,
    agent_id: agentId,
    commission_rate,
    payment_status,
    payment_date: payment_status === "Paid" ? new Date().toISOString().slice(0, 10) : null
  };
  const commissionQuery = existingCommission.data?.id
    ? supabase.from("commissions").update(commissionPayload).eq("id", existingCommission.data.id).eq("agent_id", agentId).select(commissionColumns).single()
    : supabase.from("commissions").insert(commissionPayload).select(commissionColumns).single();
  const { data: commission, error: commissionError } = await commissionQuery;
  if (commissionError || !commission) return { ok: false, message: "Policy saved, but commission setup failed." };

  const { data: client, error: clientFetchError } = await supabase
    .from("clients")
    .select(clientColumns)
    .eq("id", policy.client_id)
    .eq("agent_id", agentId)
    .is("deleted_at", null)
    .single();
  if (clientFetchError || !client) return { ok: false, message: "Policy saved, but client details could not be loaded." };

  revalidatePath("/policies");
  revalidatePath("/dashboard");
  return { ok: true, message: "Policy saved successfully.", policy: { ...policy, client, commission }, client, commission };
}

export async function deletePolicy(policyId: string) {
  const { supabase, agentId } = await currentUserId();
  const { error } = await supabase.from("policies").delete().eq("id", policyId).eq("agent_id", agentId);
  if (error) return { ok: false, message: "We could not delete this policy." };
  revalidatePath("/policies");
  return { ok: true, message: "Policy deleted." };
}

export async function updatePolicyRenewalStatus(input: { policy_id: string; renewal_status: RenewalStatus }) {
  const parsed = renewalStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check renewal status." };
  const { supabase, agentId } = await currentUserId();
  const { data: policy, error } = await supabase
    .from("policies")
    .update({ renewal_status: parsed.data.renewal_status })
    .eq("id", parsed.data.policy_id)
    .eq("agent_id", agentId)
    .select(policyColumns)
    .single();
  if (error || !policy) return { ok: false, message: "We could not update the renewal status." };
  revalidatePath("/dashboard");
  revalidatePath("/policies");
  return { ok: true, message: "Renewal status updated.", policy };
}

export async function addActivityNote(input: { client_id?: string; policy_id?: string; note_text: string }) {
  const parsed = activityNoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the note." };
  const { supabase, agentId } = await currentUserId();
  if (parsed.data.policy_id) {
    const { data: policy } = await supabase.from("policies").select("id").eq("id", parsed.data.policy_id).eq("agent_id", agentId).maybeSingle();
    if (!policy) return { ok: false, message: "We could not confirm this policy belongs to you." };
  }
  if (parsed.data.client_id) {
    const { data: client } = await supabase.from("clients").select("id").eq("id", parsed.data.client_id).eq("agent_id", agentId).is("deleted_at", null).maybeSingle();
    if (!client) return { ok: false, message: "We could not confirm this client belongs to you." };
  }
  const { data: note, error } = await supabase
    .from("activity_notes")
    .insert({
      agent_id: agentId,
      client_id: parsed.data.client_id || null,
      policy_id: parsed.data.policy_id || null,
      note_text: parsed.data.note_text,
      created_by: agentId
    })
    .select(activityNoteColumns)
    .single();
  if (error || !note) return { ok: false, message: "We could not save this note." };
  revalidatePath("/clients");
  revalidatePath("/policies");
  revalidatePath("/dashboard");
  return { ok: true, message: "Note saved.", note: note as ActivityNote };
}

export async function importClientsFromCsvRows(rows: unknown) {
  const parsed = importClientRowsSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check your CSV rows." };
  const { supabase, agentId } = await currentUserId();
  const limited = assertActionRateLimit(agentId, "import-clients", 5);
  if (limited) return { ok: false, message: limited };
  const policyNumbers = parsed.data.map((row) => row.policy_number);
  const duplicatePolicyNumber = policyNumbers.find((policyNumber, index) => policyNumbers.indexOf(policyNumber) !== index);
  if (duplicatePolicyNumber) return { ok: false, message: `Policy number ${duplicatePolicyNumber} appears twice in this file.` };

  for (const row of parsed.data) {
    const company = findInsuranceCompany(row.insurer_name);
    const insuranceCategory = insuranceCategoryForPolicyType(row.policy_type);
    if (!company) return { ok: false, message: `Choose an approved insurer for ${row.policy_number}.` };
    if (company.category !== insuranceCategory) return { ok: false, message: `${company.name} does not match the ${insuranceCategory} business class for ${row.policy_number}.` };
  }

  const importedClients: Client[] = [];
  const importedPolicies: PolicyWithClient[] = [];
  const importedCommissions: Commission[] = [];

  for (const row of parsed.data) {
    const { data: existingPolicy, error: existingPolicyError } = await supabase
      .from("policies")
      .select(policyColumns)
      .eq("policy_number", row.policy_number)
      .eq("agent_id", agentId)
      .maybeSingle();
    if (existingPolicyError) return { ok: false, message: `We could not check existing policy ${row.policy_number}.` };

    const clientPayload = {
      agent_id: agentId,
      full_name: row.client_name,
      phone_number: row.phone_number ? normalizeGhanaPhoneNumber(row.phone_number) : "Not captured",
      email: row.email || null,
      date_of_birth: row.date_of_birth || null,
      address: null,
      deleted_at: null
    };

    const clientQuery = existingPolicy
      ? supabase
        .from("clients")
        .update(clientPayload)
        .eq("id", existingPolicy.client_id)
        .eq("agent_id", agentId)
        .select(clientColumns)
        .single()
      : supabase
        .from("clients")
        .insert({
          agent_id: clientPayload.agent_id,
          full_name: clientPayload.full_name,
          phone_number: clientPayload.phone_number,
          email: clientPayload.email,
          date_of_birth: clientPayload.date_of_birth,
          address: clientPayload.address
        })
        .select(clientColumns)
        .single();

    const { data: client, error: clientError } = await clientQuery;
    if (clientError || !client) return { ok: false, message: `Import stopped at ${row.client_name}. We could not save this client.` };

    const company = findInsuranceCompany(row.insurer_name)!;
    const insuranceCategory = insuranceCategoryForPolicyType(row.policy_type);
    const reviewReasons = importReviewReasons(row);
    const reviewNote = reviewReasons.length ? `Needs Review: ${reviewReasons.join("; ")}.` : "";
    const notes = [reviewNote, row.notes?.trim()].filter(Boolean).join("\n\n") || null;
    const policyPayload = {
        agent_id: agentId,
        client_id: client.id,
        policy_number: row.policy_number,
        policy_type: row.policy_type,
        insurance_category: insuranceCategory,
        vehicle_number: row.policy_type === "Motor" ? row.vehicle_number?.trim() : null,
        property_location: row.policy_type === "Property" ? row.property_location?.trim() : null,
        insurer_name: company.name,
        start_date: row.policy_start_date || inferImportStartDate(row.policy_end_date),
        expiry_date: row.policy_end_date,
        premium_amount: row.premium ?? 0,
        currency: "GHS",
        status: "Active" as const,
        renewal_status: "Upcoming" as const,
        notes
    };

    const policyQuery = existingPolicy
      ? supabase
        .from("policies")
        .update(policyPayload)
        .eq("id", existingPolicy.id)
        .eq("agent_id", agentId)
        .select(policyColumns)
        .single()
      : supabase
        .from("policies")
        .insert(policyPayload)
        .select(policyColumns)
        .single();

    const { data: policy, error: policyError } = await policyQuery;
    if (policyError || !policy) {
      return { ok: false, message: `Import stopped at ${row.policy_number}. This policy number may still exist in archived data.` };
    }

    const { data: existingCommission } = await supabase
      .from("commissions")
      .select("id")
      .eq("policy_id", policy.id)
      .eq("agent_id", agentId)
      .maybeSingle();

    const commissionPayload = {
      agent_id: agentId,
      policy_id: policy.id,
      commission_rate: row.commission_rate ?? 10,
      payment_status: row.commission_status ?? "Pending",
      payment_date: row.commission_status === "Paid" ? row.commission_payment_date || new Date().toISOString().slice(0, 10) : null
    };

    const commissionQuery = existingCommission?.id
      ? supabase
        .from("commissions")
        .update(commissionPayload)
        .eq("id", existingCommission.id)
        .eq("agent_id", agentId)
        .select(commissionColumns)
        .single()
      : supabase
        .from("commissions")
        .insert(commissionPayload)
        .select(commissionColumns)
        .single();

    const { data: commission, error: commissionError } = await commissionQuery;
    if (commissionError || !commission) return { ok: false, message: `Policy ${row.policy_number} imported, but commission setup failed.` };

    importedClients.push(client as Client);
    importedCommissions.push(commission as Commission);
    importedPolicies.push({ ...(policy as Omit<PolicyWithClient, "client" | "commission">), client: client as Client, commission: commission as Commission });
  }

  revalidatePath("/clients");
  revalidatePath("/policies");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `${importedClients.length} client${importedClients.length === 1 ? "" : "s"} imported.`,
    clients: importedClients,
    policies: importedPolicies,
    commissions: importedCommissions
  };
}

export async function markCommissionPaid(input: { commission_id: string }) {
  const parsed = commissionPaidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check commission." };
  const { supabase, agentId } = await currentUserId();
  const paymentDate = new Date().toISOString().slice(0, 10);
  const { data: commission, error } = await supabase
    .from("commissions")
    .update({ payment_status: "Paid", payment_date: paymentDate })
    .eq("id", parsed.data.commission_id)
    .eq("agent_id", agentId)
    .select(commissionColumns)
    .single();
  if (error || !commission) return { ok: false, message: "We could not mark this commission as paid." };
  revalidatePath("/commissions");
  revalidatePath("/dashboard");
  return { ok: true, message: "Commission marked as paid.", commission };
}

export async function markAllNotificationsRead() {
  const { supabase, agentId } = await currentUserId();
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("agent_id", agentId);
  if (error) return { ok: false, message: "We could not update notifications." };
  revalidatePath("/notifications");
  return { ok: true, message: "Notifications marked as read." };
}

export async function markNotificationRead(input: { notification_id: string }) {
  const parsed = notificationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check notification." };
  const { supabase, agentId } = await currentUserId();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", parsed.data.notification_id)
    .eq("agent_id", agentId);
  if (error) return { ok: false, message: "We could not update this notification." };
  revalidatePath("/notifications");
  return { ok: true, message: "Notification updated." };
}

export async function updateProfile(formData: FormData) {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check profile details." };
  const { supabase, agentId } = await currentUserId();
  const { data: profile, error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      phone_number: parsed.data.phone_number ? normalizeGhanaPhoneNumber(parsed.data.phone_number) : null,
      company_name: parsed.data.company_name || null
    })
    .eq("id", agentId)
    .select(profileColumns)
    .single();
  if (error || !profile) return { ok: false, message: "We could not save your profile." };
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { ok: true, message: "Profile saved.", profile };
}

export async function updateNotificationSettings(input: z.infer<typeof notificationSettingsSchema>) {
  const parsed = notificationSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check notification settings." };
  const { supabase, agentId } = await currentUserId();
  const { data: profile, error } = await supabase
    .from("profiles")
    .update(parsed.data)
    .eq("id", agentId)
    .select(profileColumns)
    .single();
  if (error || !profile) return { ok: false, message: "We could not save notification settings." };
  revalidatePath("/profile");
  return { ok: true, message: "Notification settings saved.", profile };
}

export async function uploadProfileAvatar(formData: FormData) {
  const file = formData.get("avatar");
  if (!(file instanceof File)) {
    return { ok: false, message: "Please choose a profile photo." };
  }
  const extension = avatarAllowedTypes.get(file.type);
  if (!extension) {
    return { ok: false, message: "Profile photo must be a JPG, PNG, or WebP image." };
  }
  if (file.size > maxAvatarSize) {
    return { ok: false, message: "Profile photo must be 2MB or smaller." };
  }

  const { supabase, agentId } = await currentUserId();
  const limited = assertActionRateLimit(agentId, "upload-avatar", 10);
  if (limited) return { ok: false, message: limited };
  const path = `${agentId}/avatar.${extension}`;
  const upload = await supabase.storage.from("avatars").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: true
  });
  if (upload.error) {
    return { ok: false, message: "We could not upload your profile photo." };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .update({ avatar_url: path })
    .eq("id", agentId)
    .select(profileColumns)
    .single();
  if (error || !profile) {
    return { ok: false, message: "We could not save your profile photo." };
  }

  const signed = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
  if (signed.error || !signed.data?.signedUrl) {
    return { ok: false, message: "Profile photo uploaded, but we could not display it yet." };
  }

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { ok: true, message: "Profile photo updated.", profile: { ...profile, avatar_url: signed.data.signedUrl } };
}
