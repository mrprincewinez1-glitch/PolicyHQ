import { addDays, endOfMonth, endOfWeek, format, isAfter, isBefore, isWithinInterval, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { PolicyWithClient } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2
  }).format(value);
}

export function formatDate(value: string | Date) {
  const date = typeof value === "string" ? parseISO(value) : value;
  return format(date, "dd MMM yyyy");
}

export function fullDate(value = new Date()) {
  return format(value, "EEEE, d MMMM yyyy");
}

export function greeting(firstName: string) {
  const hour = new Date().getHours();
  if (hour < 12) return `Good Morning, ${firstName} 👋`;
  if (hour < 17) return `Good Afternoon, ${firstName} 👋`;
  return `Good Evening, ${firstName} 👋`;
}

export function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "Agent";
}

export function daysUntil(date: string) {
  const today = new Date();
  const target = parseISO(date);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

export function renewalUrgency(date: string, renewalStatus?: string) {
  const days = daysUntil(date);
  if (days < 0 && renewalStatus !== "Renewed") return "Overdue";
  if (days >= 0 && days <= 7) return "Critical";
  if (days >= 8 && days <= 29) return "Urgent";
  if (days >= 30 && days <= 60) return "Watch";
  return "Safe";
}

export function urgency(date: string) {
  const level = renewalUrgency(date);
  if (level === "Critical") return "urgent";
  if (level === "Urgent") return "soon";
  return "normal";
}

export function isBirthdayToday(dateOfBirth: string | null, today = new Date()) {
  if (!dateOfBirth) return false;
  const [, month, day] = dateOfBirth.split("-");
  const todayMonth = String(today.getMonth() + 1).padStart(2, "0");
  const todayDay = String(today.getDate()).padStart(2, "0");
  return month === todayMonth && day === todayDay;
}

export function normalizeGhanaPhoneNumber(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("233")) {
    const nationalNumber = digits.slice(3).replace(/^0/, "");
    return `+233${nationalNumber}`;
  }

  if (digits.startsWith("0")) return `+233${digits.slice(1)}`;
  if (digits.length === 9) return `+233${digits}`;
  if (trimmed.startsWith("+")) return `+${digits}`;
  return trimmed;
}

export function whatsAppUrl(phoneNumber: string, message: string) {
  const normalized = normalizeGhanaPhoneNumber(phoneNumber).replace(/\D/g, "");
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function renewalWindows(today = new Date()) {
  return {
    week: {
      start: startOfWeek(today, { weekStartsOn: 1 }),
      end: endOfWeek(today, { weekStartsOn: 1 })
    },
    nextWeek: {
      start: startOfWeek(addDays(today, 7), { weekStartsOn: 1 }),
      end: endOfWeek(addDays(today, 7), { weekStartsOn: 1 })
    },
    month: {
      start: startOfMonth(today),
      end: endOfMonth(today)
    }
  };
}

export function policiesForRange(policies: PolicyWithClient[], range: "week" | "next-week" | "month") {
  const windows = renewalWindows();
  const key = range === "next-week" ? "nextWeek" : range;
  return policies.filter((policy) => {
    const expiry = parseISO(policy.expiry_date);
    return isWithinInterval(expiry, windows[key]);
  });
}

export function activePolicies(policies: PolicyWithClient[]) {
  return policies.filter((policy) => policy.status === "Active");
}

export function expiringThisMonth(policies: PolicyWithClient[]) {
  const { month } = renewalWindows();
  return policies.filter((policy) => {
    const expiry = parseISO(policy.expiry_date);
    return isWithinInterval(expiry, month);
  });
}

export function sortByExpiry(a: PolicyWithClient, b: PolicyWithClient) {
  return parseISO(a.expiry_date).getTime() - parseISO(b.expiry_date).getTime();
}

export function isExpired(date: string) {
  return isBefore(parseISO(date), new Date()) && !isAfter(parseISO(date), new Date());
}

export function toCsv<T extends Record<string, unknown>>(rows: T[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}
