import { AppShell } from "@/components/app/app-shell";
import { getAuthenticatedAppData } from "@/lib/data";

export default async function CommissionsPage({ searchParams }: { searchParams?: Promise<{ filter?: string }> }) {
  const data = await getAuthenticatedAppData();
  const params = await searchParams;
  return <AppShell initialData={data} section="commissions" commissionFilter={params?.filter === "paid-this-month" ? "paid-this-month" : undefined} />;
}
