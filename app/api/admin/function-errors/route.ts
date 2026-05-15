import { adminJsonResponse, requireAdmin } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return adminJsonResponse(admin);
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("function_error_logs")
    .select("id, function_name, error_message, error_stack, created_at, resolved")
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .range(0, 99);

  if (error) {
    return Response.json({ message: "Could not load function errors." }, { status: 500 });
  }

  return Response.json({ errors: data ?? [] });
}
