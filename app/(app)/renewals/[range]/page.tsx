import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { getAuthenticatedAppData } from "@/lib/data";

export default async function RenewalRangePage({ params }: { params: { range: string } }) {
  if (!["week", "next-week", "month"].includes(params.range)) notFound();
  const data = await getAuthenticatedAppData();
  return <AppShell initialData={data} section="dashboard" renewalRange={params.range as "week" | "next-week" | "month"} />;
}
