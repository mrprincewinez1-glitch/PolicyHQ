import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { demoData } from "@/lib/demo-data";

export default function DemoRenewalRangePage({ params }: { params: { range: string } }) {
  if (!["week", "next-week", "month"].includes(params.range)) notFound();
  return <AppShell initialData={demoData} section="dashboard" demo renewalRange={params.range as "week" | "next-week" | "month"} />;
}
