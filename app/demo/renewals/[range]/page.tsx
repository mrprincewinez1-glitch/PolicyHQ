import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { demoData } from "@/lib/demo-data";

export default async function DemoRenewalRangePage({ params }: { params: Promise<{ range: string }> }) {
  const { range } = await params;
  if (!["week", "next-week", "month"].includes(range)) notFound();
  return <AppShell initialData={demoData} section="dashboard" demo renewalRange={range as "week" | "next-week" | "month"} />;
}
