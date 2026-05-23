import { AppShell } from "@/components/app/app-shell";
import { getAuthenticatedAppData } from "@/lib/data";

export default async function ProspectsPage({ searchParams }: { searchParams?: { filter?: string } }) {
  const data = await getAuthenticatedAppData();
  return <AppShell initialData={data} section="prospects" prospectFilter={searchParams?.filter === "today" ? "today" : undefined} />;
}
