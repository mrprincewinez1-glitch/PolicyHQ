import { AppShell } from "@/components/app/app-shell";
import { getAuthenticatedAppData } from "@/lib/data";

export default async function LapseShieldPage() {
  const data = await getAuthenticatedAppData();
  return <AppShell initialData={data} section="dashboard" dashboardFocus="lapse-shield" />;
}
