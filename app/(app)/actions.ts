"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isValidPolicyNumber, normalizePolicyNumber, policyNumberHelpText } from "@/lib/policy-number";
import { createClient } from "@/lib/supabase/server";
import type { RenewalStatus } from "@/lib/types";

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
  policy_type: z.enum(["Life", "Health", "Motor", "Property", "Fire", "Marine", "Travel"]),
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
  renewal_status: z.enum(["Not Started", "Reminder Sent", "Under Renewal", "Renewed", "Lapsed"]),
  notes: z.string().optional()
});

const renewalStatusSchema = z.object({
  policy_id: z.string().uuid("Policy is invalid"),
  renewal_status: z.enum(["Not Started", "Reminder Sent", "Under Renewal", "Renewed", "Lapsed"])
});

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
const clientColumns = "id, agent_id, full_name, phone_number, email, date_of_birth, address, deleted_at, created_at, updated_at";
const policyColumns = "id, agent_id, client_id, policy_number, policy_type, insurance_category, vehicle_number, property_location, insurer_name, start_date, expiry_date, premium_amount, currency, status, renewal_status, notes, created_at, updated_at";
const commissionColumns = "id, policy_id, agent_id, commission_rate, commission_amount, payment_status, payment_date, created_at";
const profileColumns = "id, role, full_name, email, phone_number, company_name, avatar_url, whatsapp_enabled, email_notifications_enabled, birthday_messages_enabled, agent_whatsapp_summary_enabled, reminder_30_enabled, reminder_14_enabled, reminder_7_enabled";

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function currentUserId() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Unauthenticated");
  return { supabase, agentId: data.user.id };
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
  const payload = { ...parsed.data, agent_id: agentId, email: parsed.data.email || null, date_of_birth: parsed.data.date_of_birth || null };
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
        phone_number: parsed.data.client_phone_number!.trim(),
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
      phone_number: parsed.data.phone_number || null,
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
    .select("*")
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
