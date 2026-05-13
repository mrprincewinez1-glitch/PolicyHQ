import { AppShell } from "@/components/app/app-shell";
import { getAuthenticatedAppData } from "@/lib/data";

export default async function ProfilePage() {
  const data = await getAuthenticatedAppData();
  return <AppShell initialData={data} section="profile" />;
}
