import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { demoData } from "@/lib/demo-data";

const sections = ["dashboard", "clients", "policies", "commissions", "notifications", "profile"] as const;

export default function DemoSectionPage({ params }: { params: { section: string } }) {
  if (!sections.includes(params.section as typeof sections[number])) notFound();
  return <AppShell initialData={demoData} section={params.section as typeof sections[number]} demo />;
}
