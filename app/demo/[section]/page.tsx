import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { demoData } from "@/lib/demo-data";

const sections = ["dashboard", "clients", "prospects", "policies", "commissions", "notifications", "profile"] as const;
const focusSections = ["birthdays", "anniversaries", "life-retention", "lapse-shield"] as const;

export default async function DemoSectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams?: Promise<{ filter?: string }> }) {
  const { section } = await params;
  const query = await searchParams;
  if (focusSections.includes(section as typeof focusSections[number])) {
    return <AppShell initialData={demoData} section="dashboard" demo dashboardFocus={section as typeof focusSections[number]} />;
  }
  if (!sections.includes(section as typeof sections[number])) notFound();
  const prospectFilter = section === "prospects" && (query?.filter === "today" || query?.filter === "overdue") ? query.filter : undefined;
  return <AppShell initialData={demoData} section={section as typeof sections[number]} demo prospectFilter={prospectFilter} />;
}
