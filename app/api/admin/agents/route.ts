import { adminJsonResponse, requireAdmin } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return adminJsonResponse(admin);
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, company_name, role, created_at")
    .order("created_at", { ascending: false })
    .range(0, 99);

  if (error) {
    return Response.json({ message: "Could not load agents." }, { status: 500 });
  }

  return Response.json({ agents: data ?? [] });
}
