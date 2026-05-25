import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { getAuthenticatedAppData } from "@/lib/data";

export default async function RenewalRangePage({ params }: { params: Promise<{ range: string }> }) {
  const { range } = await params;
  if (!["week", "next-week", "month"].includes(range)) notFound();
  const data = await getAuthenticatedAppData();
  return <AppShell initialData={data} section="dashboard" renewalRange={range as "week" | "next-week" | "month"} />;
}
