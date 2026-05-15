import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

type AgentRow = {
  id: string;
  full_name: string;
  email: string | null;
  company_name: string | null;
  role: "admin" | "agent";
  created_at: string;
};

type CommissionRow = {
  commission_amount: number;
  payment_status: "Paid" | "Pending";
};

export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    redirect("/dashboard");
  }

  const supabase = createClient();
  const [agentsResult, clientsResult, policiesResult, commissionsResult] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, company_name, role, created_at").order("created_at", { ascending: false }).range(0, 99),
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("policies").select("id", { count: "exact", head: true }),
    supabase.from("commissions").select("commission_amount, payment_status").range(0, 999)
  ]);

  const agents = (agentsResult.data ?? []) as AgentRow[];
  const commissions = (commissionsResult.data ?? []) as CommissionRow[];
  const totalPaid = commissions
    .filter((commission) => commission.payment_status === "Paid")
    .reduce((sum, commission) => sum + commission.commission_amount, 0);
  const totalPending = commissions
    .filter((commission) => commission.payment_status === "Pending")
    .reduce((sum, commission) => sum + commission.commission_amount, 0);

  return (
    <main className="min-h-screen bg-slate-50 p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-orange-600">Admin</p>
            <h1 className="text-3xl font-extrabold text-slate-950">PolicyHQ Platform Overview</h1>
            <p className="mt-1 text-slate-600">Admin-only view for agents and platform-wide totals.</p>
          </div>
          <Link href="/dashboard" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-sm">
            Back to Dashboard
          </Link>
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          <AdminMetric label="Agents" value={agents.length} />
          <AdminMetric label="Clients" value={clientsResult.count ?? 0} />
          <AdminMetric label="Policies" value={policiesResult.count ?? 0} />
          <AdminMetric label="Paid Commissions" value={formatCurrency(totalPaid)} />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-xl font-extrabold text-slate-950">Agents</h2>
            <p className="mt-1 text-sm text-slate-600">Read-only MVP list. Agent management actions can be added later.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Company</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agents.map((agent) => (
                  <tr key={agent.id}>
                    <td className="px-5 py-3 font-bold text-slate-950">{agent.full_name}</td>
                    <td className="px-5 py-3 text-slate-600">{agent.email ?? "-"}</td>
                    <td className="px-5 py-3 text-slate-600">{agent.company_name ?? "-"}</td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-700">{agent.role}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{new Date(agent.created_at).toLocaleDateString("en-GB")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <AdminMetric label="Pending Commissions" value={formatCurrency(totalPending)} />
          <AdminMetric label="Commission Records" value={commissions.length} />
        </section>
      </div>
    </main>
  );
}

function AdminMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <strong className="mt-2 block text-3xl text-slate-950">{value}</strong>
    </div>
  );
}
