import { adminJsonResponse, requireAdmin } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";

type CommissionRow = {
  commission_amount: number;
  payment_status: "Paid" | "Pending";
};

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return adminJsonResponse(admin);
  }

  const supabase = await createClient();
  const [agentsResult, clientsResult, policiesResult, commissionsResult] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("clients").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("policies").select("id", { count: "exact", head: true }),
    supabase.from("commissions").select("commission_amount, payment_status").range(0, 999)
  ]);

  if (agentsResult.error || clientsResult.error || policiesResult.error || commissionsResult.error) {
    return Response.json({ message: "Could not load platform analytics." }, { status: 500 });
  }

  const commissions = (commissionsResult.data ?? []) as CommissionRow[];
  const paidCommissions = commissions
    .filter((commission) => commission.payment_status === "Paid")
    .reduce((sum, commission) => sum + commission.commission_amount, 0);
  const pendingCommissions = commissions
    .filter((commission) => commission.payment_status === "Pending")
    .reduce((sum, commission) => sum + commission.commission_amount, 0);

  return Response.json({
    analytics: {
      agents: agentsResult.count ?? 0,
      clients: clientsResult.count ?? 0,
      policies: policiesResult.count ?? 0,
      paidCommissions,
      pendingCommissions
    }
  });
}
