import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-center">
      <div>
        <p className="text-sm font-bold text-accent">404</p>
        <h1 className="mt-2 text-4xl font-extrabold text-primary">Page not found</h1>
        <p className="mt-3 text-slate-600">The PolicyHQ page you requested does not exist.</p>
        <Button asChild className="mt-6"><Link href="/">Return home</Link></Button>
      </div>
    </main>
  );
}
