import { AppShell } from "@/components/app/app-shell";
import { getAuthenticatedAppData } from "@/lib/data";

export default async function ClientsPage() {
  const data = await getAuthenticatedAppData();
  return <AppShell initialData={data} section="clients" />;
}
