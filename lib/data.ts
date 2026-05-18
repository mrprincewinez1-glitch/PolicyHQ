import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { demoData } from "@/lib/demo-data";
import type { ActivityNote, AppData, Client, Commission, PolicyWithClient, Profile } from "@/lib/types";

const profileColumns = "id, role, full_name, email, phone_number, company_name, avatar_url, whatsapp_enabled, email_notifications_enabled, birthday_messages_enabled, agent_whatsapp_summary_enabled, reminder_30_enabled, reminder_14_enabled, reminder_7_enabled";
const clientColumns = "id, agent_id, full_name, phone_number, email, date_of_birth, address, deleted_at, created_at, updated_at";
const policyColumns = "id, agent_id, client_id, policy_number, policy_type, insurance_category, vehicle_number, property_location, insurer_name, start_date, expiry_date, premium_amount, currency, status, renewal_status, notes, created_at, updated_at, client:clients(id, agent_id, full_name, phone_number, email, date_of_birth, address, deleted_at, created_at, updated_at)";
const commissionColumns = "id, policy_id, agent_id, commission_rate, commission_amount, payment_status, payment_date, created_at";
const notificationColumns = "id, agent_id, policy_id, client_id, message, type, is_read, created_at";
const activityNoteColumns = "id, agent_id, client_id, policy_id, note_text, created_by, created_at";

type RawPolicyWithClient = Omit<PolicyWithClient, "client"> & {
  client: Client | Client[] | null;
};

export async function getAuthenticatedAppData(): Promise<AppData> {
  if (process.env.NEXT_PUBLIC_LOCAL_PREVIEW === "true") {
    return demoData;
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/sign-in?error=Please sign in again. Your session was not active.");

  const [profileResult, clientsResult, policiesResult, commissionsResult, notificationsResult, activityNotesResult] = await Promise.all([
    supabase.from("profiles").select(profileColumns).eq("id", user.id).single(),
    supabase.from("clients").select(clientColumns).eq("agent_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("policies").select(policyColumns).eq("agent_id", user.id).order("expiry_date", { ascending: true }),
    supabase.from("commissions").select(commissionColumns).eq("agent_id", user.id).order("created_at", { ascending: false }),
    supabase.from("notifications").select(notificationColumns).eq("agent_id", user.id).order("created_at", { ascending: false }),
    supabase.from("activity_notes").select(activityNoteColumns).eq("agent_id", user.id).order("created_at", { ascending: false }).limit(250)
  ]);

  let profile = profileResult.data;
  if (profileResult.error || !profile) {
    const { data: repairedProfile, error: repairError } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        full_name: String(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "PolicyHQ Agent"),
        email: user.email ?? null,
        phone_number: user.phone ?? user.user_metadata?.phone_number ?? null,
        birthday_messages_enabled: true,
        agent_whatsapp_summary_enabled: true,
        company_name: user.user_metadata?.company_name ?? null
      })
      .select(profileColumns)
      .single();

    if (repairError || !repairedProfile) {
      console.error("PolicyHQ profile repair failed", repairError);
      redirect("/sign-in?error=You signed in, but PolicyHQ could not create your agent profile. Please tell Codex this exact message.");
    }
    profile = repairedProfile;
  }

  const rawCommissions = (commissionsResult.data ?? []) as Commission[];
  const clients = (clientsResult.data ?? []) as Client[];
  await logClientViews(supabase, user.id, clients.map((client) => client.id));
  const activityNotes = ((activityNotesResult.data ?? []) as ActivityNote[]).map((note) => ({
    ...note,
    author_name: profile?.full_name ?? null
  }));
  const policies: PolicyWithClient[] = [];
  for (const policy of (policiesResult.data ?? []) as unknown as RawPolicyWithClient[]) {
    const client = Array.isArray(policy.client) ? policy.client[0] : policy.client;
    if (!client || client.deleted_at) continue;
    policies.push({
      ...policy,
      client,
      commission: rawCommissions.find((commission) => commission.policy_id === policy.id),
      activity_notes: activityNotes.filter((note) => note.policy_id === policy.id)
    });
  }
  const activePolicyIds = new Set(policies.map((policy) => policy.id));
  const commissions = rawCommissions.filter((commission) => activePolicyIds.has(commission.policy_id));

  return {
    profile: await profileWithSignedAvatar(supabase, profile as Profile),
    clients,
    policies,
    commissions,
    notifications: notificationsResult.data ?? [],
    activity_notes: activityNotes
  };
}

async function logClientViews(supabase: ReturnType<typeof createClient>, userId: string, clientIds: string[]) {
  if (!clientIds.length) return;
  const { error } = await supabase.from("audit_log").insert(
    clientIds.map((clientId) => ({
      user_id: userId,
      action: "viewed",
      table_name: "clients",
      record_id: clientId
    }))
  );
  if (error) {
    console.error("Client view audit log insert failed");
  }
}

async function profileWithSignedAvatar(supabase: ReturnType<typeof createClient>, profile: Profile) {
  const path = avatarStoragePath(profile.avatar_url);
  if (!path) return profile;

  const { data, error } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return { ...profile, avatar_url: null };
  return { ...profile, avatar_url: data.signedUrl };
}

function avatarStoragePath(value: string | null) {
  if (!value) return null;
  if (!value.startsWith("http")) return value;

  try {
    const url = new URL(value);
    const publicAvatarPrefix = "/storage/v1/object/public/avatars/";
    const index = url.pathname.indexOf(publicAvatarPrefix);
    if (index === -1) return null;
    return decodeURIComponent(url.pathname.slice(index + publicAvatarPrefix.length));
  } catch {
    return null;
  }
}
