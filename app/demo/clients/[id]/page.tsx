import { AppShell } from "@/components/app/app-shell";
import { demoData } from "@/lib/demo-data";

export default function DemoClientDetailPage({ params }: { params: { id: string } }) {
  return <AppShell initialData={demoData} section="clients" demo clientId={params.id} />;
}
