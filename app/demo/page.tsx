import { AppShell } from "@/components/app/app-shell";
import { demoData } from "@/lib/demo-data";

export default function DemoPage() {
  return <AppShell initialData={demoData} section="dashboard" demo />;
}
