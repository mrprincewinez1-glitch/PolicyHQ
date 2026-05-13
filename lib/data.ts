import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { demoData } from "@/lib/demo-data";
import type { AppData, Commission, PolicyWithClient, Profile } from "@/lib/types";

export async function getAuthenticatedAppData(): Promise<AppData> {
  if (process.env.NEXT_PUBLIC_LOCAL_PREVIEW === "true") {
    return demoData;
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/sign-in?error=Please sign in again. Your session was not active.");

  const [profileResult, clientsResult, policiesResult, commissionsResult, notificationsResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("clients").select("*").eq("agent_id", user.id).order("created_at", { ascending: false }),
    supabase.from("policies").select("*, client:clients(*)").eq("agent_id", user.id).order("expiry_date", { ascending: true }),
    supabase.from("commissions").select("*").eq("agent_id", user.id).order("created_at", { ascending: false }),
    supabase.from("notifications").select("*").eq("agent_id", user.id).order("created_at", { ascending: false })
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
      .select("*")
      .single();

    if (repairError || !repairedProfile) {
      console.error("PolicyHQ profile repair failed", repairError);
      redirect("/sign-in?error=You signed in, but PolicyHQ could not create your agent profile. Please tell Codex this exact message.");
    }
    profile = repairedProfile;
  }

  const commissions = (commissionsResult.data ?? []) as Commission[];
  const policies = ((policiesResult.data ?? []) as PolicyWithClient[]).map((policy) => ({
    ...policy,
    commission: commissions.find((commission) => commission.policy_id === policy.id)
  }));

  return {
    profile: await profileWithSignedAvatar(supabase, profile as Profile),
    clients: clientsResult.data ?? [],
    policies,
    commissions,
    notifications: notificationsResult.data ?? []
  };
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
