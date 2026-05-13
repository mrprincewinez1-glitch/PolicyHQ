import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "orange" | "green" | "red" | "amber" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold",
        tone === "slate" && "bg-slate-100 text-slate-700",
        tone === "orange" && "bg-orange-100 text-orange-700",
        tone === "green" && "bg-green-100 text-green-700",
        tone === "red" && "bg-red-100 text-red-700",
        tone === "amber" && "bg-amber-100 text-amber-700"
      )}
    >
      {children}
    </span>
  );
}
