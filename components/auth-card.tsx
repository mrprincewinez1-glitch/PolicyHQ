import Link from "next/link";
import type { ReactNode } from "react";
import { PolicyHqLogo } from "@/components/brand/policyhq-logo";
import { Card, CardContent } from "@/components/ui/card";

export function AuthCard({ title, subtitle, children, message }: { title: string; subtitle: string; children: ReactNode; message?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent className="p-7">
          <Link href="/" className="mb-8 flex items-center">
            <PolicyHqLogo className="h-14 w-auto" />
          </Link>
          <h1 className="text-2xl font-extrabold">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
          {message ? <p className="mt-4 rounded-xl bg-orange-50 p-3 text-sm font-semibold text-orange-700">{message}</p> : null}
          <div className="mt-6">{children}</div>
        </CardContent>
      </Card>
    </main>
  );
}
