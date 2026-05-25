import { AppShell } from "@/components/app/app-shell";
import { demoData } from "@/lib/demo-data";

export default async function DemoClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell initialData={demoData} section="clients" demo clientId={id} />;
}
