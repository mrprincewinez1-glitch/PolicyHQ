"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-center">
      <div>
        <p className="text-sm font-bold text-danger">Unexpected error</p>
        <h1 className="mt-2 text-4xl font-extrabold text-primary">Something went wrong</h1>
        <p className="mt-3 text-slate-600">PolicyHQ could not complete that request. Please try again.</p>
        <Button className="mt-6" onClick={reset}>Try Again</Button>
      </div>
    </main>
  );
}
