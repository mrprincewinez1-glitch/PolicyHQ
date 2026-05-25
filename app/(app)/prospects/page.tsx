import { AppShell } from "@/components/app/app-shell";
import { getAuthenticatedAppData } from "@/lib/data";

export default async function ProspectsPage({ searchParams }: { searchParams?: Promise<{ filter?: string }> }) {
  const params = await searchParams;
  const data = await getAuthenticatedAppData();
  return <AppShell initialData={data} section="prospects" prospectFilter={params?.filter === "today" ? "today" : undefined} />;
}
