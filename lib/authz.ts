import { createClient } from "@/lib/supabase/server";

export type AdminCheck =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; message: string };

export async function requireAdmin(): Promise<AdminCheck> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return { ok: false, status: 401, message: "Please sign in to continue." };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error || profile?.role !== "admin") {
    return { ok: false, status: 403, message: "You do not have permission to do that." };
  }

  return { ok: true, userId: user.id };
}

export function adminJsonResponse(check: Exclude<AdminCheck, { ok: true }>) {
  return Response.json({ message: check.message }, { status: check.status });
}
