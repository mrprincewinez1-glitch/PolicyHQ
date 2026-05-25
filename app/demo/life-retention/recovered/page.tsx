import { AppShell } from "@/components/app/app-shell";
import { demoData } from "@/lib/demo-data";

export default function DemoRecoveredLifePage() {
  return <AppShell initialData={demoData} section="dashboard" demo dashboardFocus="recovered-life" />;
}
