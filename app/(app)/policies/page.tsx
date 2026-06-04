import { AppShell } from "@/components/app/app-shell";
import { getAuthenticatedAppData } from "@/lib/data";

export default async function PoliciesPage({ searchParams }: { searchParams?: Promise<{ filter?: string }> }) {
  const params = await searchParams;
  const data = await getAuthenticatedAppData();
  return <AppShell initialData={data} section="policies" policyFilter={params?.filter === "needs-review" ? "needs-review" : undefined} />;
}
