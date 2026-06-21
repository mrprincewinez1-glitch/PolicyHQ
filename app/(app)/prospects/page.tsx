import { AppShell } from "@/components/app/app-shell";
import { getAuthenticatedAppData } from "@/lib/data";

export default async function ProspectsPage({ searchParams }: { searchParams?: Promise<{ filter?: string }> }) {
  const params = await searchParams;
  const data = await getAuthenticatedAppData();
  const prospectFilter = params?.filter === "today" || params?.filter === "overdue" ? params.filter : undefined;
  return <AppShell initialData={data} section="prospects" prospectFilter={prospectFilter} />;
}
