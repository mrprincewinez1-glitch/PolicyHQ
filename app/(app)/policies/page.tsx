import { AppShell } from "@/components/app/app-shell";
import { getAuthenticatedAppData } from "@/lib/data";

export default async function PoliciesPage() {
  const data = await getAuthenticatedAppData();
  return <AppShell initialData={data} section="policies" />;
}
