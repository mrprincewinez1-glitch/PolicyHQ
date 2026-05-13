"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isValidPolicyNumber, normalizePolicyNumber, policyNumberHelpText } from "@/lib/policy-number";
import { createClient } from "@/lib/supabase/server";

const clientSchema = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().min(2, "Full name is required"),
  phone_number: z.string().min(8, "Phone number is required"),
  email: z.string().email().optional().or(z.literal("")),
  date_of_birth: z.string().optional().or(z.literal("")),
  address: z.string().optional()
});

const policySchema = z.object({
  id: z.string().uuid().optional(),
  client_id: z.string().uuid("Select a client").optional().or(z.literal("")),
  client_full_name: z.string().optional(),
  client_phone_number: z.string().optional(),
  client_email: z.string().email().optional().or(z.literal("")),
  client_date_of_birth: z.string().optional().or(z.literal("")),
  client_address: z.string().optional(),
  policy_number: z.string().transform(normalizePolicyNumber).refine(isValidPolicyNumber, policyNumberHelpText),
  policy_type: z.enum(["Life", "Health", "Motor", "Property", "Fire", "Marine", "Travel"]),
  insurance_category: z.enum(["Life", "Non-Life", "Health"]),
  vehicle_number: z.string().optional(),
  property_location: z.string().optional(),
  insurer_name: z.string().min(2, "Insurer is required"),
  start_date: z.string().min(1, "Start date is required"),
  expiry_date: z.string().min(1, "Expiry date is required"),
  premium_amount: z.coerce.number().positive("Premium must be greater than zero"),
  status: z.enum(["Active", "Expired", "Cancelled"]),
  renewal_status: z.enum(["Not Started", "Reminder Sent", "Under Renewal", "Renewed", "Lapsed"]),
  notes: z.string().optional()
});

const avatarAllowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);
const maxAvatarSize = 2 * 1024 * 1024;

async function currentUserId() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Unauthenticated");
  return { supabase, agentId: data.user.id };
}

export async function upsertClient(_: unknown, formData: FormData) {
  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check client details." };
  const { supabase, agentId } = await currentUserId();
  const payload = { ...parsed.data, agent_id: agentId, email: parsed.data.email || null, date_of_birth: parsed.data.date_of_birth || null };
  const query = parsed.data.id
    ? supabase.from("clients").update(payload).eq("id", parsed.data.id).eq("agent_id", agentId)
    : supabase.from("clients").insert(payload);
  const { error } = await query;
  if (error) return { ok: false, message: "We could not save this client." };
  revalidatePath("/clients");
  return { ok: true, message: "Client saved successfully." };
}

export async function deleteClient(clientId: string) {
  const { supabase, agentId } = await currentUserId();
  const { error } = await supabase.from("clients").delete().eq("id", clientId).eq("agent_id", agentId);
  if (error) return { ok: false, message: "We could not delete this client." };
  revalidatePath("/clients");
  return { ok: true, message: "Client deleted." };
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
    ? supabase.from("policies").update(payload).eq("id", parsed.data.id).eq("agent_id", agentId)
    : supabase.from("policies").insert(payload);
  const { error } = await query;
  if (error) return { ok: false, message: "We could not save this policy." };
  revalidatePath("/policies");
  revalidatePath("/dashboard");
  return { ok: true, message: "Policy saved successfully." };
}

export async function deletePolicy(policyId: string) {
  const { supabase, agentId } = await currentUserId();
  const { error } = await supabase.from("policies").delete().eq("id", policyId).eq("agent_id", agentId);
  if (error) return { ok: false, message: "We could not delete this policy." };
  revalidatePath("/policies");
  return { ok: true, message: "Policy deleted." };
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
