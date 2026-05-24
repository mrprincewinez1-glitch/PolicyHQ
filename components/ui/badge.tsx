import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "orange" | "green" | "red" | "amber" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold",
        tone === "slate" && "bg-primary/10 text-primary",
        tone === "orange" && "bg-accent/10 text-accent",
        tone === "green" && "bg-success/10 text-success",
        tone === "red" && "bg-danger/10 text-danger",
        tone === "amber" && "bg-warning/10 text-warning"
      )}
    >
      {children}
    </span>
  );
}
