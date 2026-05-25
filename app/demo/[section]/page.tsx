import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { demoData } from "@/lib/demo-data";

const sections = ["dashboard", "clients", "prospects", "policies", "commissions", "notifications", "profile"] as const;
const focusSections = ["birthdays", "anniversaries", "life-retention", "lapse-shield"] as const;

export default function DemoSectionPage({ params }: { params: { section: string } }) {
  if (focusSections.includes(params.section as typeof focusSections[number])) {
    return <AppShell initialData={demoData} section="dashboard" demo dashboardFocus={params.section as typeof focusSections[number]} />;
  }
  if (!sections.includes(params.section as typeof sections[number])) notFound();
  return <AppShell initialData={demoData} section={params.section as typeof sections[number]} demo />;
}
