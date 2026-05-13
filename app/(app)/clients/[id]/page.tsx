import { AppShell } from "@/components/app/app-shell";
import { getAuthenticatedAppData } from "@/lib/data";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const data = await getAuthenticatedAppData();
  return <AppShell initialData={data} section="clients" clientId={params.id} />;
}
