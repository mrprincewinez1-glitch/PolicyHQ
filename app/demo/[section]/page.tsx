import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { demoData } from "@/lib/demo-data";

const sections = ["dashboard", "clients", "prospects", "policies", "commissions", "notifications", "profile"] as const;
const focusSections = ["birthdays", "anniversaries", "life-retention", "lapse-shield"] as const;

export default async function DemoSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (focusSections.includes(section as typeof focusSections[number])) {
    return <AppShell initialData={demoData} section="dashboard" demo dashboardFocus={section as typeof focusSections[number]} />;
  }
  if (!sections.includes(section as typeof sections[number])) notFound();
  return <AppShell initialData={demoData} section={section as typeof sections[number]} demo />;
}
