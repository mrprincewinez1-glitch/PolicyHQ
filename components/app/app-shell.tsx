"use client";

import dynamic from "next/dynamic";
import type { AppData } from "@/lib/types";

type AppShellProps = {
  initialData: AppData;
  section?: "dashboard" | "clients" | "policies" | "commissions" | "notifications" | "profile";
  demo?: boolean;
  renewalRange?: "week" | "next-week" | "month";
  clientId?: string;
};

const AppShellClient = dynamic(
  () => import("@/components/app/app-shell-client").then((module) => module.AppShell),
  {
    ssr: false,
    loading: () => (
      <main className="min-h-screen bg-slate-50 p-4 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="skeleton h-10 w-64 rounded-xl" />
          <div className="grid gap-4 md:grid-cols-4">
            <div className="skeleton h-32 rounded-xl" />
            <div className="skeleton h-32 rounded-xl" />
            <div className="skeleton h-32 rounded-xl" />
            <div className="skeleton h-32 rounded-xl" />
          </div>
          <div className="skeleton h-96 rounded-xl" />
        </div>
      </main>
    )
  }
);

export function AppShell(props: AppShellProps) {
  return <AppShellClient {...props} />;
}
