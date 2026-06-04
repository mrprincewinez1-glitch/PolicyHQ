"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import posthog from "posthog-js";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import {
  Bell,
  Calculator,
  Cake,
  Clock,
  Download,
  FileText,
  Flag,
  LayoutDashboard,
  LogOut,
  Menu,
  Phone,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
  MessageCircle,
  type LucideIcon
} from "lucide-react";
import {
  deleteClient as deleteClientAction,
  deletePolicy as deletePolicyAction,
  deleteProspect as deleteProspectAction,
  markAllNotificationsRead,
  markCommissionPaid,
  markNotificationRead,
  addActivityNote,
  importClientsFromCsvRows,
  parseLapseShieldPdfStatement,
  saveLapseShieldStatementReview,
  updateLapseShieldCaseStatus,
  upsertProspect,
  updateNotificationSettings,
  updatePolicyRenewalStatus,
  updateProfile,
  uploadProfileAvatar,
  upsertClient,
  upsertPolicy
} from "@/app/(app)/actions";
import { signOut } from "@/app/(auth)/actions";
import { PolicyHqLogo } from "@/components/brand/policyhq-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { findInsuranceCompany, findInsuranceCompanyCategory, insuranceCategoryForPolicyType, insuranceCompanies } from "@/lib/insurance";
import { extractStatementPolicyNumbersFromText, type LapseShieldStatementRow } from "@/lib/lapse-shield";
import { isValidPolicyNumber, normalizePolicyNumber, policyNumberHelpText } from "@/lib/policy-number";
import { createClient } from "@/lib/supabase/client";
import type { ActivityNote, AppData, Client, Commission, InsuranceCategory, LapseShieldCase, LapseShieldCaseStatus, Policy, PolicyStatus, PolicyType, PolicyWithClient, Prospect, ProspectStatus, RenewalStatus } from "@/lib/types";
import {
  activePolicies,
  expiringThisMonth,
  firstName,
  formatCurrency,
  formatDate,
  fullDate,
  greeting,
  isBirthdayToday,
  normalizeGhanaPhoneNumber,
  policiesForRange,
  renewalUrgency,
  sortByExpiry,
  toCsv,
  urgency,
  whatsAppUrl
} from "@/lib/utils";

type Section = "dashboard" | "clients" | "prospects" | "policies" | "commissions" | "notifications" | "profile";
type PolicyPageFilter = "all" | "needs-review";
type ModalState =
  | { type: "demo" }
  | { type: "client"; client?: Client }
  | { type: "prospect"; prospect?: Prospect }
  | { type: "policy"; policy?: PolicyWithClient; prospect?: Prospect }
  | { type: "import" }
  | { type: "confirm"; title: string; body: string; action: () => Promise<void> | void }
  | null;
type PolicySavePayload = Partial<Policy> & {
  commission_rate?: number;
  payment_status?: "Paid" | "Pending";
  new_client?: Partial<Client>;
  source_prospect_id?: string;
};
type ImportClientRow = {
  client_name: string;
  phone_number: string;
  policy_number: string;
  policy_type: PolicyType | "";
  insurer_name: string;
  policy_start_date: string;
  policy_end_date: string;
  vehicle_number?: string;
  property_location?: string;
  premium?: number;
  commission_rate?: number;
  commission_amount?: number;
  commission_status?: "Paid" | "Pending";
  commission_payment_date?: string;
  email?: string;
  date_of_birth?: string;
  notes?: string;
};
type LapseShieldStatementParseResult = {
  rows: LapseShieldStatementRow[];
  errors: string[];
};
type LapseShieldReview = {
  matched: PolicyWithClient[];
  missing: PolicyWithClient[];
  unknown: LapseShieldStatementRow[];
  statementRows: number;
};
type CommissionPaymentFilter = "All" | "Paid" | "Pending";
type CommissionPeriodFilter = "All" | "This Month";
type CommissionDisplayStatus = "Pending" | "Overdue" | "Paid";
type CommissionClassFilter = "All" | InsuranceCategory;
type NavItem = readonly [Section | "admin", LucideIcon, string];
type GlobalSearchResult =
  | { type: "client"; id: string; title: string; subtitle: string; href: string }
  | { type: "prospect"; id: string; title: string; subtitle: string; href: string }
  | { type: "policy"; id: string; title: string; subtitle: string; policy: PolicyWithClient };

const nav = [
  ["dashboard", LayoutDashboard, "Dashboard"],
  ["clients", Users, "Clients"],
  ["prospects", UserPlus, "Prospects"],
  ["policies", ShieldCheck, "Policies"],
  ["commissions", Calculator, "Commissions"],
  ["notifications", Bell, "Renewal Alerts"],
  ["profile", Settings, "Profile"]
] as const;

const policyTypes: PolicyType[] = ["Life", "Health", "Motor", "Property", "Fire", "Marine", "Travel", "Accident"];
const policyStatuses: PolicyStatus[] = ["Active", "Expired", "Cancelled"];
const renewalStatuses: RenewalStatus[] = ["Upcoming", "Contacted", "Quote Requested", "Payment Pending", "Renewed", "Lost"];
const prospectStatuses: ProspectStatus[] = ["New", "Interested", "Call Back", "Converted", "Not Interested"];
const commissionBusinessClasses: InsuranceCategory[] = ["Life", "Non-Life", "Health"];

export function AppShell({
  initialData,
  section = "dashboard",
  demo = false,
  renewalRange,
  dashboardFocus,
  clientId,
  prospectFilter,
  policyFilter,
  commissionFilter
}: {
  initialData: AppData;
  section?: Section;
  demo?: boolean;
  renewalRange?: "week" | "next-week" | "month";
  dashboardFocus?: "birthdays" | "anniversaries" | "life-retention" | "lapse-shield" | "recovered-life";
  clientId?: string;
  prospectFilter?: "today";
  policyFilter?: "needs-review";
  commissionFilter?: "paid-this-month";
}) {
  const [data, setData] = useState(initialData);
  const [active, setActive] = useState<Section>(section);
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [detailPolicy, setDetailPolicy] = useState<PolicyWithClient | null>(null);
  const [clientContactsOpen, setClientContactsOpen] = useState(false);
  const base = demo ? "/demo" : "";

  useEffect(() => {
    if (!demo && initialData.profile.id && initialData.profile.id !== "demo-agent") {
      posthog.identify(initialData.profile.id, {
        email: initialData.profile.email ?? undefined,
        name: initialData.profile.full_name ?? undefined,
        company_name: initialData.profile.company_name ?? undefined,
      });
    }
  }, [demo, initialData.profile.id, initialData.profile.email, initialData.profile.full_name, initialData.profile.company_name]);
  const unread = data.notifications.filter((item) => !item.is_read).length;
  const navItems: NavItem[] = data.profile.role === "admin" && !demo
    ? [...nav, ["admin", ShieldCheck, "Admin"]]
    : [...nav];

  function notify(tone: "success" | "error", message: string) {
    setToast({ tone, message });
    window.setTimeout(() => setToast(null), 3200);
  }

  function blockWrite() {
    if (demo) {
      setModal({ type: "demo" });
      return true;
    }
    return false;
  }

  function payloadToFormData(payload: Record<string, unknown>) {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });
    return formData;
  }

  function downloadCsv(name: string, rows: Record<string, unknown>[]) {
    if (blockWrite()) return;
    const csv = toCsv(rows);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    posthog.capture("data_exported", { export_name: name, row_count: rows.length });
    notify("success", "CSV export downloaded.");
  }

  async function updateRenewal(policyId: string, status: RenewalStatus) {
    if (blockWrite()) return;
    const previous = data.policies;
    setData((current) => ({
      ...current,
      policies: current.policies.map((policy) => policy.id === policyId ? { ...policy, renewal_status: status } : policy)
    }));
    setDetailPolicy((current) => current?.id === policyId ? { ...current, renewal_status: status } : current);
    const result = await updatePolicyRenewalStatus({ policy_id: policyId, renewal_status: status });
    if (!result.ok) {
      setData((current) => ({ ...current, policies: previous }));
      setDetailPolicy((current) => current?.id === policyId ? previous.find((policy) => policy.id === policyId) ?? current : current);
      notify("error", result.message);
      return;
    }
    posthog.capture("renewal_status_updated", { policy_id: policyId, renewal_status: status });
    notify("success", result.message);
  }

  async function saveActivityNote(input: { client_id?: string; policy_id?: string; note_text: string }) {
    if (blockWrite()) return;
    const result = await addActivityNote(input);
    if (!result.ok || !result.note) {
      notify("error", result.message);
      return;
    }
    const note = {
      ...result.note,
      author_name: data.profile.full_name
    };
    setData((current) => ({
      ...current,
      activity_notes: [note, ...current.activity_notes],
      policies: current.policies.map((policy) => policy.id === note.policy_id ? { ...policy, activity_notes: [note, ...(policy.activity_notes ?? [])] } : policy)
    }));
    setDetailPolicy((current) => current?.id === note.policy_id ? { ...current, activity_notes: [note, ...(current.activity_notes ?? [])] } : current);
    notify("success", result.message);
  }

  async function importClients(rows: ImportClientRow[]) {
    if (blockWrite()) return;
    const needsReviewCount = rows.filter((row) => importRowReviewNotes(row).length > 0).length;
    const result = await importClientsFromCsvRows(rows);
    if (!result.ok || !result.clients || !result.policies || !result.commissions) {
      notify("error", result.message);
      return;
    }
    setData((current) => ({
      ...current,
      clients: [...result.clients, ...current.clients],
      policies: [...result.policies, ...current.policies],
      commissions: [...result.commissions, ...current.commissions]
    }));
    setModal(null);
    posthog.capture("clients_imported", { client_count: result.clients.length, policy_count: result.policies.length });
    notify("success", needsReviewCount ? `${result.message} ${needsReviewCount} need review.` : result.message);
  }

  async function saveLapseReview(input: { statement_name: string; statement_kind: string; rows: LapseShieldStatementRow[] }) {
    if (blockWrite()) return null;
    const kind = ["CSV", "Excel", "PDF"].includes(input.statement_kind) ? input.statement_kind as "CSV" | "Excel" | "PDF" : "CSV, Excel, or PDF";
    const result = await saveLapseShieldStatementReview({
      statement_name: input.statement_name,
      statement_kind: kind,
      rows: input.rows
    });
    if (!result.ok) {
      notify("error", result.message);
      return null;
    }
    setData((current) => ({
      ...current,
      lapse_shield_runs: [result.run],
      lapse_shield_cases: result.cases
    }));
    posthog.capture("lapse_shield_statement_reviewed", {
      statement_kind: kind,
      missing_count: result.run.missing_count,
      matched_count: result.run.matched_count,
      statement_rows_count: result.run.statement_rows_count,
    });
    notify("success", result.message);
    return result;
  }

  async function updateLapseCase(caseId: string, status: LapseShieldCaseStatus) {
    if (blockWrite()) return;
    const previous = data.lapse_shield_cases;
    const resolved = status === "Payment confirmed" || status === "Lapsed";
    setData((current) => ({
      ...current,
      lapse_shield_cases: resolved
        ? current.lapse_shield_cases.filter((item) => item.id !== caseId)
        : current.lapse_shield_cases.map((item) => item.id === caseId ? { ...item, status, updated_at: new Date().toISOString() } : item)
    }));
    const result = await updateLapseShieldCaseStatus({ case_id: caseId, status });
    if (!result.ok) {
      setData((current) => ({ ...current, lapse_shield_cases: previous }));
      notify("error", result.message);
      return;
    }
    posthog.capture("lapse_shield_case_updated", { case_id: caseId, status, resolved: resolved });
    notify("success", result.message);
  }

  async function saveClient(payload: Partial<Client>) {
    if (blockWrite()) return;
    if (!payload.full_name?.trim() || !payload.phone_number?.trim()) {
      notify("error", "Full name and phone number are required.");
      return;
    }
    const formData = payloadToFormData({
      id: payload.id,
      full_name: payload.full_name.trim(),
      phone_number: payload.phone_number.trim(),
      email: payload.email?.trim() || "",
      date_of_birth: payload.date_of_birth || "",
      address: payload.address?.trim() || ""
    });
    const result = await upsertClient(null, formData);
    if (!result.ok || !result.client) {
      notify("error", result.message);
      return;
    }
    const saved = result.client;
    setData((current) => ({
      ...current,
      clients: payload.id ? current.clients.map((client) => client.id === saved.id ? saved : client) : [saved, ...current.clients],
      policies: current.policies.map((policy) => policy.client_id === saved.id ? { ...policy, client: saved } : policy)
    }));
    setModal(null);
    posthog.capture("client_saved", { is_new: !payload.id, client_id: saved.id });
    notify("success", "Client saved successfully.");
  }

  async function saveProspect(payload: Partial<Prospect>) {
    if (blockWrite()) return;
    if (!payload.full_name?.trim() || !payload.phone_number?.trim()) {
      notify("error", "Full name and phone number are required.");
      return;
    }

    if (data.profile.id === "demo-agent") {
      const prospect: Prospect = {
        id: payload.id ?? `local-prospect-${Date.now()}`,
        agent_id: data.profile.id,
        full_name: payload.full_name.trim(),
        phone_number: normalizeGhanaPhoneNumber(payload.phone_number),
        status: payload.status ?? "New",
        follow_up_date: payload.follow_up_date || null,
        notes: payload.notes?.trim() || null,
        created_at: payload.id ? data.prospects.find((item) => item.id === payload.id)?.created_at ?? new Date().toISOString() : new Date().toISOString()
      };
      setData((current) => ({
        ...current,
        prospects: payload.id ? current.prospects.map((item) => item.id === prospect.id ? prospect : item) : [prospect, ...current.prospects]
      }));
      setModal(null);
      notify("success", "Prospect saved in local preview.");
      return;
    }

    const formData = payloadToFormData({
      id: payload.id,
      full_name: payload.full_name.trim(),
      phone_number: payload.phone_number.trim(),
      status: payload.status ?? "New",
      follow_up_date: payload.follow_up_date || "",
      notes: payload.notes?.trim() || ""
    });
    const result = await upsertProspect(null, formData);
    if (!result.ok || !result.prospect) {
      notify("error", result.message);
      return;
    }
    const saved = result.prospect;
    setData((current) => ({
      ...current,
      prospects: payload.id ? current.prospects.map((prospect) => prospect.id === saved.id ? saved : prospect) : [saved, ...current.prospects]
    }));
    setModal(null);
    posthog.capture("prospect_saved", { is_new: !payload.id, prospect_id: saved.id, status: saved.status });
    notify("success", result.message);
  }

  async function deleteProspect(prospect: Prospect) {
    if (blockWrite()) return;
    if (data.profile.id === "demo-agent") {
      setData((current) => ({
        ...current,
        prospects: current.prospects.filter((item) => item.id !== prospect.id)
      }));
      setModal(null);
      notify("success", "Prospect deleted in local preview.");
      return;
    }

    const result = await deleteProspectAction(prospect.id);
    if (!result.ok) {
      notify("error", result.message);
      return;
    }
    setData((current) => ({
      ...current,
      prospects: current.prospects.filter((item) => item.id !== prospect.id)
    }));
    setModal(null);
    notify("success", result.message);
  }

  async function deleteClient(client: Client) {
    if (blockWrite()) return;
    const result = await deleteClientAction(client.id);
    if (!result.ok) {
      notify("error", result.message);
      return;
    }
    setData((current) => ({
      ...current,
      clients: current.clients.filter((item) => item.id !== client.id),
      policies: current.policies.filter((policy) => policy.client_id !== client.id),
      commissions: current.commissions.filter((commission) => current.policies.find((policy) => policy.id === commission.policy_id)?.client_id !== client.id)
    }));
    setModal(null);
    notify("success", result.message);
  }

  async function savePolicy(payload: PolicySavePayload) {
    if (blockWrite()) return;
    const isNewClient = !payload.client_id;
    if (isNewClient && (!payload.new_client?.full_name?.trim() || !payload.new_client?.phone_number?.trim())) {
      notify("error", "Client name and phone number are required.");
      return;
    }
    if (!payload.policy_number || !payload.policy_type || !payload.insurance_category || !payload.insurer_name || !payload.start_date || !payload.expiry_date || !payload.premium_amount) {
      notify("error", "Please complete all required policy fields.");
      return;
    }
    const policyNumber = normalizePolicyNumber(payload.policy_number);
    if (!isValidPolicyNumber(policyNumber)) {
      notify("error", policyNumberHelpText);
      return;
    }
    const selectedCompany = findInsuranceCompany(payload.insurer_name);
    if (!selectedCompany || selectedCompany.category !== payload.insurance_category) {
      notify("error", "Choose an insurer from the approved suggestions.");
      return;
    }
    if (payload.policy_type === "Motor" && !payload.vehicle_number?.trim()) {
      notify("error", "Vehicle number is required for motor insurance.");
      return;
    }
    if (payload.policy_type === "Property" && !payload.property_location?.trim()) {
      notify("error", "Property address/location is required for property insurance.");
      return;
    }

    if (data.profile.id === "demo-agent") {
      const existingClient = payload.client_id ? data.clients.find((client) => client.id === payload.client_id) : null;
      const client = existingClient ?? {
        id: `local-client-${Date.now()}`,
        agent_id: data.profile.id,
        full_name: payload.new_client!.full_name!.trim(),
        phone_number: payload.new_client!.phone_number!.trim(),
        email: payload.new_client?.email?.trim() || null,
        date_of_birth: payload.new_client?.date_of_birth || null,
        address: payload.new_client?.address?.trim() || null,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: null
      };
      const commissionRate = Number(payload.commission_rate ?? 10);
      const policyId = payload.id ?? `local-policy-${Date.now()}`;
      const commission: Commission = {
        id: `local-commission-${Date.now()}`,
        policy_id: policyId,
        agent_id: data.profile.id,
        commission_rate: commissionRate,
        commission_amount: Number((Number(payload.premium_amount) * commissionRate / 100).toFixed(2)),
        payment_status: payload.payment_status ?? "Pending",
        payment_date: payload.payment_status === "Paid" ? new Date().toISOString().slice(0, 10) : null,
        created_at: new Date().toISOString()
      };
      const nextPolicy: PolicyWithClient = {
        id: policyId,
        agent_id: data.profile.id,
        client_id: client.id,
        client,
        policy_number: policyNumber,
        policy_type: payload.policy_type,
        insurance_category: payload.insurance_category,
        vehicle_number: payload.policy_type === "Motor" ? payload.vehicle_number?.trim() ?? null : null,
        property_location: payload.policy_type === "Property" ? payload.property_location?.trim() ?? null : null,
        insurer_name: selectedCompany.name,
        start_date: payload.start_date,
        expiry_date: payload.expiry_date,
        premium_amount: Number(payload.premium_amount),
        currency: "GHS",
        status: payload.status ?? "Active",
        renewal_status: payload.renewal_status ?? "Upcoming",
        notes: payload.notes?.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: null,
        commission
      };
      setData((current) => ({
        ...current,
        clients: existingClient ? current.clients : [client, ...current.clients],
        policies: payload.id ? current.policies.map((policy) => policy.id === nextPolicy.id ? nextPolicy : policy) : [nextPolicy, ...current.policies],
        commissions: payload.id ? current.commissions.map((item) => item.policy_id === nextPolicy.id ? commission : item) : [commission, ...current.commissions],
        prospects: payload.source_prospect_id
          ? current.prospects.map((prospect) => prospect.id === payload.source_prospect_id ? { ...prospect, status: "Converted" } : prospect)
          : current.prospects
      }));
      setModal(null);
      notify("success", payload.source_prospect_id ? "Prospect converted in local preview." : "Policy and client saved in local preview.");
      return;
    }

    const formData = payloadToFormData({
      id: payload.id,
      client_id: payload.client_id || "",
      client_full_name: payload.new_client?.full_name?.trim() || "",
      client_phone_number: payload.new_client?.phone_number?.trim() || "",
      client_email: payload.new_client?.email?.trim() || "",
      client_date_of_birth: payload.new_client?.date_of_birth || "",
      client_address: payload.new_client?.address?.trim() || "",
      policy_number: policyNumber,
      policy_type: payload.policy_type,
      insurance_category: payload.insurance_category,
      vehicle_number: payload.policy_type === "Motor" ? payload.vehicle_number?.trim() : "",
      property_location: payload.policy_type === "Property" ? payload.property_location?.trim() : "",
      insurer_name: selectedCompany.name,
      start_date: payload.start_date,
      expiry_date: payload.expiry_date,
      premium_amount: Number(payload.premium_amount),
      status: payload.status ?? "Active",
      renewal_status: payload.renewal_status ?? "Upcoming",
      notes: payload.notes?.trim() || "",
      commission_rate: Number(payload.commission_rate ?? 10),
      payment_status: payload.payment_status ?? "Pending",
      source_prospect_id: payload.source_prospect_id ?? ""
    });
    const result = await upsertPolicy(null, formData);
    if (!result.ok || !result.policy || !result.client || !result.commission) {
      notify("error", result.message);
      return;
    }

    const nextPolicy = result.policy as PolicyWithClient;
    const client = result.client;
    const commission = result.commission;
    const existingCommission = data.commissions.find((item) => item.policy_id === nextPolicy.id);
    setData((current) => ({
      ...current,
      clients: current.clients.some((item) => item.id === client.id) ? current.clients.map((item) => item.id === client.id ? client : item) : [client, ...current.clients],
      policies: payload.id ? current.policies.map((policy) => policy.id === nextPolicy.id ? nextPolicy : policy) : [nextPolicy, ...current.policies],
      commissions: existingCommission
        ? current.commissions.map((item) => item.id === commission.id ? commission : item)
        : [commission, ...current.commissions],
      prospects: payload.source_prospect_id
        ? current.prospects.map((prospect) => prospect.id === payload.source_prospect_id ? { ...prospect, status: "Converted" } : prospect)
        : current.prospects
    }));
    setModal(null);
    posthog.capture("policy_saved", {
      is_new: !payload.id,
      policy_id: nextPolicy.id,
      policy_type: nextPolicy.policy_type,
      insurance_category: nextPolicy.insurance_category,
      insurer_name: nextPolicy.insurer_name,
    });
    notify("success", result.message);
  }

  async function deletePolicy(policy: PolicyWithClient) {
    if (blockWrite()) return;
    const result = await deletePolicyAction(policy.id);
    if (!result.ok) {
      notify("error", result.message);
      return;
    }
    setData((current) => ({
      ...current,
      policies: current.policies.filter((item) => item.id !== policy.id),
      commissions: current.commissions.filter((item) => item.policy_id !== policy.id)
    }));
    setDetailPolicy(null);
    setModal(null);
    notify("success", result.message);
  }

  async function markPaid(commission: Commission) {
    if (blockWrite()) return;
    const result = await markCommissionPaid({ commission_id: commission.id });
    if (!result.ok || !result.commission) {
      notify("error", result.message);
      return;
    }
    const paidCommission = result.commission;
    setData((current) => ({
      ...current,
      commissions: current.commissions.map((item) => item.id === commission.id ? paidCommission : item),
      policies: current.policies.map((policy) => policy.commission?.id === commission.id ? { ...policy, commission: paidCommission } : policy)
    }));
    posthog.capture("commission_marked_paid", {
      commission_id: commission.id,
      commission_amount: commission.commission_amount,
      commission_rate: commission.commission_rate,
    });
    notify("success", result.message);
  }

  async function markAllRead() {
    if (blockWrite()) return;
    const result = await markAllNotificationsRead();
    if (!result.ok) {
      notify("error", result.message);
      return;
    }
    setData((current) => ({ ...current, notifications: current.notifications.map((item) => ({ ...item, is_read: true })) }));
    notify("success", result.message);
  }

  async function markNotification(notificationId: string) {
    if (blockWrite()) return;
    await markNotificationRead({ notification_id: notificationId });
    setData((current) => ({
      ...current,
      notifications: current.notifications.map((item) => item.id === notificationId ? { ...item, is_read: true } : item)
    }));
    const policy = data.policies.find((item) => item.id === data.notifications.find((notification) => notification.id === notificationId)?.policy_id);
    if (policy) setDetailPolicy(policy);
  }

  async function saveProfile(formData: FormData) {
    if (blockWrite()) return;
    const result = await updateProfile(formData);
    if (!result.ok || !result.profile) {
      notify("error", result.message);
      return;
    }
    setData((current) => ({ ...current, profile: { ...result.profile, avatar_url: current.profile.avatar_url } }));
    notify("success", result.message);
  }

  async function saveNotificationSettings(formData: FormData) {
    if (blockWrite()) return;
    const result = await updateNotificationSettings({
      whatsapp_enabled: formData.get("whatsapp_enabled") === "on",
      email_notifications_enabled: formData.get("email_notifications_enabled") === "on",
      birthday_messages_enabled: formData.get("birthday_messages_enabled") === "on",
      agent_whatsapp_summary_enabled: formData.get("agent_whatsapp_summary_enabled") === "on",
      reminder_30_enabled: formData.get("reminder_30_enabled") === "on",
      reminder_14_enabled: formData.get("reminder_14_enabled") === "on",
      reminder_7_enabled: formData.get("reminder_7_enabled") === "on"
    });
    if (!result.ok || !result.profile) {
      notify("error", result.message);
      return;
    }
    setData((current) => ({ ...current, profile: { ...result.profile, avatar_url: current.profile.avatar_url } }));
    notify("success", result.message);
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    if (blockWrite()) return;
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("avatar", file);
    const result = await uploadProfileAvatar(formData);
    if (!result.ok || !result.profile) {
      notify("error", result.message);
      return;
    }
    setData((current) => ({ ...current, profile: result.profile }));
    notify("success", result.message);
  }

  async function changePassword(formData: FormData) {
    if (blockWrite()) return;
    const currentPassword = String(formData.get("current_password") ?? "");
    const next = String(formData.get("new_password") ?? "");
    const confirm = String(formData.get("confirm_password") ?? "");
    if (!currentPassword) {
      notify("error", "Enter your current password first.");
      return;
    }
    if (next.length < 8 || next !== confirm) {
      notify("error", "Use matching passwords of at least 8 characters.");
      return;
    }
    if (!data.profile.email) {
      notify("error", "We could not confirm your email for this password change.");
      return;
    }
    const supabase = createClient();
    const signIn = await supabase.auth.signInWithPassword({ email: data.profile.email, password: currentPassword });
    if (signIn.error) {
      notify("error", "Your current password is incorrect.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) {
      notify("error", "We could not update your password.");
      return;
    }
    notify("success", "Password updated.");
  }

  const filteredClients = useMemo(() => {
    const q = query.toLowerCase();
    return data.clients.filter((client) => [client.full_name, client.phone_number, client.email ?? ""].some((value) => value.toLowerCase().includes(q)));
  }, [data.clients, query]);

  const filteredPolicies = useMemo(() => {
    const q = query.toLowerCase();
    return data.policies.filter((policy) => [policy.client.full_name, policy.policy_number, policy.insurer_name].some((value) => value.toLowerCase().includes(q)));
  }, [data.policies, query]);

  const filteredProspects = useMemo(() => {
    const q = query.toLowerCase();
    return data.prospects.filter((prospect) => [prospect.full_name, prospect.phone_number, prospect.status].some((value) => value.toLowerCase().includes(q)));
  }, [data.prospects, query]);

  const globalSearchResults = useMemo<GlobalSearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const clientResults = data.clients
      .filter((client) => [client.full_name, client.phone_number, client.email ?? ""].some((value) => value.toLowerCase().includes(q)))
      .slice(0, 4)
      .map((client) => ({
        type: "client" as const,
        id: client.id,
        title: client.full_name,
        subtitle: client.phone_number || client.email || "Client record",
        href: `${base}/clients/${client.id}`
      }));

    const policyResults = data.policies
      .filter((policy) => [policy.client.full_name, policy.policy_number, policy.insurer_name, policy.policy_type].some((value) => value.toLowerCase().includes(q)))
      .slice(0, 5)
      .map((policy) => ({
        type: "policy" as const,
        id: policy.id,
        title: policy.policy_number,
        subtitle: `${policy.client.full_name} · ${policy.insurer_name} · ${formatDate(policy.expiry_date)}`,
        policy
      }));

    const prospectResults = data.prospects
      .filter((prospect) => [prospect.full_name, prospect.phone_number, prospect.status].some((value) => value.toLowerCase().includes(q)))
      .slice(0, 3)
      .map((prospect) => ({
        type: "prospect" as const,
        id: prospect.id,
        title: prospect.full_name,
        subtitle: `Prospect · ${prospect.phone_number}`,
        href: `${base}/prospects`
      }));

    return [...clientResults, ...prospectResults, ...policyResults].slice(0, 8);
  }, [base, data.clients, data.policies, data.prospects, query]);

  const totalEarned = commissionTotal(data.commissions, data.policies);
  const totalPaidThisMonth = commissionTotal(data.commissions.filter((item) => item.payment_status === "Paid" && isCurrentMonth(commissionEarnedDate(item))), data.policies);

  const selectedClient = clientId ? data.clients.find((client) => client.id === clientId) : null;
  const todaysBirthdays = useMemo(() => data.clients.filter((client) => isBirthdayToday(client.date_of_birth)), [data.clients]);

  const content = selectedClient ? (
    <ClientDetail
      client={selectedClient}
      policies={data.policies.filter((policy) => policy.client_id === selectedClient.id)}
      base={base}
      openPolicy={setDetailPolicy}
      notes={data.activity_notes.filter((note) => note.client_id === selectedClient.id || policiesForClient(data.policies, selectedClient.id).some((policy) => policy.id === note.policy_id))}
      saveNote={saveActivityNote}
    />
  ) : renewalRange ? (
    <RenewalList
      title={renewalRange === "week" ? "Renewals Expiring This Week" : renewalRange === "next-week" ? "Renewals Expiring Next Week" : "Renewals Expiring This Month"}
      policies={policiesForRange(data.policies, renewalRange)}
      base={base}
      updateRenewal={updateRenewal}
      openPolicy={setDetailPolicy}
      onBack={() => setActive("dashboard")}
    />
  ) : dashboardFocus ? (
    <DashboardFocusView focus={dashboardFocus} data={data} base={base} openPolicy={setDetailPolicy} saveLapseReview={saveLapseReview} updateLapseCase={updateLapseCase} />
  ) : active === "dashboard" ? (
    <Dashboard
      data={data}
      base={base}
      totalPaidThisMonth={totalPaidThisMonth}
      openPolicy={setDetailPolicy}
      todaysBirthdays={todaysBirthdays}
      onAddPolicy={() => blockWrite() || setModal({ type: "policy" })}
      onImportClients={() => blockWrite() || setModal({ type: "import" })}
      onAddProspect={() => blockWrite() || setModal({ type: "prospect" })}
      onOpenClientContacts={() => setClientContactsOpen(true)}
    />
  ) : active === "clients" ? (
    <Clients
      clients={filteredClients}
      policies={data.policies}
      base={base}
      onAdd={() => blockWrite() || setModal({ type: "client" })}
      onImport={() => blockWrite() || setModal({ type: "import" })}
      onEdit={(client) => blockWrite() || setModal({ type: "client", client })}
      onDelete={(client) => blockWrite() || setModal({ type: "confirm", title: "Archive client?", body: `This will hide ${client.full_name} from active records while preserving policy and commission history.`, action: () => deleteClient(client) })}
      onExport={() => downloadCsv("policyhq-clients", clientRows(data.clients, data.policies))}
    />
  ) : active === "prospects" ? (
    <Prospects
      prospects={filteredProspects}
      dueTodayOnly={prospectFilter === "today"}
      onAdd={() => blockWrite() || setModal({ type: "prospect" })}
      onEdit={(prospect) => blockWrite() || setModal({ type: "prospect", prospect })}
      onDelete={(prospect) => blockWrite() || setModal({ type: "confirm", title: "Delete prospect?", body: `This will permanently delete ${prospect.full_name} from your prospects list.`, action: () => deleteProspect(prospect) })}
      onConvert={(prospect) => blockWrite() || setModal({ type: "policy", prospect })}
      onStatusChange={(prospect, status) => saveProspect({ ...prospect, status })}
    />
  ) : active === "policies" ? (
    <Policies
      policies={filteredPolicies}
      clients={data.clients}
      onAdd={() => blockWrite() || setModal({ type: "policy" })}
      onEdit={(policy) => blockWrite() || setModal({ type: "policy", policy })}
      onDelete={(policy) => blockWrite() || setModal({ type: "confirm", title: "Delete policy?", body: `This will permanently delete ${policy.policy_number}.`, action: () => deletePolicy(policy) })}
      onExport={() => downloadCsv("policyhq-policies", policyRows(data.policies))}
      initialFilter={policyFilter}
      updateRenewal={updateRenewal}
      openPolicy={setDetailPolicy}
    />
  ) : active === "commissions" ? (
    <Commissions
      data={data}
      totalEarned={totalEarned}
      totalPaidThisMonth={totalPaidThisMonth}
      base={base}
      initialFilter={commissionFilter}
      markPaid={markPaid}
      openPolicy={setDetailPolicy}
      onExport={(commissions) => downloadCsv("policyhq-commissions", commissionRows(commissions, data.policies))}
      onWriteAttempt={blockWrite}
    />
  ) : active === "notifications" ? (
    <Notifications data={data} base={base} markAllRead={markAllRead} onClick={markNotification} onBack={() => setActive("dashboard")} />
  ) : (
    <Profile
      data={data}
      saveProfile={saveProfile}
      saveNotificationSettings={saveNotificationSettings}
      uploadAvatar={uploadAvatar}
      changePassword={changePassword}
    />
  );
  const topbarTitle = selectedClient
    ? "Client Details"
    : renewalRange
      ? "Renewal Alerts"
      : active === "dashboard"
        ? ""
        : active === "prospects"
          ? "Prospects Pipeline"
          : active === "notifications"
            ? "Renewal Alerts"
            : active === "profile"
              ? "Profile & Settings"
              : nav.find(([key]) => key === active)?.[2] ?? "PolicyHQ";

  return (
    <div>
      {demo ? (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 bg-primary px-3 py-2 text-xs font-semibold leading-5 text-white sm:px-4 sm:py-3 sm:text-sm">
          <span><span className="sm:hidden">Live demo. Fictional data only.</span><span className="hidden sm:inline">🔍 You are viewing a live demo. All data shown is fictional. Sign up free to manage your real policies.</span></span>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild size="sm" variant="outline" className="border-white/40 bg-transparent px-3 text-white hover:bg-white hover:text-primary"><Link href="/sign-in">Sign In</Link></Button>
            <Button asChild size="sm" className="whitespace-nowrap px-3"><Link href="/sign-up">Sign Up Free</Link></Button>
          </div>
        </div>
      ) : null}
      <div className={demo ? "pt-14" : ""}>
        <aside className={`fixed bottom-0 top-0 z-40 w-72 bg-primary text-white transition lg:left-0 ${demo ? "top-14" : ""} ${mobileOpen ? "left-0" : "-left-80"}`}>
          <div className="flex h-20 items-center border-b border-white/10 px-5">
            <Link
              href={navHref(base, "dashboard")}
              aria-label="Go to dashboard"
              onClick={() => {
                setActive("dashboard");
                setMobileOpen(false);
              }}
              className="rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <PolicyHqLogo variant="dark" className="h-12 w-auto max-w-[220px]" />
            </Link>
          </div>
          <nav className="space-y-1 p-3">
            {navItems.map(([key, Icon, label]) => (
              <Link
                key={key}
                href={key === "admin" ? "/admin" : navHref(base, key)}
                onClick={() => {
                  if (key !== "admin") setActive(key);
                  setMobileOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl border-l-4 px-4 py-3 text-left text-sm font-semibold transition ${active === key && !renewalRange ? "border-accent bg-white text-primary" : "border-transparent text-white hover:border-accent hover:bg-white hover:text-primary"}`}
              >
                <Icon className="h-5 w-5" /> {label}
              </Link>
            ))}
          </nav>
          </aside>
        <main className="min-h-screen lg:pl-72">
          <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-8">
            <button className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu /></button>
            <Link
              href={navHref(base, "dashboard")}
              aria-label="Go to dashboard"
              onClick={() => setActive("dashboard")}
              className="ml-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent lg:hidden"
            >
              <PolicyHqLogo className="h-9 w-auto max-w-[132px]" />
            </Link>
            <div className="relative hidden w-[360px] shrink-0 lg:block">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-10 w-full outline-none"
                  placeholder="Search clients, policies, or insurers"
                />
                {query ? (
                  <button type="button" onClick={() => setQuery("")} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Clear search">
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              {query.trim().length >= 2 ? (
                <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft">
                  {globalSearchResults.length ? (
                    <div className="max-h-96 overflow-auto p-2">
                      {globalSearchResults.map((result) => result.type === "client" || result.type === "prospect" ? (
                        <Link
                          key={`${result.type}-${result.id}`}
                          href={result.href}
                          onClick={() => {
                            setActive(result.type === "client" ? "clients" : "prospects");
                            setQuery("");
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                        >
                          <span>
                            <span className="block text-sm font-bold text-primary">{result.title}</span>
                            <span className="block text-xs text-slate-500">{result.subtitle}</span>
                          </span>
                          <Badge tone="orange">{result.type === "client" ? "Client" : "Prospect"}</Badge>
                        </Link>
                      ) : (
                        <button
                          key={`policy-${result.id}`}
                          type="button"
                          onClick={() => {
                            setDetailPolicy(result.policy);
                            setQuery("");
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                        >
                          <span>
                            <span className="block font-mono text-sm font-bold text-primary">{result.title}</span>
                            <span className="block text-xs text-slate-500">{result.subtitle}</span>
                          </span>
                          <Badge>Policy</Badge>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-5 text-sm font-semibold text-slate-500">No clients or policies match that search.</div>
                  )}
                </div>
              ) : null}
            </div>
            {topbarTitle ? (
              <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 text-sm font-extrabold text-primary lg:block">
                {topbarTitle}
              </div>
            ) : null}
            <div className="ml-auto flex items-center gap-2 sm:gap-4">
              <Link
                href={navHref(base, "notifications")}
                onClick={() => setActive("notifications")}
                title="Renewal Alerts"
                className="relative inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-primary hover:bg-slate-100"
                aria-label="Renewal Alerts"
              >
                <Bell className="h-5 w-5" />
                <span className="hidden sm:inline">Renewal Alerts</span>
                {unread ? <span className="absolute -right-1 -top-1 rounded-full bg-danger px-1.5 text-xs font-bold text-white">{unread}</span> : null}
              </Link>
              <button onClick={() => setActive("profile")} className="hidden items-center gap-3 sm:flex">
                <Avatar profile={data.profile} />
                <strong className="text-sm">{data.profile.full_name}</strong>
              </button>
              {demo ? (
                <div className="flex items-center gap-2">
                  <Button asChild size="sm" variant="outline" className="whitespace-nowrap px-3"><Link href="/sign-in">Sign In</Link></Button>
                  <Button asChild size="sm" className="whitespace-nowrap px-3"><Link href="/sign-up"><span className="sm:hidden">Sign Up</span><span className="hidden sm:inline">Sign Up Free</span></Link></Button>
                </div>
              ) : <form action={signOut}><Button variant="ghost" size="sm"><LogOut className="h-4 w-4" /> Sign Out</Button></form>}
            </div>
          </header>
          <div className="p-4 lg:p-10">{content}</div>
        </main>
      </div>

      {mobileOpen ? <button aria-label="Close menu" className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)}><X className="ml-auto mr-5 mt-5 text-white" /></button> : null}
      {modal?.type === "demo" ? <DemoModal onClose={() => setModal(null)} /> : null}
      {modal?.type === "client" ? <ClientModal client={modal.client} onClose={() => setModal(null)} onSave={saveClient} /> : null}
      {modal?.type === "prospect" ? <ProspectModal prospect={modal.prospect} onClose={() => setModal(null)} onSave={saveProspect} onDelete={(prospect) => setModal({ type: "confirm", title: "Delete prospect?", body: `This will permanently delete ${prospect.full_name} from your prospects list.`, action: () => deleteProspect(prospect) })} /> : null}
      {modal?.type === "policy" ? <PolicyModal policy={modal.policy} prospect={modal.prospect} clients={data.clients} onClose={() => setModal(null)} onSave={savePolicy} /> : null}
      {modal?.type === "import" ? <ImportClientsModal onClose={() => setModal(null)} onImport={importClients} /> : null}
      {modal?.type === "confirm" ? <ConfirmModal title={modal.title} body={modal.body} onClose={() => setModal(null)} onConfirm={modal.action} /> : null}
      {clientContactsOpen ? <ClientsToContactDrawer policies={clientContactPolicies(data.policies)} onClose={() => setClientContactsOpen(false)} openPolicy={setDetailPolicy} /> : null}
      {detailPolicy ? <PolicyDetailPanel policy={detailPolicy} onClose={() => setDetailPolicy(null)} updateRenewal={updateRenewal} saveNote={saveActivityNote} /> : null}
      {toast ? <div className={`fixed bottom-5 right-5 z-[70] rounded-xl px-4 py-3 text-sm font-bold text-white shadow-soft ${toast.tone === "success" ? "bg-success" : "bg-danger"}`}>{toast.message}</div> : null}
    </div>
  );
}

function Dashboard({
  data,
  base,
  totalPaidThisMonth,
  openPolicy,
  todaysBirthdays,
  onAddPolicy,
  onImportClients,
  onAddProspect,
  onOpenClientContacts
}: {
  data: AppData;
  base: string;
  totalPaidThisMonth: number;
  openPolicy: (policy: PolicyWithClient) => void;
  todaysBirthdays: Client[];
  onAddPolicy: () => void;
  onImportClients: () => void;
  onAddProspect: () => void;
  onOpenClientContacts: () => void;
}) {
  const active = activePolicies(data.policies);
  const premiumDueThisMonth = expiringThisMonth(data.policies).reduce((sum, policy) => sum + policy.premium_amount, 0);
  const followUpsDueToday = data.prospects.filter(isProspectDueToday).length;
  const dashboardMix = dashboardBusinessMix(data);
  const revenueMetrics = dashboardRevenueMetrics(data.policies, data.lapse_shield_cases, dashboardMix, base);
  const relationshipMetrics = dashboardRelationshipMetrics(data.policies, dashboardMix, todaysBirthdays.length, followUpsDueToday, base);
  const activities = dashboardActivities(data, todaysBirthdays, base, openPolicy);
  const needsReviewCount = data.policies.filter(needsPolicyReview).length;

  if (dashboardMix === "empty") {
    return <NoDataDashboard base={base} profileName={data.profile.full_name} onAddPolicy={onAddPolicy} onImportClients={onImportClients} onAddProspect={onAddProspect} />;
  }

  return (
    <div className="max-w-[1062px] space-y-[26px]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[30px] font-extrabold leading-[35px] tracking-[-0.04em] text-primary">{greeting(firstName(data.profile.full_name))}</h1>
          <p className="mt-2 text-[13px] font-semibold leading-5 text-slate-500">{fullDate()}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={onAddPolicy} className="min-h-11 rounded-[10px] text-[10px] font-extrabold">
            <Plus className="h-4 w-4" />
            Add Policy
          </Button>
          <Button onClick={onImportClients} variant="outline" className="min-h-11 rounded-[10px] text-[10px] font-extrabold">
            <Upload className="h-4 w-4" />
            Import Clients
          </Button>
        </div>
      </div>
      <div className="grid gap-[13px] md:grid-cols-2 xl:grid-cols-[136px_136px_168px_168px_168px]">
        <DashboardStatLink label="Total Clients" value={data.clients.length} href={navHref(base, "clients")} />
        <DashboardStatLink label="Active Policies" value={active.length} href={navHref(base, "policies")} />
        <DashboardStatLink label="Commissions" value={formatDashboardCurrency(totalPaidThisMonth)} href={`${navHref(base, "commissions")}?filter=paid-this-month`} wide />
        <DashboardStatLink label="Premium Due" value={formatDashboardCurrency(premiumDueThisMonth)} href={`${base}/renewals/month`} wide />
        <ProspectsDashboardCard total={data.prospects.length} dueToday={followUpsDueToday} href={navHref(base, "prospects")} />
      </div>
      {needsReviewCount ? <NeedsReviewPrompt count={needsReviewCount} href={`${navHref(base, "policies")}?filter=needs-review`} /> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueProtectionPanel mix={dashboardMix} metrics={revenueMetrics} base={base} />
        <RelationshipManagerPanel metrics={relationshipMetrics} birthdays={todaysBirthdays} base={base} onOpenClientContacts={onOpenClientContacts} />
      </div>
      <RecentActivityPanel activities={activities} />
    </div>
  );
}

type DashboardBusinessMix = "empty" | "life" | "non-life" | "mixed";
type DashboardActivity = {
  id: string;
  title: string;
  body: string;
  badge: string;
  tone: "neutral" | "success" | "warning" | "danger" | "accent";
  createdAt: string;
  href?: string;
  onClick?: () => void;
};
type DashboardPanelMetric = {
  label: string;
  value: number;
  href: string;
  tone?: "primary" | "accent" | "success" | "warning" | "danger";
  helper?: string;
};

function NoDataDashboard({ base, profileName, onAddPolicy, onImportClients, onAddProspect }: { base: string; profileName: string; onAddPolicy: () => void; onImportClients: () => void; onAddProspect: () => void }) {
  const name = firstName(profileName);
  return (
    <div className="max-w-[1062px] space-y-[26px]">
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="min-h-[292px] overflow-hidden">
          <CardHeader className="border-b-0 p-7 pb-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-accent">First setup</p>
            <h1 className="mt-3 text-[30px] font-extrabold leading-[35px] tracking-[-0.04em] text-primary">{name ? `Welcome, ${name}` : "Welcome to PolicyHQ"}</h1>
            <p className="mt-3 max-w-xl text-[13px] font-semibold leading-6 text-slate-500">Bring in your policy book first. PolicyHQ will turn it into renewals, commissions, and daily contact actions.</p>
          </CardHeader>
          <CardContent className="p-7 pt-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={onImportClients} className="min-h-[112px] rounded-[14px] border border-accent bg-accent p-5 text-left text-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent">
                <Upload className="h-5 w-5" />
                <strong className="mt-4 block text-lg font-extrabold tracking-[-0.04em]">Import Clients</strong>
                <span className="mt-2 block text-xs font-bold leading-5 text-white/85">Best for agents with an existing Excel or CSV list.</span>
              </button>
              <button type="button" onClick={onAddPolicy} className="min-h-[112px] rounded-[14px] border border-slate-200 bg-white p-5 text-left transition hover:border-accent hover:bg-accent/5 focus:outline-none focus:ring-2 focus:ring-accent">
                <Plus className="h-5 w-5 text-accent" />
                <strong className="mt-4 block text-lg font-extrabold tracking-[-0.04em] text-primary">Add Policy</strong>
                <span className="mt-2 block text-xs font-bold leading-5 text-slate-500">Best for adding one new customer at a time.</span>
              </button>
            </div>
            <button type="button" onClick={onAddProspect} className="mt-3 flex min-h-[58px] w-full items-center justify-between gap-4 rounded-[13px] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-accent hover:bg-accent/5 focus:outline-none focus:ring-2 focus:ring-accent">
              <span className="min-w-0">
                <strong className="block text-sm font-extrabold text-primary">Add Prospect</strong>
                <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-500">Track a lead before they buy a policy.</span>
              </span>
              <span className="inline-flex min-h-9 shrink-0 items-center rounded-[10px] bg-primary px-3 text-[10px] font-extrabold text-white">Add Prospect</span>
            </button>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <SetupStep number="1" title="Add book" body="Import a list or add the first policy." />
              <SetupStep number="2" title="Review gaps" body="Fix any Needs Review records." />
              <SetupStep number="3" title="Work daily" body="Use renewals, follow-ups, and commissions." />
            </div>
          </CardContent>
        </Card>
        <Card className="min-h-[292px]">
          <CardHeader className="border-b-0 p-7 pb-0">
            <h2 className="text-[22px] font-extrabold leading-[26px] tracking-[-0.04em] text-primary">What activates next</h2>
            <p className="mt-3 text-[13px] font-semibold leading-6 text-slate-500">These areas wake up as soon as your first policy records exist.</p>
          </CardHeader>
          <CardContent className="space-y-[13px] p-7 pt-6">
            <DashboardChecklistItem title="Revenue protection" body="Expiring policies and premium due windows." />
            <DashboardChecklistItem title="Relationship manager" body="Birthdays, prospects, and clients to contact." />
            <DashboardChecklistItem title="Commission tracking" body="Paid, pending, and month totals." />
            <Button asChild variant="outline" className="mt-1 min-w-[118px] rounded-[10px] text-[10px] font-extrabold">
              <Link href={navHref(base, "prospects")}>View Prospects</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardEmptyPillar title="Revenue Protection" body="Activates after the first policy" helper="PolicyHQ will sort renewals into this week, next week, and this month." href={navHref(base, "policies")} />
        <DashboardEmptyPillar title="Relationship Manager" body="Activates after client activity" helper="Birthdays, prospect follow-ups, and clients to contact will appear here." href={navHref(base, "clients")} />
      </div>
    </div>
  );
}

function SetupStep({ number, title, body, href, onClick }: { number: string; title: string; body: string; href?: string; onClick?: () => void }) {
  const content = (
    <>
      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-accent/10 px-2 text-[11px] font-extrabold text-accent">{number}</span>
      <strong className="mt-3.5 block text-sm font-extrabold text-primary">{title}</strong>
      <span className="mt-2 block text-[10px] font-bold leading-[1.45] text-slate-500">{body}</span>
    </>
  );

  const className = "min-h-[92px] rounded-xl border border-slate-200 bg-white p-[16px] text-left transition hover:border-accent hover:bg-accent/5 focus:outline-none focus:ring-2 focus:ring-accent";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  if (!href) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

function DashboardChecklistItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3.5">
      <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-slate-200 bg-white" />
      <div>
        <p className="text-xs font-extrabold text-primary">{title}</p>
        <p className="mt-1 text-[10px] font-bold leading-[1.45] text-slate-500">{body}</p>
      </div>
    </div>
  );
}

function DashboardEmptyPillar({ title, body, helper, href }: { title: string; body: string; helper: string; href: string }) {
  return (
    <Card className="min-h-[148px]">
      <CardContent className="flex h-full min-h-[148px] flex-col justify-center p-[23px]">
        <h2 className="text-[22px] font-extrabold leading-[26px] tracking-[-0.04em] text-primary">{title}</h2>
        <p className="mt-2 text-[11px] font-bold leading-[1.5] text-slate-500">{body}</p>
        <DashboardActionRow title="Get started" body={helper} badge="Empty" tone="neutral" href={href} />
      </CardContent>
    </Card>
  );
}

function NeedsReviewPrompt({ count, href }: { count: number; href: string }) {
  return (
    <Link href={href} className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-accent">
      <div className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 transition hover:border-accent hover:bg-accent/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-primary">{count} polic{count === 1 ? "y" : "ies"} need review</p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-600">Imported records with missing details are waiting in Policies.</p>
        </div>
        <span className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-[10px] bg-accent px-4 text-[10px] font-extrabold text-white">Review Policies</span>
      </div>
    </Link>
  );
}

function DashboardStatLink({ label, value, href, wide = false }: { label: string; value: string | number; href: string; wide?: boolean }) {
  return (
    <Link href={href} className="rounded-xl focus:outline-none focus:ring-2 focus:ring-accent">
      <Card className={`min-h-[88px] transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md ${wide ? "xl:w-[168px]" : "xl:w-[136px]"}`}>
        <CardContent className="p-[15px]">
          <p className="text-[10px] font-extrabold leading-[14px] text-slate-500">{label}</p>
          <strong className="mt-3 block text-[20px] font-extrabold leading-7 tracking-[-0.04em] text-primary sm:text-[22px]">{value}</strong>
        </CardContent>
      </Card>
    </Link>
  );
}

function RevenueProtectionPanel({ mix, metrics, base }: { mix: DashboardBusinessMix; metrics: DashboardPanelMetric[]; base: string }) {
  const copy = mix === "life" ? "Life retention" : mix === "mixed" ? "Renewals and retention" : "Renewals";
  const href = mix === "life" ? navHref(base, "policies") : `${base}/renewals/week`;
  const cta = mix === "life" ? "Review Book" : "View Queue";

  return (
    <Card className="min-h-[250px] overflow-hidden">
      <CardHeader className="border-b-0 p-[23px] pb-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-[22px] font-extrabold leading-[26px] tracking-[-0.04em] text-primary">Revenue Protection</h2>
            <p className="mt-2 text-[11px] font-bold leading-[1.5] text-slate-500">{copy}</p>
          </div>
          <Button asChild className="min-w-[118px] shrink-0 rounded-[10px] text-[10px] font-extrabold">
            <Link href={href}>{cta}</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-[23px] pt-[22px]">
        <div className="grid gap-3 sm:grid-cols-3">
          {metrics.map((item) => <DashboardPanelMetricCard key={item.label} metric={item} />)}
        </div>
        <DashboardActionRow {...dashboardRevenueAction(mix, metrics, base)} />
      </CardContent>
    </Card>
  );
}

function RelationshipManagerPanel({ metrics, birthdays, base, onOpenClientContacts }: { metrics: DashboardPanelMetric[]; birthdays: Client[]; base: string; onOpenClientContacts: () => void }) {
  const action = dashboardRelationshipAction(metrics, base);
  return (
    <Card className="min-h-[250px] overflow-hidden">
      <CardHeader className="border-b-0 p-[23px] pb-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-[22px] font-extrabold leading-[26px] tracking-[-0.04em] text-primary">Relationship Manager</h2>
            <p className="mt-2 text-[11px] font-bold leading-[1.5] text-slate-500">Client touchpoints</p>
          </div>
          <Button asChild className="min-w-[118px] shrink-0 rounded-[10px] text-[10px] font-extrabold">
            <Link href={`${navHref(base, "prospects")}?filter=today`}>Open Tasks</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-[23px] pt-[22px]">
        <div className="grid gap-3 sm:grid-cols-3">
          {metrics.map((item) => (
            <DashboardPanelMetricCard
              key={item.label}
              metric={item}
              onClick={item.label === "Clients to Contact" ? onOpenClientContacts : undefined}
            />
          ))}
        </div>
        {birthdays.length ? (
          <DashboardBirthdayAction client={birthdays[0]} href={`${base}/birthdays`} />
        ) : <DashboardActionRow {...action} onClick={action.title === "Clients to contact" ? onOpenClientContacts : undefined} />}
      </CardContent>
    </Card>
  );
}

function DashboardPanelMetricCard({ metric, onClick }: { metric: DashboardPanelMetric; onClick?: () => void }) {
  const color = metric.tone === "danger" ? "text-danger" : metric.tone === "warning" ? "text-warning" : metric.tone === "success" ? "text-success" : metric.tone === "accent" ? "text-accent" : "text-primary";
  const content = (
    <>
      <p className="text-[10px] font-extrabold leading-[14px] text-slate-500">{metric.label}</p>
      <strong className={`mt-2 block text-[26px] font-extrabold leading-none tracking-[-0.04em] ${color}`}>{metric.value}</strong>
      {metric.helper ? <p className="mt-1 truncate text-[10px] font-bold text-slate-400">{metric.helper}</p> : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="min-h-[76px] rounded-[10px] border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-accent hover:bg-accent/5 focus:outline-none focus:ring-2 focus:ring-accent">
        {content}
      </button>
    );
  }

  return (
    <Link href={metric.href} className="min-h-[76px] rounded-[10px] border border-slate-200 bg-slate-50 p-3 transition hover:border-accent hover:bg-accent/5 focus:outline-none focus:ring-2 focus:ring-accent">
      {content}
    </Link>
  );
}

function DashboardActionRow({ title, body, badge, tone, href, onClick }: { title: string; body: string; badge: string; tone: "neutral" | "danger" | "warning" | "success"; href: string; onClick?: () => void }) {
  const background = tone === "danger" ? "bg-danger/10" : tone === "warning" ? "bg-warning/10" : tone === "success" ? "bg-success/10" : "bg-slate-50";
  const badgeColor = tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : tone === "success" ? "bg-success" : "bg-primary";
  const content = (
    <>
      <div className="min-w-0">
        <strong className="block truncate text-[13px] font-extrabold text-primary">{title}</strong>
        <span className="mt-1 block text-[10px] font-bold leading-[1.35] text-slate-500">{body}</span>
      </div>
      <span className={`min-w-[68px] shrink-0 rounded-full px-2.5 py-2 text-center text-[9px] font-extrabold text-white ${badgeColor}`}>{badge}</span>
    </>
  );
  const className = `mt-[17px] flex min-h-[58px] items-center justify-between gap-4 rounded-[10px] border border-slate-200 px-3.5 py-[13px] transition hover:border-accent hover:bg-accent/5 focus:outline-none focus:ring-2 focus:ring-accent ${background}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} w-full text-left`}>
        {content}
      </button>
    );
  }
  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

function DashboardBirthdayAction({ client, href }: { client: Client; href: string }) {
  return (
    <div className="relative mt-[17px] flex min-h-[58px] items-center justify-between gap-4 rounded-[10px] border border-slate-200 bg-warning/10 px-3.5 py-[13px] transition hover:border-accent">
      <Link href={href} aria-label={`View birthday clients including ${client.full_name}`} className="absolute inset-0 rounded-[10px] focus:outline-none focus:ring-2 focus:ring-accent" />
      <div className="relative z-10 min-w-0 pointer-events-none">
        <strong className="block truncate text-[13px] font-extrabold text-primary">{client.full_name}</strong>
        <span className="mt-1 block truncate text-[10px] font-bold leading-[1.35] text-slate-500">Birthday today · {client.phone_number}</span>
      </div>
      <WhatsAppButton href={birthdayWhatsAppHref(client)} label="WhatsApp" className="relative z-10 shrink-0 rounded-[10px] text-[10px] font-extrabold" />
    </div>
  );
}

function ClientsToContactDrawer({ policies, onClose, openPolicy }: { policies: PolicyWithClient[]; onClose: () => void; openPolicy: (policy: PolicyWithClient) => void }) {
  const paymentPending = policies.filter((policy) => policy.renewal_status === "Payment Pending").length;
  const expiringThisMonthCount = policies.filter((policy) => policiesForRange([policy], "month").length > 0).length;

  function openPolicyAndClose(policy: PolicyWithClient) {
    onClose();
    openPolicy(policy);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-primary/40 p-0 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="clients-to-contact-title">
      <div className="flex h-full items-end justify-stretch sm:items-center sm:justify-end">
        <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[22px] border border-slate-200 bg-white shadow-soft sm:max-h-[calc(100vh-40px)] sm:max-w-[500px] sm:rounded-[18px]">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-5">
            <div className="min-w-0">
              <h2 id="clients-to-contact-title" className="text-xl font-extrabold tracking-[-0.04em] text-primary">Clients to Contact</h2>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                {policies.length} client{policies.length === 1 ? "" : "s"} · {paymentPending} payment pending · {expiringThisMonthCount} expiring this month
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close clients to contact">
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {policies.length ? (
              <div className="space-y-3">
                {policies.map((policy) => (
                  <ClientContactRow key={`${policy.client_id}-${policy.id}`} policy={policy} openPolicy={openPolicyAndClose} />
                ))}
              </div>
            ) : (
              <EmptyInlineState title="No clients to contact." body="Clients appear here when they have renewal conversations in progress or policies expiring this month." />
            )}
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-500 sm:px-5">
            Update the renewal status from the policy detail once the conversation is complete.
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientContactRow({ policy, openPolicy }: { policy: PolicyWithClient; openPolicy: (policy: PolicyWithClient) => void }) {
  const reason = clientContactReason(policy);
  return (
    <article className="rounded-[14px] border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-extrabold tracking-[-0.03em] text-primary">{policy.client.full_name}</h3>
            <Badge tone={reason.tone}>{reason.label}</Badge>
          </div>
          <a href={`tel:${normalizeGhanaPhoneNumber(policy.client.phone_number)}`} className="mt-1 block text-sm font-bold text-slate-500">{policy.client.phone_number}</a>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{policy.policy_type} · {formatDate(policy.expiry_date)}</p>
          <p className="mt-2 rounded-[10px] bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-600">{reason.body}</p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-[168px]">
          <Button asChild variant="outline" size="sm" className="min-h-10 rounded-[10px]">
            <a href={`tel:${normalizeGhanaPhoneNumber(policy.client.phone_number)}`}>
              <Phone className="h-4 w-4" />
              Call
            </a>
          </Button>
          <WhatsAppButton href={renewalWhatsAppHref(policy)} label="WhatsApp" className="min-h-10 justify-center rounded-[10px] text-[11px]" />
          <Button type="button" size="sm" className="col-span-2 min-h-10 rounded-[10px]" onClick={() => openPolicy(policy)}>View Policy</Button>
        </div>
      </div>
    </article>
  );
}

function RecentActivityPanel({ activities }: { activities: DashboardActivity[] }) {
  return (
    <Card className="min-h-28">
      <CardContent className="p-[23px]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[22px] font-extrabold leading-[26px] tracking-[-0.04em] text-primary">Recent Activity</h2>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">Live work feed</span>
        </div>
        {activities.length ? (
          <div className="mt-[18px] divide-y divide-slate-100">
            {activities.map((activity) => <RecentActivityItem key={activity.id} activity={activity} />)}
          </div>
        ) : (
          <p className="mt-[18px] text-xs font-bold text-slate-500">No recent activity yet. Add a policy or import clients to start building the feed.</p>
        )}
      </CardContent>
    </Card>
  );
}

function RecentActivityItem({ activity }: { activity: DashboardActivity }) {
  const badgeTone = activity.tone === "success" ? "green" : activity.tone === "danger" ? "red" : activity.tone === "warning" ? "amber" : activity.tone === "accent" ? "orange" : "slate";
  const row = (
    <>
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-500">
          <Clock className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <strong className="block truncate text-xs font-extrabold text-primary">{activity.title}</strong>
          <span className="mt-1 block truncate text-[10px] font-bold leading-[1.35] text-slate-500">{activity.body}</span>
        </div>
      </div>
      <Badge tone={badgeTone}>{activity.badge}</Badge>
    </>
  );

  if (activity.href) {
    return (
      <Link href={activity.href} className="flex min-h-[58px] items-center justify-between gap-4 py-3 transition hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent">
        {row}
      </Link>
    );
  }

  if (activity.onClick) {
    return (
      <button type="button" onClick={activity.onClick} className="flex min-h-[58px] w-full items-center justify-between gap-4 py-3 text-left transition hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent">
        {row}
      </button>
    );
  }

  return <div className="flex min-h-[58px] items-center justify-between gap-4 py-3">{row}</div>;
}

function DashboardFocusView({
  focus,
  data,
  base,
  openPolicy,
  saveLapseReview,
  updateLapseCase
}: {
  focus: "birthdays" | "anniversaries" | "life-retention" | "lapse-shield" | "recovered-life";
  data: AppData;
  base: string;
  openPolicy: (policy: PolicyWithClient) => void;
  saveLapseReview: (input: { statement_name: string; statement_kind: string; rows: LapseShieldStatementRow[] }) => Promise<{ ok: true } | null>;
  updateLapseCase: (caseId: string, status: LapseShieldCaseStatus) => void;
}) {
  const birthdays = data.clients.filter((client) => isBirthdayToday(client.date_of_birth));
  const anniversaries = data.policies.filter((policy) => isLifePolicy(policy) && isPolicyAnniversarySoon(policy));
  const lifeRetention = data.policies.filter(isLifeRetentionWatch);
  const recoveredLife = data.policies.filter((policy) => isLifePolicy(policy) && policy.renewal_status === "Renewed");
  const config = dashboardFocusConfig(focus, birthdays.length, anniversaries.length, lifeRetention.length, recoveredLife.length, data.lapse_shield_cases.length, base);
  const policies = focus === "anniversaries" ? anniversaries : focus === "life-retention" ? lifeRetention : focus === "recovered-life" ? recoveredLife : [];

  return (
    <div className="max-w-[1062px] space-y-6">
      <Button asChild variant="outline"><Link href={navHref(base, "dashboard")}>Back to Dashboard</Link></Button>
      <div>
        <h1 className="text-[30px] font-extrabold leading-[35px] tracking-[-0.04em] text-primary">{config.title}</h1>
        <p className="mt-2 text-[13px] font-semibold leading-5 text-slate-500">{config.description}</p>
      </div>
      <div className="grid gap-[13px] md:grid-cols-3">
        {config.metrics.map((metric) => <DashboardPanelMetricCard key={metric.label} metric={metric} />)}
      </div>
      {focus === "birthdays" ? (
        <DashboardBirthdayList clients={birthdays} />
      ) : focus === "lapse-shield" ? (
        <DashboardLapseShieldPreview data={data} lifePolicies={data.policies.filter(isLifePolicy)} base={base} openPolicy={openPolicy} saveLapseReview={saveLapseReview} updateLapseCase={updateLapseCase} />
      ) : (
        <DashboardPolicyFocusList policies={policies} openPolicy={openPolicy} emptyTitle={config.emptyTitle} />
      )}
    </div>
  );
}

function DashboardBirthdayList({ clients }: { clients: Client[] }) {
  if (!clients.length) return <EmptyFocusState title="No birthdays today." body="Clients with birthdays today will appear here with a WhatsApp action." />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {clients.map((client) => (
        <Card key={client.id}>
          <CardContent className="flex items-center justify-between gap-4 p-[23px]">
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold text-primary">{client.full_name}</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-500">{client.phone_number}</p>
            </div>
            <WhatsAppButton href={birthdayWhatsAppHref(client)} label="WhatsApp" className="shrink-0 rounded-[10px] text-[10px] font-extrabold" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DashboardPolicyFocusList({ policies, openPolicy, emptyTitle }: { policies: PolicyWithClient[]; openPolicy: (policy: PolicyWithClient) => void; emptyTitle: string }) {
  if (!policies.length) return <EmptyFocusState title={emptyTitle} body="When matching policies exist, they will appear here as an action list." />;
  return (
    <Card>
      <div className="space-y-3 p-4 md:hidden">
        {policies.map((policy) => (
          <button key={policy.id} type="button" onClick={() => openPolicy(policy)} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold text-primary">{policy.client.full_name}</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-500">{policy.policy_number}</p>
              </div>
              <UrgencyBadge date={policy.expiry_date} status={policy.renewal_status} />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-600">{policy.policy_type} · {shortInsurerName(policy.insurer_name)}</p>
          </button>
        ))}
      </div>
      <div className="hidden overflow-auto md:block">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="sticky top-0 bg-slate-50"><tr>{["Client", "Policy No.", "Class", "Insurer", "Start Date", "Expiry", "Status"].map((heading) => <th key={heading} className="px-4 py-3 text-left">{heading}</th>)}</tr></thead>
          <tbody>{policies.map((policy) => (
            <tr key={policy.id} onClick={() => openPolicy(policy)} className="cursor-pointer border-t odd:bg-white even:bg-slate-50">
              <td className="px-4 py-3 font-bold text-primary">{policy.client.full_name}</td>
              <td className="px-4 py-3">{policy.policy_number}</td>
              <td className="px-4 py-3">{policy.policy_type}</td>
              <td className="px-4 py-3">{shortInsurerName(policy.insurer_name)}</td>
              <td className="px-4 py-3">{formatDate(policy.start_date)}</td>
              <td className="px-4 py-3">{formatDate(policy.expiry_date)}</td>
              <td className="px-4 py-3"><UrgencyBadge date={policy.expiry_date} status={policy.renewal_status} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Card>
  );
}

function DashboardLapseShieldPreview({
  data,
  lifePolicies,
  base,
  openPolicy,
  saveLapseReview,
  updateLapseCase
}: {
  data: AppData;
  lifePolicies: PolicyWithClient[];
  base: string;
  openPolicy: (policy: PolicyWithClient) => void;
  saveLapseReview: (input: { statement_name: string; statement_kind: string; rows: LapseShieldStatementRow[] }) => Promise<{ ok: true } | null>;
  updateLapseCase: (caseId: string, status: LapseShieldCaseStatus) => void;
}) {
  const [review, setReview] = useState<LapseShieldReview | null>(null);
  const [statementName, setStatementName] = useState("");
  const [statementKind, setStatementKind] = useState("CSV, Excel, or PDF");
  const [errors, setErrors] = useState<string[]>([]);
  const activeLifePolicies = lifePolicies.filter((policy) => policy.status === "Active" && policy.renewal_status !== "Lost");
  const activeRun = data.lapse_shield_runs[0];
  const activeCases = data.lapse_shield_cases.flatMap((lapseCase) => {
    const policy = data.policies.find((item) => item.id === lapseCase.policy_id);
    return policy ? [{ lapseCase, policy }] : [];
  });

  async function handleStatementUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatementName(file.name);
    setStatementKind(statementKindForFile(file));
    setErrors([]);
    setReview(null);

    const parsed = file.name.toLowerCase().endsWith(".pdf") ? await (async (): Promise<LapseShieldStatementParseResult> => {
      const formData = new FormData();
      formData.set("statement", file);
      const serverParsed = await parseLapseShieldPdfStatement(formData);
      if (serverParsed.ok) return { rows: serverParsed.rows, errors: [] };

      return {
        rows: [],
        errors: [serverParsed.message]
      };
    })() : await parseLapseShieldStatementFile(file).catch(() => {
      return {
        rows: [],
        errors: ["PolicyHQ could not read that statement. Try CSV/Excel, or upload a text-based PDF."]
      };
    });
    if (parsed.errors.length) {
      setErrors(parsed.errors);
      return;
    }
    const nextReview = compareLapseShieldStatement(activeLifePolicies, parsed.rows);
    setReview(nextReview);
    await saveLapseReview({
      statement_name: file.name,
      statement_kind: statementKindForFile(file),
      rows: parsed.rows
    });
  }

  const matchedCount = review?.matched.length ?? activeRun?.matched_count ?? 0;
  const missingCount = activeCases.length || review?.missing.length || 0;
  const unknownCount = review?.unknown.length ?? activeRun?.unknown_count ?? 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="grid gap-6 p-[23px] lg:grid-cols-[1fr_0.9fr]">
          <div>
            <h2 className="text-[22px] font-extrabold leading-[26px] tracking-[-0.04em] text-primary">Statement Review</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Upload a life commission statement. PolicyHQ checks which active life policies are missing so the agent can follow up before lapse risk turns permanent.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <DashboardPanelMetricCard metric={{ label: "Life Policies", value: activeLifePolicies.length, href: navHref(base, "policies"), tone: "primary", helper: "Active" }} />
              <DashboardPanelMetricCard metric={{ label: "Matched", value: matchedCount, href: `${base}/lapse-shield`, tone: matchedCount ? "success" : "primary", helper: statementName || activeRun ? "In statement" : "Pending upload" }} />
              <DashboardPanelMetricCard metric={{ label: "Active Cases", value: missingCount, href: `${base}/lapse-shield`, tone: missingCount ? "danger" : "success", helper: missingCount ? "Needs follow-up" : "No active gaps" }} />
            </div>
          </div>
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-accent">{statementKind} statement</p>
            <h3 className="mt-3 text-lg font-extrabold text-primary">Upload commission statement</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">CSV and Excel need a policy number column. Text-based PDFs are read automatically; scanned PDFs may need OCR later.</p>
            <Input type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pdf,application/pdf" onChange={handleStatementUpload} className="mt-5 bg-white" />
            {statementName ? <p className="mt-3 truncate text-xs font-bold text-slate-500">{statementName}</p> : null}
            {errors.length ? <div className="mt-4 rounded-xl bg-danger/10 p-3 text-sm font-semibold leading-6 text-danger">{errors.map((error) => <p key={error}>{error}</p>)}</div> : null}
          </div>
        </CardContent>
      </Card>
      {activeCases.length ? (
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-danger">Active Lapse Shield cases</p>
                <h2 className="mt-2 text-xl font-extrabold text-primary">{activeCases.length} client{activeCases.length === 1 ? "" : "s"} need follow-up</h2>
                {activeRun ? <p className="mt-1 text-sm font-semibold text-slate-500">Latest statement: {activeRun.statement_name ?? "Commission statement"} · {formatDate(activeRun.created_at)}</p> : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeCases.map(({ lapseCase, policy }) => (
                <LapseShieldCaseRow
                  key={lapseCase.id}
                  lapseCase={lapseCase}
                  policy={policy}
                  openPolicy={openPolicy}
                  updateLapseCase={updateLapseCase}
                />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><h2 className="text-lg font-extrabold text-primary">Statement Summary</h2></CardHeader>
            <CardContent className="grid gap-3">
              <StatementSummaryItem label="Rows read" value={review?.statementRows ?? activeRun?.statement_rows_count ?? 0} />
              <StatementSummaryItem label="Matched policies" value={matchedCount} />
              <StatementSummaryItem label="Unknown in file" value={unknownCount} />
            </CardContent>
          </Card>
        </div>
      ) : review ? (
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-danger">Missing from statement</p>
                <h2 className="mt-2 text-xl font-extrabold text-primary">{missingCount} client{missingCount === 1 ? "" : "s"} need review</h2>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {review.missing.length ? review.missing.map((policy) => (
                <div key={policy.id} className="flex flex-col gap-3 rounded-xl border border-danger/20 bg-danger/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <button type="button" onClick={() => openPolicy(policy)} className="min-w-0 text-left">
                    <p className="truncate text-base font-extrabold text-primary">{policy.client.full_name}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-600">{policy.policy_number} · {policy.policy_type}</p>
                  </button>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={() => openPolicy(policy)}>View</Button>
                    <WhatsAppButton href={lapseShieldWhatsAppHref(policy)} label="WhatsApp" />
                  </div>
                </div>
              )) : <EmptyInlineState title="No missing life policies." body="Every active life policy matched this statement." />}
            </CardContent>
          </Card>
          <div className="space-y-5">
            <Card>
              <CardHeader><h2 className="text-lg font-extrabold text-primary">Statement Summary</h2></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <StatementSummaryItem label="Rows read" value={review.statementRows} />
                <StatementSummaryItem label="Matched policies" value={matchedCount} />
                <StatementSummaryItem label="Unknown in file" value={unknownCount} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><h2 className="text-lg font-extrabold text-primary">Unknown Statement Rows</h2></CardHeader>
              <CardContent className="space-y-3">
                {review.unknown.length ? review.unknown.slice(0, 6).map((row) => (
                  <div key={`${row.rowNumber}-${row.policy_number}`} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-sm font-extrabold text-primary">{row.policy_number}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">Row {row.rowNumber}{row.client_name ? ` · ${row.client_name}` : ""}</p>
                  </div>
                )) : <EmptyInlineState title="No unknown rows." body="Every statement policy number exists in PolicyHQ." />}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="grid gap-6 p-[23px] lg:grid-cols-[1fr_0.9fr]">
            <div>
              <h2 className="text-[22px] font-extrabold leading-[26px] tracking-[-0.04em] text-primary">Before upload</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">This workspace stays quiet until an agent uploads the monthly life commission statement. Nothing is stored from the file.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-accent">Monitor now</p>
              <h3 className="mt-3 text-lg font-extrabold text-primary">Use At Risk Life meanwhile</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">At Risk Life shows active life policies inside the year 1-3 lapse danger zone.</p>
              <Button asChild className="mt-5 rounded-[10px] text-[10px] font-extrabold"><Link href={`${base}/life-retention`}>View At Risk Life</Link></Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LapseShieldCaseRow({
  lapseCase,
  policy,
  openPolicy,
  updateLapseCase
}: {
  lapseCase: LapseShieldCase;
  policy: PolicyWithClient;
  openPolicy: (policy: PolicyWithClient) => void;
  updateLapseCase: (caseId: string, status: LapseShieldCaseStatus) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-danger/20 bg-danger/5 p-4 lg:flex-row lg:items-center lg:justify-between">
      <button type="button" onClick={() => openPolicy(policy)} className="min-w-0 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-base font-extrabold text-primary">{policy.client.full_name}</p>
          <Badge tone={lapseCase.status === "Client says paid" ? "amber" : lapseCase.status === "Contacted" ? "orange" : "red"}>{lapseCase.status}</Badge>
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-slate-600">{policy.policy_number} · {policy.policy_type}</p>
        <p className="mt-1 text-xs font-bold text-slate-500">Stays active until payment is confirmed, lapsed, or the next statement is uploaded.</p>
      </button>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => openPolicy(policy)}>View</Button>
        <WhatsAppButton href={lapseShieldWhatsAppHref(policy)} label="WhatsApp" />
        <Button size="sm" variant="outline" onClick={() => updateLapseCase(lapseCase.id, "Contacted")}>Contacted</Button>
        <Button size="sm" variant="outline" onClick={() => updateLapseCase(lapseCase.id, "Client says paid")}>Says Paid</Button>
        <Button size="sm" onClick={() => updateLapseCase(lapseCase.id, "Payment confirmed")}>Confirmed</Button>
        <Button size="sm" variant="outline" onClick={() => updateLapseCase(lapseCase.id, "Lapsed")}>Lapsed</Button>
      </div>
    </div>
  );
}

function StatementSummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-[-0.04em] text-primary">{value}</p>
    </div>
  );
}

function EmptyInlineState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-extrabold text-primary">{title}</p>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{body}</p>
    </div>
  );
}

function EmptyFocusState({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
        <FileText className="h-10 w-10 text-slate-300" />
        <h2 className="mt-4 text-xl font-extrabold text-primary">{title}</h2>
        <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-slate-500">{body}</p>
      </CardContent>
    </Card>
  );
}

function ProspectsDashboardCard({ total, dueToday, href }: { total: number; dueToday: number; href: string }) {
  return (
    <Link href={href} className="rounded-xl focus:outline-none focus:ring-2 focus:ring-accent">
      <Card className="min-h-[88px] cursor-pointer overflow-hidden transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md xl:w-[168px]">
        <CardContent className="p-[15px]">
          <p className="text-[10px] font-extrabold leading-[14px] text-slate-500">Prospects</p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <strong className="block text-2xl font-extrabold leading-7 tracking-[-0.04em] text-primary">{total}</strong>
            <div className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-extrabold text-accent">
              {dueToday} due
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function RenewalList({ title, policies, base, updateRenewal, openPolicy, onBack }: { title: string; policies: PolicyWithClient[]; base: string; updateRenewal: (id: string, status: RenewalStatus) => void; openPolicy: (policy: PolicyWithClient) => void; onBack: () => void }) {
  const sortedPolicies = [...policies].sort(sortByExpiry);
  return (
    <div className="max-w-[1062px] space-y-5">
      <Button asChild variant="outline"><Link href={navHref(base, "dashboard")} onClick={onBack}>Back to Dashboard</Link></Button>
      <div>
        <h1 className="text-[30px] font-extrabold leading-[35px] tracking-[-0.04em] text-primary">{title}</h1>
        <p className="mt-2 text-[13px] font-semibold leading-5 text-slate-500">{sortedPolicies.length} renewal{sortedPolicies.length === 1 ? "" : "s"} needing attention in this view.</p>
      </div>
      <Card>
        {sortedPolicies.length ? (
          <>
            <div className="space-y-3 p-4 md:hidden">
              {sortedPolicies.map((policy) => (
                <div key={policy.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <button type="button" onClick={() => openPolicy(policy)} className="block w-full text-left">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-extrabold text-primary">{policy.client.full_name}</p>
                        <p className="mt-1 truncate font-mono text-sm font-bold text-slate-500">{policy.policy_number}</p>
                      </div>
                      <UrgencyBadge date={policy.expiry_date} status={policy.renewal_status} />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-600">{policy.policy_type} · {shortInsurerName(policy.insurer_name)}</p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <Info label="Expiry" value={formatDate(policy.expiry_date)} />
                      <Info label="Premium" value={formatCurrency(policy.premium_amount)} />
                    </div>
                  </button>
                  <div className="mt-4 grid gap-2" onClick={(event) => event.stopPropagation()}>
                    <Select value={policy.renewal_status} onChange={(event) => updateRenewal(policy.id, event.target.value as RenewalStatus)}>{renewalStatuses.map((status) => <option key={status}>{status}</option>)}</Select>
                    <WhatsAppButton href={renewalWhatsAppHref(policy)} label="WhatsApp" className="w-full justify-center" />
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-auto md:block">
              <table className="w-full min-w-[1060px] text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>{["Client", "Phone", "Policy No.", "Class", "Insurer", "Expiry", "Premium", "Status", "Action"].map((heading) => <th className="px-4 py-3 text-left" key={heading}>{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {sortedPolicies.map((policy) => (
                    <tr key={policy.id} onClick={() => openPolicy(policy)} className={`cursor-pointer border-t ${urgency(policy.expiry_date) === "urgent" ? "bg-danger/10" : urgency(policy.expiry_date) === "soon" ? "bg-warning/10" : "odd:bg-white even:bg-slate-50"} hover:bg-accent/10`}>
                      <td className="px-4 py-3 font-bold text-primary">{policy.client.full_name}</td>
                      <td className="px-4 py-3">{policy.client.phone_number}</td>
                      <td className="px-4 py-3"><div className="flex flex-wrap items-center gap-2"><span>{policy.policy_number}</span><NeedsReviewBadge policy={policy} /></div></td>
                      <td className="px-4 py-3">{policy.policy_type}</td>
                      <td className="px-4 py-3">{shortInsurerName(policy.insurer_name)}</td>
                      <td className="px-4 py-3">{formatDate(policy.expiry_date)} <UrgencyBadge date={policy.expiry_date} status={policy.renewal_status} /></td>
                      <td className="px-4 py-3">{formatCurrency(policy.premium_amount)}</td>
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}><Select value={policy.renewal_status} onChange={(event) => updateRenewal(policy.id, event.target.value as RenewalStatus)}>{renewalStatuses.map((status) => <option key={status}>{status}</option>)}</Select></td>
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}><WhatsAppButton href={renewalWhatsAppHref(policy)} label="WhatsApp" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <CardContent><EmptyInlineState title="No renewals in this window." body="When policies match this renewal range, they will appear here." /></CardContent>
        )}
      </Card>
    </div>
  );
}

type ProspectTimeFilter = "Today" | "This Week" | "Next Week" | "This Month" | "All";
type ProspectStatusFilter = "All Active" | "New" | "Interested" | "Call Back" | "Converted" | "Not Interested";

function Prospects({
  prospects,
  dueTodayOnly,
  onAdd,
  onEdit,
  onDelete,
  onConvert,
  onStatusChange
}: {
  prospects: Prospect[];
  dueTodayOnly: boolean;
  onAdd: () => void;
  onEdit: (prospect: Prospect) => void;
  onDelete: (prospect: Prospect) => void;
  onConvert: (prospect: Prospect) => void;
  onStatusChange: (prospect: Prospect, status: ProspectStatus) => void;
}) {
  const [timeFilter, setTimeFilter] = useState<ProspectTimeFilter>(dueTodayOnly ? "Today" : "All");
  const [statusFilter, setStatusFilter] = useState<ProspectStatusFilter>("All Active");
  const visible = useMemo(() => sortProspectsByFollowUp(prospects.filter((prospect) => {
    return prospectMatchesStatusFilter(prospect, statusFilter) && prospectMatchesTimeFilter(prospect, timeFilter);
  })), [prospects, statusFilter, timeFilter]);
  const metrics = prospectQueueMetrics(prospects);

  return (
    <div className="max-w-[1062px] space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[32px] font-extrabold leading-[44px] text-primary">Prospects</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">A date-sorted queue for calls, WhatsApp follow-ups, and policy conversion.</p>
        </div>
        <Button onClick={onAdd} className="min-h-11 self-start sm:self-auto"><Plus className="h-4 w-4" /> Add Prospect</Button>
      </div>
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-2 sm:grid-cols-5">
            {(["Today", "This Week", "Next Week", "This Month", "All"] as ProspectTimeFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTimeFilter(item)}
                className={`h-11 rounded-xl px-3 text-sm font-extrabold ${timeFilter === item ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["All Active", "New", "Interested", "Call Back", "Converted", "Not Interested"] as ProspectStatusFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatusFilter(item)}
                className={`min-h-9 rounded-full px-4 text-xs font-extrabold ${statusFilter === item ? "bg-accent text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        <ProspectMetricCard label="Overdue" value={metrics.overdue} tone="danger" onClick={() => setTimeFilter("Today")} />
        <ProspectMetricCard label="Today" value={metrics.today} tone="orange" onClick={() => setTimeFilter("Today")} />
        <ProspectMetricCard label="This Week" value={metrics.thisWeek} tone="primary" onClick={() => setTimeFilter("This Week")} />
        <ProspectMetricCard label="Converted" value={metrics.converted} tone="success" onClick={() => setStatusFilter("Converted")} />
      </div>

      {visible.length ? (
        <div className="space-y-3">
          {visible.map((prospect) => (
            <ProspectCard
              key={prospect.id}
              prospect={prospect}
              onEdit={() => onEdit(prospect)}
              onDelete={() => onDelete(prospect)}
              onConvert={() => onConvert(prospect)}
              onStatusChange={(status) => onStatusChange(prospect, status)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex min-h-80 flex-col items-center justify-center text-center">
            <UserPlus className="h-12 w-12 text-slate-300" />
            <h2 className="mt-4 text-xl font-bold">No prospects match this view.</h2>
            <p className="mt-2 max-w-md text-sm text-slate-500">Change the date or status filter, or add a new prospect to your follow-up queue.</p>
            <Button className="mt-5" onClick={onAdd}><Plus className="h-4 w-4" /> Add Prospect</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProspectMetricCard({ label, value, tone, onClick }: { label: string; value: number; tone: "danger" | "orange" | "primary" | "success"; onClick: () => void }) {
  const toneClass = tone === "danger" ? "text-danger" : tone === "orange" ? "text-accent" : tone === "success" ? "text-success" : "text-primary";
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-extrabold ${toneClass}`}>{value}</p>
    </button>
  );
}

function ProspectCard({
  prospect,
  onEdit,
  onDelete,
  onConvert,
  onStatusChange
}: {
  prospect: Prospect;
  onEdit: () => void;
  onDelete: () => void;
  onConvert: () => void;
  onStatusChange: (status: ProspectStatus) => void;
}) {
  const followUp = prospectFollowUpLabel(prospect);
  const inactive = prospect.status === "Converted" || prospect.status === "Not Interested";
  return (
    <Card className={`overflow-hidden ${followUp.tone === "danger" ? "border-danger/30 bg-danger/5" : ""}`}>
      <CardContent className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,auto)] xl:items-center">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-extrabold text-primary">{prospect.full_name}</h2>
                <ProspectStatusBadge status={prospect.status} />
              </div>
              <a href={`tel:${normalizeGhanaPhoneNumber(prospect.phone_number)}`} className="mt-1 block truncate text-sm font-semibold text-slate-600">{prospect.phone_number}</a>
            </div>
            <span className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-extrabold ${prospectFollowUpToneClass(followUp.tone)}`}>
              {followUp.label}
            </span>
          </div>
          {prospect.notes ? <p className="line-clamp-2 text-sm leading-6 text-slate-600">{prospect.notes}</p> : null}
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-3 xl:grid-cols-[128px_90px_118px_74px_86px_108px] xl:items-center xl:justify-end">
          <Select
            value={prospect.status}
            onChange={(event) => onStatusChange(event.target.value as ProspectStatus)}
            className="min-h-11 text-sm font-bold sm:col-span-3 xl:col-span-1"
          >
            {prospectStatuses.map((status) => <option key={status}>{status}</option>)}
          </Select>
          <Button asChild variant="outline" className="min-h-11 whitespace-nowrap px-3">
            <a href={`tel:${normalizeGhanaPhoneNumber(prospect.phone_number)}`}><Phone className="h-4 w-4" /> Call</a>
          </Button>
          <Button asChild variant="outline" className="min-h-11 whitespace-nowrap px-3">
            <a href={prospectWhatsAppHref(prospect)} target="_blank" rel="noreferrer" aria-label={`Open WhatsApp for ${prospect.full_name}`}><MessageCircle className="h-4 w-4" /> <span className="hidden sm:inline xl:hidden 2xl:inline">WhatsApp</span><span className="sm:hidden xl:inline 2xl:hidden">WA</span></a>
          </Button>
          <Button variant="ghost" className="min-h-11 whitespace-nowrap px-3" onClick={onEdit}>Edit</Button>
          <Button variant="ghost" className="min-h-11 whitespace-nowrap px-3 text-danger hover:bg-danger/10" onClick={onDelete}><Trash2 className="h-4 w-4" /><span className="sr-only sm:not-sr-only xl:sr-only 2xl:not-sr-only">Delete</span></Button>
          <Button className="min-h-11 whitespace-nowrap px-3 sm:col-span-2 xl:col-span-1" onClick={onConvert} disabled={inactive}>Add Policy</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Clients({ clients, policies, base, onAdd, onImport, onEdit, onDelete, onExport }: { clients: Client[]; policies: PolicyWithClient[]; base: string; onAdd: () => void; onImport: () => void; onEdit: (client: Client) => void; onDelete: (client: Client) => void; onExport: () => void }) {
  const [sort, setSort] = useState<"name" | "date">("name");
  const [query, setQuery] = useState("");
  const sorted = [...clients].sort((a, b) => sort === "name" ? a.full_name.localeCompare(b.full_name) : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const visibleClients = sorted.filter((client) => {
    const search = query.trim().toLowerCase();
    if (!search) return true;
    return [client.full_name, client.phone_number, client.email ?? ""].some((value) => value.toLowerCase().includes(search));
  });
  if (!clients.length) return <Empty title="No clients yet. Add your first client to get started." action="Add Client" onAction={onAdd} />;
  return (
    <div className="max-w-[1062px] space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-[32px] font-extrabold leading-[44px] text-primary">Clients</h1>
        <Button onClick={onAdd}><Plus className="h-4 w-4" /> Add Client</Button>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end lg:justify-between">
          <label className="block text-sm font-semibold text-slate-600">
            Search clients
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, phone, email" className="mt-1 w-full lg:w-[260px]" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Select value={sort} onChange={(e) => setSort(e.target.value as "name" | "date")}><option value="name">Sort by Name</option><option value="date">Sort by Date Added</option></Select>
            <Button variant="outline" onClick={onImport}><Upload className="h-4 w-4" /> Import Clients</Button>
            <Button variant="outline" onClick={onExport}><Download className="h-4 w-4" /> Export CSV</Button>
          </div>
        </CardContent>
      </Card>
      <Card className="min-h-[520px]">
      {visibleClients.length ? (
      <>
      <div className="space-y-3 p-4 md:hidden">
        {visibleClients.map((client) => (
          <div key={client.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={`${base}/clients/${client.id}`} className="text-base font-extrabold text-primary">{client.full_name}</Link>
                <p className="mt-1 text-sm font-semibold text-slate-600">{client.phone_number}</p>
              </div>
              <Badge tone="slate">{policies.filter((policy) => policy.client_id === client.id).length} policies</Badge>
            </div>
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <p>{client.email || "No email recorded"}</p>
              <p>{client.address || "No address recorded"}</p>
              <p>Added {formatDate(client.created_at)}</p>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => onEdit(client)}>Edit</Button>
              <Button variant="ghost" size="sm" className="h-11 w-11" aria-label={`Archive ${client.full_name}`} onClick={() => onDelete(client)}><Trash2 className="h-4 w-4 text-danger" /></Button>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-auto md:block"><table className="w-full min-w-[1050px] text-sm"><thead className="sticky top-0 bg-slate-50"><tr>{["Full Name", "Phone Number", "Email", "Date of Birth", "Address", "Number of Policies", "Date Added", "Actions"].map((h) => <th className="px-4 py-3 text-left" key={h}>{h}</th>)}</tr></thead><tbody>{visibleClients.map((c) => <tr key={c.id} className="border-t odd:bg-white even:bg-slate-50"><td className="px-4 py-3 font-bold"><Link href={`${base}/clients/${c.id}`}>{c.full_name}</Link></td><td className="px-4 py-3">{c.phone_number}</td><td className="px-4 py-3">{c.email || "—"}</td><td className="px-4 py-3">{c.date_of_birth ? formatDate(c.date_of_birth) : "—"}</td><td className="px-4 py-3">{c.address || "—"}</td><td className="px-4 py-3">{policies.filter((p) => p.client_id === c.id).length}</td><td className="px-4 py-3">{formatDate(c.created_at)}</td><td className="px-4 py-3"><Button variant="ghost" size="sm" onClick={() => onEdit(c)}>Edit</Button><Button variant="ghost" size="sm" onClick={() => onDelete(c)}><Trash2 className="h-4 w-4 text-danger" /></Button></td></tr>)}</tbody></table></div>
      </>
      ) : (
        <CardContent><EmptyInlineState title="No clients match that search." body="Try a name, phone number, or email from your client list." /></CardContent>
      )}
    </Card>
    </div>
  );
}

function ClientDetail({ client, policies, base, openPolicy, notes, saveNote }: { client: Client; policies: PolicyWithClient[]; base: string; openPolicy: (policy: PolicyWithClient) => void; notes: ActivityNote[]; saveNote: (input: { client_id?: string; policy_id?: string; note_text: string }) => void }) {
  const [noteText, setNoteText] = useState("");
  function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveNote({ client_id: client.id, note_text: noteText });
    setNoteText("");
  }
  return (
    <div className="space-y-5">
      <Button asChild variant="outline"><Link href={`${base}/clients`}>Back to clients</Link></Button>
      <Card>
        <CardHeader><h1 className="text-2xl font-extrabold">{client.full_name}</h1></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-5">
          <Info label="Phone Number" value={<span className="flex flex-col gap-2"><span>{client.phone_number}</span><WhatsAppButton href={clientWhatsAppHref(client)} label="WhatsApp Client" /></span>} />
          <Info label="Email" value={client.email || "No email"} />
          <Info label="Date of Birth" value={client.date_of_birth ? formatDate(client.date_of_birth) : "Not recorded"} />
          <Info label="Address" value={client.address || "No address"} />
          <Info label="Date Added" value={formatDate(client.created_at)} />
        </CardContent>
      </Card>
      <ActivityNotesCard notes={notes} value={noteText} onChange={setNoteText} onSubmit={submitNote} />
      <Card>
        <CardHeader><h2 className="text-xl font-bold">Policies</h2></CardHeader>
        {policies.length ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 bg-slate-50"><tr>{["Policy Number", "Type", "Insurer", "Expiry Date", "Premium", "Status", "Renewal Status"].map((h) => <th className="px-4 py-3 text-left" key={h}>{h}</th>)}</tr></thead>
              <tbody>{policies.map((policy) => <tr key={policy.id} onClick={() => openPolicy(policy)} className="cursor-pointer border-t odd:bg-white even:bg-slate-50"><td className="px-4 py-3 font-bold"><div className="flex flex-wrap items-center gap-2"><span>{policy.policy_number}</span><NeedsReviewBadge policy={policy} /></div></td><td className="px-4 py-3">{policy.policy_type}</td><td className="px-4 py-3">{policy.insurer_name}</td><td className="px-4 py-3">{formatDate(policy.expiry_date)} <UrgencyBadge date={policy.expiry_date} status={policy.renewal_status} /></td><td className="px-4 py-3">{formatCurrency(policy.premium_amount)}</td><td className="px-4 py-3"><Badge tone={policy.status === "Active" ? "green" : "slate"}>{policy.status}</Badge></td><td className="px-4 py-3">{policy.renewal_status}</td></tr>)}</tbody>
            </table>
          </div>
        ) : (
          <CardContent><p className="text-sm text-slate-600">No policies are linked to this client yet.</p></CardContent>
        )}
      </Card>
    </div>
  );
}

function Policies({ policies, clients, initialFilter, onAdd, onEdit, onDelete, onExport, updateRenewal, openPolicy }: { policies: PolicyWithClient[]; clients: Client[]; initialFilter?: "needs-review"; onAdd: () => void; onEdit: (policy: PolicyWithClient) => void; onDelete: (policy: PolicyWithClient) => void; onExport: () => void; updateRenewal: (id: string, status: RenewalStatus) => void; openPolicy: (policy: PolicyWithClient) => void }) {
  const [status, setStatus] = useState("All");
  const [type, setType] = useState("All");
  const [pageFilter, setPageFilter] = useState<PolicyPageFilter>(initialFilter === "needs-review" ? "needs-review" : "all");
  const reviewCount = policies.filter(needsPolicyReview).length;
  const filtered = policies.filter((p) => {
    const reviewMatches = pageFilter === "all" || needsPolicyReview(p);
    return reviewMatches && (status === "All" || p.status === status) && (type === "All" || p.policy_type === type);
  });
  if (!policies.length) return <Empty title="No policies yet. Add your first policy to get started." action="Add Policy" onAction={onAdd} />;
  return (
    <div className="max-w-[1062px] space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[32px] font-extrabold leading-[44px] text-primary">Policies</h1>
          {pageFilter === "needs-review" ? <p className="mt-1 text-sm font-bold text-slate-500">Imported records that need a quick cleanup before they are fully useful.</p> : null}
        </div>
        <Button onClick={onAdd}><Plus className="h-4 w-4" /> Add Policy</Button>
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setPageFilter("all")} className={`h-9 rounded-full px-5 text-xs font-extrabold ${pageFilter === "all" ? "bg-primary text-white" : "bg-slate-100 text-slate-600"}`}>All Policies</button>
            <button type="button" onClick={() => setPageFilter("needs-review")} className={`h-9 rounded-full px-5 text-xs font-extrabold ${pageFilter === "needs-review" ? "bg-warning text-white" : "bg-warning/10 text-warning"}`}>Needs Review {reviewCount ? `(${reviewCount})` : ""}</button>
          </div>
          <div className="h-px w-full bg-slate-100" />
          <div className="flex flex-wrap gap-2">
            {["All", "Life", "Health", "Motor", "Property"].map((item) => (
              <button key={item} type="button" onClick={() => setType(item)} className={`h-9 rounded-full px-5 text-xs font-extrabold ${type === item ? "bg-accent/10 text-accent" : "bg-slate-100 text-slate-600"}`}>{item}</button>
            ))}
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}><option>All</option>{policyStatuses.map((item) => <option key={item}>{item}</option>)}</Select>
          <Button variant="outline" onClick={onExport}><Download className="h-4 w-4" /> Export CSV</Button>
        </CardContent>
      </Card>
      <Card className="min-h-[520px]">
      {!filtered.length ? (
        <CardContent className="flex min-h-[420px] flex-col items-center justify-center p-6 text-center">
          <ShieldCheck className="h-11 w-11 text-slate-300" />
          <h2 className="mt-4 text-xl font-extrabold text-primary">{pageFilter === "needs-review" ? "No policies need review" : "No policies match these filters"}</h2>
          <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-slate-500">
            {pageFilter === "needs-review" ? "All imported policy records have the key details PolicyHQ needs for renewals, commissions, and reports." : "Try clearing the status or policy type filter."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            {pageFilter === "needs-review" ? <Button variant="outline" onClick={() => setPageFilter("all")}>View All Policies</Button> : <Button variant="outline" onClick={() => { setStatus("All"); setType("All"); setPageFilter("all"); }}>Clear Filters</Button>}
            <Button onClick={onAdd}><Plus className="h-4 w-4" /> Add Policy</Button>
          </div>
        </CardContent>
      ) : (
      <>
      <div className="space-y-3 p-4 md:hidden">
        {filtered.map((policy) => (
          <div key={policy.id} className={`rounded-xl border bg-white p-4 shadow-sm ${needsPolicyReview(policy) ? "border-warning/50" : "border-slate-200"}`}>
            <button type="button" onClick={() => openPolicy(policy)} className="block w-full text-left">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold text-primary">{policy.client.full_name}</p>
                  <p className="mt-1 font-mono text-sm font-bold text-slate-500">{policy.policy_number}</p>
                  <div className="mt-2"><NeedsReviewBadge policy={policy} /></div>
                </div>
                <Badge tone={policy.status === "Active" ? "green" : "slate"}>{policy.status}</Badge>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-600">{policy.insurer_name}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <Info label="Type" value={policy.policy_type} />
                <Info label="Premium" value={formatCurrency(policy.premium_amount)} />
                <Info label="Expiry" value={formatDate(policy.expiry_date)} />
                <div><UrgencyBadge date={policy.expiry_date} status={policy.renewal_status} /></div>
              </div>
              {needsPolicyReview(policy) ? <PolicyReviewSummary policy={policy} /> : null}
            </button>
            <div className="mt-4 grid gap-2" onClick={(event) => event.stopPropagation()}>
              <Select value={policy.renewal_status} onChange={(event) => updateRenewal(policy.id, event.target.value as RenewalStatus)}>{renewalStatuses.map((item) => <option key={item}>{item}</option>)}</Select>
              <div className="flex gap-2">
                <WhatsAppButton href={renewalWhatsAppHref(policy)} label="WhatsApp" className="flex-1" />
                <Button variant="outline" size="sm" className="flex-1" onClick={() => onEdit(policy)}>Edit</Button>
                <Button variant="ghost" size="sm" className="h-11 w-11" aria-label={`Delete ${policy.policy_number}`} onClick={() => onDelete(policy)}><Trash2 className="h-4 w-4 text-danger" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-auto md:block"><table className="w-full min-w-[1200px] text-sm"><thead className="sticky top-0 bg-slate-50"><tr>{["Client Name", "Policy Number", "Type", "Insurer", "Start Date", "Expiry Date", "Premium (GHS)", "Status", "Renewal Status", "Actions"].map((h) => <th className="px-4 py-3 text-left" key={h}>{h}</th>)}</tr></thead><tbody>{filtered.map((p) => <tr key={p.id} onClick={() => openPolicy(p)} className={`cursor-pointer border-t ${needsPolicyReview(p) ? "bg-warning/10" : urgency(p.expiry_date) === "urgent" ? "bg-danger/10" : urgency(p.expiry_date) === "soon" ? "bg-warning/10" : "odd:bg-white even:bg-slate-50"}`}><td className="px-4 py-3 font-bold">{p.client.full_name}</td><td className="px-4 py-3"><div className="flex flex-wrap items-center gap-2"><span>{p.policy_number}</span><NeedsReviewBadge policy={p} /></div>{needsPolicyReview(p) ? <PolicyReviewSummary policy={p} compact /> : null}</td><td className="px-4 py-3">{p.policy_type}</td><td className="px-4 py-3">{p.insurer_name}</td><td className="px-4 py-3">{formatDate(p.start_date)}</td><td className="px-4 py-3">{formatDate(p.expiry_date)} <UrgencyBadge date={p.expiry_date} status={p.renewal_status} /></td><td className="px-4 py-3">{formatCurrency(p.premium_amount)}</td><td className="px-4 py-3"><Badge tone={p.status === "Active" ? "green" : "slate"}>{p.status}</Badge></td><td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><Select value={p.renewal_status} onChange={(e) => updateRenewal(p.id, e.target.value as RenewalStatus)}>{renewalStatuses.map((s) => <option key={s}>{s}</option>)}</Select></td><td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><WhatsAppButton href={renewalWhatsAppHref(p)} label="WhatsApp" /><Button variant="ghost" size="sm" onClick={() => onEdit(p)}>Edit</Button><Button variant="ghost" size="sm" onClick={() => onDelete(p)}><Trash2 className="h-4 w-4 text-danger" /></Button></td></tr>)}</tbody></table></div>
      </>
      )}
    </Card>
    </div>
  );
}

function Commissions({
  data,
  totalEarned,
  totalPaidThisMonth,
  base,
  initialFilter,
  markPaid,
  openPolicy,
  onExport,
  onWriteAttempt
}: {
  data: AppData;
  totalEarned: number;
  totalPaidThisMonth: number;
  base: string;
  initialFilter?: "paid-this-month";
  markPaid: (commission: Commission) => void;
  openPolicy: (policy: PolicyWithClient) => void;
  onExport: (commissions: Commission[]) => void;
  onWriteAttempt: () => boolean;
}) {
  const [paymentFilter, setPaymentFilter] = useState<CommissionPaymentFilter>(initialFilter === "paid-this-month" ? "Paid" : "All");
  const [periodFilter, setPeriodFilter] = useState<CommissionPeriodFilter>(initialFilter === "paid-this-month" ? "This Month" : "All");
  const [classFilter, setClassFilter] = useState<CommissionClassFilter>("All");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const commissionItems = data.commissions.flatMap((commission) => {
    const policy = data.policies.find((item) => item.id === commission.policy_id);
    if (!policy) return [];
    const businessClass = policy.insurance_category ?? insuranceCategoryForPolicyType(policy.policy_type);
    const amount = policy.premium_amount * commission.commission_rate / 100;
    const daysPending = daysBetween(policy.start_date, new Date());
    const displayStatus: CommissionDisplayStatus = commission.payment_status === "Paid" ? "Paid" : daysPending > 30 ? "Overdue" : "Pending";
    return [{ commission, policy, businessClass, amount, daysPending, displayStatus }];
  });
  const rows = commissionItems.filter((item) => {
    const paymentMatches = paymentFilter === "All" || item.commission.payment_status === paymentFilter;
    const periodMatches = periodFilter === "All" || isCurrentMonth(commissionEarnedDate(item.commission));
    const classMatches = classFilter === "All" || item.businessClass === classFilter;
    return paymentMatches && periodMatches && classMatches;
  }).sort(sortCommissionItems);
  const pendingTotal = commissionItems.filter((item) => item.displayStatus === "Pending").reduce((sum, item) => sum + item.amount, 0);
  const overdueItems = commissionItems.filter((item) => item.displayStatus === "Overdue");
  const overdueTotal = overdueItems.reduce((sum, item) => sum + item.amount, 0);
  function confirmMarkPaid(commission: Commission) {
    markPaid(commission);
    setConfirmingId(null);
  }
  function toggleFlag(id: string) {
    setFlaggedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  if (!data.commissions.length) {
    return (
      <Card>
        <CardContent className="flex min-h-96 flex-col items-center justify-center text-center">
          <FileText className="h-12 w-12 text-slate-300" />
          <h1 className="mt-4 text-xl font-bold">No commissions yet. Add a policy to create commission records.</h1>
          <Button asChild className="mt-5"><Link href={navHref(base, "policies")}>Go to Policies</Link></Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="max-w-[1062px] space-y-6">
      <h1 className="text-[32px] font-extrabold leading-[44px] text-primary">Commissions</h1>
      <Card>
        <CardContent className="p-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-14">
            {[
              ["Total Pending", pendingTotal],
              ["Total Overdue", overdueTotal],
              ["Paid This Month", totalPaidThisMonth],
              ["All Time", totalEarned]
            ].map(([label, value]) => (
              <div key={label as string}>
                <p className="text-sm font-bold text-slate-500">{label as string}</p>
                <strong className="mt-2 block text-3xl font-extrabold text-primary">{formatCurrency(value as number)}</strong>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="min-h-[520px]">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-extrabold">Commission Records</h2>
            <div className="mt-3 flex flex-wrap gap-2 rounded-xl bg-slate-100 p-1">
              {(["All", ...commissionBusinessClasses] as CommissionClassFilter[]).map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setClassFilter(item)}
                  className={`rounded-lg px-4 py-2 text-sm font-bold ${classFilter === item ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-primary"}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value as CommissionPeriodFilter)}>
              <option>All</option>
              <option>This Month</option>
            </Select>
            <Select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as CommissionPaymentFilter)}>
              <option>All</option>
              <option>Paid</option>
              <option>Pending</option>
            </Select>
            <Button variant="outline" disabled={!rows.length} onClick={() => onExport(rows.map((item) => item.commission))}><Download className="h-4 w-4" /> Export to CSV</Button>
          </div>
        </CardHeader>
        {rows.length ? (
          <>
          <div className="space-y-3 border-t p-4 md:hidden">
            {rows.map(({ commission, policy, businessClass, amount, daysPending, displayStatus }) => (
              <div
                key={commission.id}
                role="button"
                tabIndex={0}
                onClick={() => openPolicy(policy)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openPolicy(policy);
                  }
                }}
                className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold text-primary">{policy.client.full_name}</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-slate-500">{policy.policy_number}</p>
                  </div>
                  <CommissionStatusBadge status={displayStatus} />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-600">{shortInsurerName(policy.insurer_name)}</p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-400">Commission</p>
                    <p className="text-xl font-extrabold text-primary">{formatCurrency(amount)}</p>
                    {displayStatus !== "Paid" ? <p className="text-xs font-semibold text-slate-500">{daysPending} days pending</p> : null}
                  </div>
                  <BusinessClassBadge value={businessClass} />
                </div>
                <div onClick={(event) => event.stopPropagation()}>
                  <CommissionAction commission={commission} status={displayStatus} confirming={confirmingId === commission.id} flagged={flaggedIds.has(commission.id)} onStart={() => onWriteAttempt() || setConfirmingId(commission.id)} onCancel={() => setConfirmingId(null)} onConfirm={() => confirmMarkPaid(commission)} onFlag={() => onWriteAttempt() || toggleFlag(commission.id)} onView={() => openPolicy(policy)} mobile />
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-auto md:block">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>{["Client", "Policy No.", "Insurer", "Business Class", "Premium", "Commission", "Status", "Action"].map((h) => <th className="px-4 py-3 text-left" key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(({ commission, policy, businessClass, amount, daysPending, displayStatus }) => (
                  <tr key={commission.id} onClick={() => openPolicy(policy)} className="cursor-pointer border-t odd:bg-white even:bg-slate-50 hover:bg-accent/10">
                    <td className="px-4 py-3 font-bold">{policy.client.full_name}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold" onClick={(event) => { event.stopPropagation(); navigator.clipboard.writeText(policy.policy_number); }}>{policy.policy_number}</td>
                    <td className="px-4 py-3">{shortInsurerName(policy.insurer_name)}</td>
                    <td className="px-4 py-3"><BusinessClassBadge value={businessClass} /></td>
                    <td className="px-4 py-3">{formatCurrency(policy.premium_amount)}</td>
                    <td className="px-4 py-3"><span className="font-extrabold">{formatCurrency(amount)}</span>{displayStatus !== "Paid" ? <span className="mt-1 block text-xs font-semibold text-slate-500">{daysPending} days pending</span> : null}</td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><CommissionStatusBadge status={displayStatus} />{flaggedIds.has(commission.id) ? <Flag className="h-4 w-4 text-danger" /> : null}</div></td>
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}><CommissionAction commission={commission} status={displayStatus} confirming={confirmingId === commission.id} flagged={flaggedIds.has(commission.id)} onStart={() => onWriteAttempt() || setConfirmingId(commission.id)} onCancel={() => setConfirmingId(null)} onConfirm={() => confirmMarkPaid(commission)} onFlag={() => onWriteAttempt() || toggleFlag(commission.id)} onView={() => openPolicy(policy)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <CardContent className="border-t py-12 text-center text-sm font-semibold text-slate-500">No commissions match these filters.</CardContent>
        )}
      </Card>
    </div>
  );
}

function Notifications({ data, base, markAllRead, onClick, onBack }: { data: AppData; base: string; markAllRead: () => void; onClick: (id: string) => void; onBack: () => void }) {
  const dashboardHref = navHref(base, "dashboard");
  if (!data.notifications.length) {
    return (
      <Card>
        <CardContent className="flex min-h-96 flex-col items-center justify-center text-center">
          <FileText className="h-12 w-12 text-slate-300" />
          <h1 className="mt-4 text-xl font-bold">You have no renewal alerts yet.</h1>
          <Button asChild className="mt-5">
            <Link href={dashboardHref} onClick={onBack}>Back to Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="max-w-[1062px] space-y-6">
      <h1 className="text-[32px] font-extrabold leading-[44px] text-primary">Renewal Alerts</h1>
      <Card className="min-h-[520px]">
        <CardHeader className="flex flex-col gap-3 border-b-0 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-extrabold text-primary">Renewals needing action</h2>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link href={dashboardHref} onClick={onBack}>Back to Dashboard</Link></Button>
            <Button onClick={markAllRead}>Mark All as Read</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.notifications.map((n, index) => (
            <button
              key={n.id}
              onClick={() => onClick(n.id)}
              className={`flex w-full items-center justify-between gap-4 rounded-xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${index === 0 ? "border-danger/20 bg-danger/10" : "border-slate-200 bg-slate-50"}`}
            >
              <div>
                <p className="text-lg font-extrabold text-primary">{n.message.split(" for ")[1]?.split(" (")[0] ?? "Renewal alert"}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">{n.message}</p>
              </div>
              <Badge tone={index === 0 ? "red" : index === 1 ? "amber" : "green"}>{index === 0 ? "Critical" : index === 1 ? "Watch" : "Safe"}</Badge>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Profile({ data, saveProfile, saveNotificationSettings, uploadAvatar, changePassword }: { data: AppData; saveProfile: (formData: FormData) => void; saveNotificationSettings: (formData: FormData) => void; uploadAvatar: (event: ChangeEvent<HTMLInputElement>) => void; changePassword: (formData: FormData) => void }) {
  return (
    <div className="max-w-[1062px] space-y-6">
      <h1 className="text-[32px] font-extrabold leading-[44px] text-primary">Profile & Settings</h1>
      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="min-h-[560px]">
          <CardHeader className="border-b-0"><h2 className="text-2xl font-extrabold text-primary">Profile</h2></CardHeader>
          <CardContent className="space-y-4">
            <Avatar profile={data.profile} large />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold"><Upload className="h-4 w-4" /> Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={uploadAvatar} /></label>
            <form action={saveProfile} className="space-y-4"><label className="block text-sm font-semibold">Full Name<Input name="full_name" defaultValue={data.profile.full_name} className="mt-1" /></label><label className="block text-sm font-semibold">Email<Input readOnly defaultValue={data.profile.email ?? ""} placeholder="No email on this account" className="mt-1 bg-slate-50" /></label><label className="block text-sm font-semibold">Phone Number<Input name="phone_number" defaultValue={data.profile.phone_number ?? ""} className="mt-1" /></label><label className="block text-sm font-semibold">Company Name<Input name="company_name" defaultValue={data.profile.company_name ?? ""} className="mt-1" /></label><Button>Save Changes</Button></form>
            <form action={changePassword} className="border-t pt-4"><h3 className="font-bold">Change Password</h3><Input name="current_password" className="mt-3" type="password" placeholder="Current Password" /><Input name="new_password" className="mt-3" type="password" placeholder="New Password" /><Input name="confirm_password" className="mt-3" type="password" placeholder="Confirm New Password" /><Button className="mt-4">Update Password</Button></form>
          </CardContent>
        </Card>
        <Card className="min-h-[560px]">
          <CardHeader className="border-b-0"><h2 className="text-2xl font-extrabold text-primary">Notification Settings</h2></CardHeader>
          <CardContent>
            <form action={saveNotificationSettings} className="space-y-5">
              <p className="rounded-xl bg-accent/10 p-3 text-sm font-semibold text-accent">WhatsApp delivery requires approved Meta templates and production credentials. Email and in-app renewal tracking remain available during beta.</p>
              <ToggleRow name="whatsapp_enabled" label="WhatsApp Notifications" checked={data.profile.whatsapp_enabled} />
              <ToggleRow name="email_notifications_enabled" label="Email Notifications" checked={data.profile.email_notifications_enabled} />
              <ToggleRow name="birthday_messages_enabled" label="Birthday Messages" checked={data.profile.birthday_messages_enabled} />
              <ToggleRow name="agent_whatsapp_summary_enabled" label="Daily WhatsApp Summary" checked={data.profile.agent_whatsapp_summary_enabled} />
              <ToggleRow name="reminder_30_enabled" label="30-day reminders" checked={data.profile.reminder_30_enabled} muted />
              <ToggleRow name="reminder_14_enabled" label="14-day reminders" checked={data.profile.reminder_14_enabled} muted />
              <ToggleRow name="reminder_7_enabled" label="7-day reminders" checked={data.profile.reminder_7_enabled} muted />
              <Button>Save Settings</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ToggleRow({ name, label, checked, muted = false }: { name: string; label: string; checked: boolean; muted?: boolean }) {
  return (
    <label className="flex items-center justify-between gap-4 font-semibold text-primary">
      {label}
      <input name={name} type="checkbox" defaultChecked={checked} className={`h-5 w-10 rounded-full accent-[#F97316] ${muted ? "opacity-60" : ""}`} />
    </label>
  );
}

function ClientModal({ client, onClose, onSave }: { client?: Client; onClose: () => void; onSave: (payload: Partial<Client>) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      id: client?.id,
      full_name: String(form.get("full_name") ?? ""),
      phone_number: String(form.get("phone_number") ?? ""),
      email: String(form.get("email") ?? ""),
      date_of_birth: dateOfBirthToIso(String(form.get("date_of_birth") ?? "")),
      address: String(form.get("address") ?? "")
    });
  }
  return <ModalFrame title={client ? "Edit Client" : "Add New Client"} onClose={onClose}><form onSubmit={submit} className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-semibold">Full Name<Input name="full_name" required defaultValue={client?.full_name} className="mt-1" /></label><label className="block text-sm font-semibold">Phone Number<Input name="phone_number" required defaultValue={client?.phone_number} className="mt-1" /></label><label className="block text-sm font-semibold">Email<Input name="email" type="email" defaultValue={client?.email ?? ""} className="mt-1" /></label><label className="block text-sm font-semibold">Date of Birth<Input name="date_of_birth" inputMode="numeric" placeholder="DD/MM/YYYY" defaultValue={dateOfBirthForDisplay(client?.date_of_birth)} pattern="(0?[1-9]|[12][0-9]|3[01])[/.-](0?[1-9]|1[0-2])[/.-](19|20)\\d\\d|\\d{4}-\\d{2}-\\d{2}" title="Use DD/MM/YYYY, for example 23/04/1993" className="mt-1" /></label><label className="block text-sm font-semibold md:col-span-2">Address<Input name="address" defaultValue={client?.address ?? ""} className="mt-1" /></label><div className="md:col-span-2 mt-2 flex justify-end gap-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button>Save Client</Button></div></form></ModalFrame>;
}

function ProspectModal({ prospect, onClose, onSave, onDelete }: { prospect?: Prospect; onClose: () => void; onSave: (payload: Partial<Prospect>) => void; onDelete: (prospect: Prospect) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      id: prospect?.id,
      full_name: String(form.get("full_name") ?? ""),
      phone_number: String(form.get("phone_number") ?? ""),
      status: String(form.get("status") ?? "New") as ProspectStatus,
      follow_up_date: String(form.get("follow_up_date") ?? ""),
      notes: String(form.get("notes") ?? "")
    });
  }

  return (
    <ModalFrame title={prospect ? "Edit Prospect" : "Add Prospect"} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-semibold">Full Name<Input name="full_name" required defaultValue={prospect?.full_name} className="mt-1" /></label>
        <label className="block text-sm font-semibold">Phone Number<Input name="phone_number" required inputMode="tel" pattern="\\+?[0-9 ()-]{8,20}" defaultValue={prospect?.phone_number} className="mt-1" /></label>
        <label className="block text-sm font-semibold">Status<Select name="status" defaultValue={prospect?.status ?? "New"} className="mt-1">{prospectStatuses.map((item) => <option key={item}>{item}</option>)}</Select></label>
        <label className="block text-sm font-semibold">Follow-up Date<Input name="follow_up_date" type="date" defaultValue={prospect?.follow_up_date ?? ""} className="mt-1" /></label>
        <label className="block text-sm font-semibold md:col-span-2">Notes<Textarea name="notes" defaultValue={prospect?.notes ?? ""} className="mt-1" /></label>
        <div className="md:col-span-2 mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {prospect ? <Button type="button" variant="ghost" className="text-danger hover:bg-danger/10" onClick={() => onDelete(prospect)}><Trash2 className="h-4 w-4" /> Delete Prospect</Button> : <span />}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button>Save Prospect</Button>
          </div>
        </div>
      </form>
    </ModalFrame>
  );
}

function PolicyModal({ policy, prospect, clients, onClose, onSave }: { policy?: PolicyWithClient; prospect?: Prospect; clients: Client[]; onClose: () => void; onSave: (payload: PolicySavePayload) => void }) {
  const [selectedType, setSelectedType] = useState<PolicyType>(policy?.policy_type ?? "Life");
  const [clientMode, setClientMode] = useState<"new" | "existing">(policy ? "existing" : "new");
  const [selectedClientId, setSelectedClientId] = useState(policy?.client_id ?? "");
  const [insuranceCategory, setInsuranceCategory] = useState<InsuranceCategory>(policy?.insurance_category ?? insuranceCategoryForPolicyType(policy?.policy_type ?? "Life"));
  const [insurerName, setInsurerName] = useState(policy?.insurer_name ?? "");
  const [policyNumber, setPolicyNumber] = useState(policy?.policy_number ?? "");
  const selectedClient = clients.find((client) => client.id === selectedClientId);
  const normalizedPolicyNumber = normalizePolicyNumber(policyNumber);
  const showPolicyNumberError = policyNumber.trim().length > 0 && !isValidPolicyNumber(policyNumber);

  function changePolicyType(nextType: PolicyType) {
    const nextCategory = insuranceCategoryForPolicyType(nextType);
    setSelectedType(nextType);
    setInsuranceCategory(nextCategory);
    if (findInsuranceCompanyCategory(insurerName) && findInsuranceCompanyCategory(insurerName) !== nextCategory) {
      setInsurerName("");
    }
  }

  function changeInsuranceCategory(nextCategory: InsuranceCategory) {
    setInsuranceCategory(nextCategory);
    if (findInsuranceCompanyCategory(insurerName) && findInsuranceCompanyCategory(insurerName) !== nextCategory) {
      setInsurerName("");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const policyType = String(form.get("policy_type") ?? "Life") as PolicyType;
    const existingClientId = clientMode === "existing" ? String(form.get("client_id") ?? "") : "";
    const insurer = String(form.get("insurer_name") ?? "");
    onSave({
      id: policy?.id,
      client_id: existingClientId || undefined,
      new_client: clientMode === "new" ? {
        full_name: String(form.get("client_full_name") ?? ""),
        phone_number: String(form.get("client_phone_number") ?? ""),
        email: String(form.get("client_email") ?? ""),
        date_of_birth: dateOfBirthToIso(String(form.get("client_date_of_birth") ?? "")),
        address: String(form.get("client_address") ?? "")
      } : undefined,
      policy_number: normalizedPolicyNumber,
      policy_type: policyType,
      insurance_category: insuranceCategory,
      vehicle_number: policyType === "Motor" ? String(form.get("vehicle_number") ?? "") : null,
      property_location: policyType === "Property" ? String(form.get("property_location") ?? "") : null,
      insurer_name: insurer,
      start_date: String(form.get("start_date") ?? ""),
      expiry_date: String(form.get("expiry_date") ?? ""),
      premium_amount: Number(form.get("premium_amount") ?? 0),
      status: String(form.get("status") ?? "Active") as PolicyStatus,
      renewal_status: String(form.get("renewal_status") ?? "Upcoming") as RenewalStatus,
      notes: String(form.get("notes") ?? ""),
      commission_rate: Number(form.get("commission_rate") ?? policy?.commission?.commission_rate ?? 10),
      payment_status: String(form.get("payment_status") ?? policy?.commission?.payment_status ?? "Pending") as "Paid" | "Pending",
      source_prospect_id: prospect?.id
    });
  }
  return (
    <ModalFrame title={policy ? "Edit Policy" : prospect ? "Create Policy from Prospect" : "Add New Policy"} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-bold">Client</h3>
            {!policy ? <div className="inline-flex rounded-xl bg-white p-1">
              <button type="button" className={`rounded-lg px-3 py-2 text-sm font-bold ${clientMode === "new" ? "bg-primary text-white" : "text-slate-500"}`} onClick={() => setClientMode("new")}>New client</button>
              <button type="button" className={`rounded-lg px-3 py-2 text-sm font-bold ${clientMode === "existing" ? "bg-primary text-white" : "text-slate-500"}`} onClick={() => setClientMode("existing")}>Existing client</button>
            </div> : null}
          </div>
          {clientMode === "existing" ? (
            <div className="space-y-4">
              <label className="block text-sm font-semibold">Client<Select name="client_id" required value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)} className="mt-1"><option value="" disabled>Select client</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.full_name}</option>)}</Select></label>
              {selectedClient ? <ExistingClientDetails client={selectedClient} /> : null}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-semibold">Full Name<Input name="client_full_name" required defaultValue={prospect?.full_name ?? ""} className="mt-1 bg-white" /></label>
              <label className="block text-sm font-semibold">Phone Number<Input name="client_phone_number" required defaultValue={prospect?.phone_number ?? ""} className="mt-1 bg-white" /></label>
              <label className="block text-sm font-semibold">Email<Input name="client_email" type="email" className="mt-1 bg-white" /></label>
              <label className="block text-sm font-semibold">Date of Birth<Input name="client_date_of_birth" inputMode="numeric" placeholder="DD/MM/YYYY" pattern="(0?[1-9]|[12][0-9]|3[01])[/.-](0?[1-9]|1[0-2])[/.-](19|20)\\d\\d|\\d{4}-\\d{2}-\\d{2}" title="Use DD/MM/YYYY, for example 23/04/1993" className="mt-1 bg-white" /></label>
              <label className="block text-sm font-semibold">Address<Input name="client_address" className="mt-1 bg-white" /></label>
            </div>
          )}
        </div>
        <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
          <div className="space-y-4">
            <label className="block text-sm font-semibold">Policy Type<Select name="policy_type" value={selectedType} onChange={(event) => changePolicyType(event.target.value as PolicyType)} className="mt-1">{policyTypes.map((item) => <option key={item}>{item}</option>)}</Select></label>
            <label className="block text-sm font-semibold">Business Class<Select name="insurance_category" value={insuranceCategory} onChange={(event) => changeInsuranceCategory(event.target.value as InsuranceCategory)} className="mt-1"><option>Life</option><option>Non-Life</option><option>Health</option></Select></label>
            {selectedType === "Motor" ? <label className="block text-sm font-semibold">Vehicle Number<Input name="vehicle_number" required defaultValue={policy?.vehicle_number ?? ""} placeholder="e.g. GR-4421-26" className="mt-1" /></label> : null}
            {selectedType === "Property" ? <label className="block text-sm font-semibold">Property Address/Location<Input name="property_location" required defaultValue={policy?.property_location ?? ""} placeholder="e.g. East Legon Hills, Accra" className="mt-1" /></label> : null}
            <InsurerAutocomplete category={insuranceCategory} value={insurerName} onChange={setInsurerName} />
            <label className="block text-sm font-semibold">Expiry Date<Input name="expiry_date" type="date" required defaultValue={policy?.expiry_date} className="mt-1" /></label>
            <label className="block text-sm font-semibold">Status<Select name="status" defaultValue={policy?.status ?? "Active"} className="mt-1">{policyStatuses.map((item) => <option key={item}>{item}</option>)}</Select></label>
            <label className="block text-sm font-semibold">Renewal Status<Select name="renewal_status" defaultValue={policy?.renewal_status ?? "Upcoming"} className="mt-1">{renewalStatuses.map((item) => <option key={item}>{item}</option>)}</Select></label>
          </div>
          <div className="space-y-4">
            <label className="block text-sm font-semibold">
              Policy Number
              <Input
                name="policy_number"
                required
                value={policyNumber}
                onChange={(event) => setPolicyNumber(event.target.value)}
                onBlur={() => setPolicyNumber(normalizedPolicyNumber)}
                placeholder="e.g. MOT/ENT/24590"
                pattern="[A-Za-z0-9./-]{3,40}"
                title={policyNumberHelpText}
                className="mt-1"
              />
              <span className={`mt-1 block text-xs ${showPolicyNumberError ? "text-danger" : "text-slate-500"}`}>
                {showPolicyNumberError ? policyNumberHelpText : "Lowercase is accepted and saved as uppercase."}
              </span>
            </label>
            <label className="block text-sm font-semibold">Start Date<Input name="start_date" type="date" required defaultValue={policy?.start_date} className="mt-1" /></label>
            <label className="block text-sm font-semibold">Premium Amount<Input name="premium_amount" type="number" min="0" step="0.01" required defaultValue={policy?.premium_amount} className="mt-1" /></label>
            <label className="block text-sm font-semibold">Commission Rate (%)<Input name="commission_rate" type="number" min="0" step="0.1" required defaultValue={policy?.commission?.commission_rate ?? 10} className="mt-1" /></label>
            <label className="block text-sm font-semibold">Payment Status<Select name="payment_status" defaultValue={policy?.commission?.payment_status ?? "Pending"} className="mt-1"><option>Pending</option><option>Paid</option></Select></label>
          </div>
        </div>
        <label className="block text-sm font-semibold md:col-span-2">Notes<Textarea name="notes" defaultValue={policy?.notes ?? ""} className="mt-1" /></label>
        <div className="md:col-span-2 mt-2 flex justify-end gap-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button>Save Policy</Button></div>
      </form>
    </ModalFrame>
  );
}

function ImportClientsModal({ onClose, onImport }: { onClose: () => void; onImport: (rows: ImportClientRow[]) => void }) {
  const [rows, setRows] = useState<ImportClientRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const rowErrors = useMemo(() => validateImportRows(rows), [rows]);
  const reviewWarnings = useMemo(() => importReviewWarnings(rows), [rows]);
  const importErrors = [...errors, ...rowErrors];
  const canImport = rows.length > 0 && importErrors.length === 0;
  const readyRows = useMemo(() => rows.filter((row, index) => importRowIssues(row, index + 2).length === 0 && importRowReviewNotes(row).length === 0).length, [rows]);
  const reviewRows = useMemo(() => rows.filter((row, index) => importRowIssues(row, index + 2).length === 0 && importRowReviewNotes(row).length > 0).length, [rows]);
  const blockedRows = useMemo(() => rows.filter((row, index) => importRowIssues(row, index + 2).length > 0).length, [rows]);

  function updateImportRow(index: number, field: keyof ImportClientRow, value: string) {
    setRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      if (field === "premium") {
        const premium = parseImportMoney(value);
        const commissionRate = row.commission_amount && premium ? roundPercent(row.commission_amount / premium * 100) : row.commission_rate;
        return { ...row, premium, commission_rate: commissionRate };
      }
      if (field === "commission_amount") {
        const commissionAmount = parseImportMoney(value);
        const commissionRate = commissionAmount && row.premium ? roundPercent(commissionAmount / row.premium * 100) : row.commission_rate;
        return { ...row, commission_amount: commissionAmount, commission_rate: commissionRate };
      }
      if (field === "commission_rate") {
        const commissionRate = Number(value);
        const safeRate = Number.isFinite(commissionRate) && commissionRate >= 0 ? commissionRate : undefined;
        const commissionAmount = safeRate !== undefined && row.premium ? Number((row.premium * safeRate / 100).toFixed(2)) : row.commission_amount;
        return { ...row, commission_rate: safeRate, commission_amount: commissionAmount };
      }
      if (field === "phone_number") return { ...row, phone_number: normalizeGhanaPhoneNumber(value) };
      if (field === "policy_number") return { ...row, policy_number: normalizePolicyNumber(value) };
      if (field === "insurer_name") return { ...row, insurer_name: resolveImportInsurerName(value, row.policy_type) ?? value };
      if (field === "policy_type") {
        const policyType = normalizeImportPolicyType(value);
        return { ...row, policy_type: policyType, insurer_name: resolveImportInsurerName(row.insurer_name, policyType) ?? row.insurer_name };
      }
      return { ...row, [field]: value };
    }));
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const parsed = await parseClientImportFile(file).catch(() => ({
      rows: [],
      errors: ["PolicyHQ could not read that file. Upload a CSV or Excel .xlsx file."]
    }));
    setRows(parsed.rows);
    setErrors(parsed.errors);
  }

  return (
    <ModalFrame title="Import Clients" onClose={onClose} wide>
      <div className="space-y-5">
        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-bold text-primary">Upload a CSV or Excel file.</p>
          <p className="mt-1">PolicyHQ will match common insurer columns automatically.</p>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-[0.12em] text-accent">What fields are supported?</summary>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
              PolicyHQ looks for client name, phone number, policy number, policy type, insurer, start date, end date, premium, commission, vehicle, property, email, date of birth, and notes. Missing non-blocking fields import as Needs Review.
            </p>
          </details>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={downloadClientImportTemplate}><Download className="h-4 w-4" /> Download Template</Button>
          <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 font-semibold text-slate-900 hover:border-accent hover:text-accent">
            <Upload className="h-4 w-4" /> Upload File
            <input type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={handleFile} />
          </label>
        </div>
        {errors.length ? (
          <div className="rounded-xl bg-danger/10 p-4 text-sm font-semibold text-danger">
            {errors.map((error) => <p key={error}>{error}</p>)}
          </div>
        ) : null}
        {rows.length ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <ImportSummaryCard label="Rows Loaded" value={rows.length} tone="slate" />
              <ImportSummaryCard label="Ready" value={readyRows} tone="green" />
              <ImportSummaryCard label="Needs Review" value={reviewRows} tone="amber" />
              <ImportSummaryCard label="Must Fix" value={blockedRows} tone="red" />
            </div>
            {rowErrors.length ? (
              <div className="rounded-xl bg-warning/10 p-4 text-sm font-semibold text-warning">
                <p className="mb-2 font-extrabold text-primary">Fix these before importing.</p>
                {rowErrors.slice(0, 8).map((error) => <p key={error}>{error}</p>)}
                {rowErrors.length > 8 ? <p>Plus {rowErrors.length - 8} more item{rowErrors.length - 8 === 1 ? "" : "s"} to fix.</p> : null}
              </div>
            ) : reviewWarnings.length ? (
              <div className="rounded-xl bg-warning/10 p-4 text-sm font-semibold text-warning">
                <p className="font-extrabold text-primary">{reviewRows} row{reviewRows === 1 ? "" : "s"} will be imported as Needs Review.</p>
                {reviewWarnings.slice(0, 5).map((warning) => <p key={warning}>{warning}</p>)}
                {reviewWarnings.length > 5 ? <p>Plus {reviewWarnings.length - 5} more review note{reviewWarnings.length - 5 === 1 ? "" : "s"}.</p> : null}
              </div>
            ) : (
              <div className="rounded-xl bg-success/10 p-4 text-sm font-semibold text-success">All rows look ready to import.</div>
            )}
            <div className="max-h-[64vh] space-y-4 overflow-y-auto pr-1">
              {rows.map((row, index) => (
                <ImportRowCard
                  key={`${row.policy_number}-${index}`}
                  row={row}
                  index={index}
                  issues={importRowIssues(row, index + 2)}
                  reviewNotes={importRowReviewNotes(row)}
                  onUpdate={(field, value) => updateImportRow(index, field, value)}
                />
              ))}
            </div>
          </div>
        ) : null}
        <div className="sticky bottom-0 -mx-6 flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={!canImport} onClick={() => onImport(rows)}>Import Rows</Button>
        </div>
      </div>
    </ModalFrame>
  );
}

function ImportSummaryCard({ label, value, tone }: { label: string; value: number; tone: "slate" | "green" | "amber" | "red" }) {
  const color = tone === "green" ? "text-success" : tone === "amber" ? "text-warning" : tone === "red" ? "text-danger" : "text-primary";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <strong className={`mt-1 block text-2xl font-extrabold ${color}`}>{value}</strong>
    </div>
  );
}

function ImportRowCard({ row, index, issues, reviewNotes, onUpdate }: { row: ImportClientRow; index: number; issues: string[]; reviewNotes: string[]; onUpdate: (field: keyof ImportClientRow, value: string) => void }) {
  const status = issues.length ? { label: "Must Fix", tone: "red" as const } : reviewNotes.length ? { label: "Needs Review", tone: "amber" as const } : { label: "Ready", tone: "green" as const };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-extrabold text-primary">Row {index + 2}</h3>
          <p className="text-sm font-semibold text-slate-500">{row.client_name || "Client name needed"} · {row.policy_number || "Policy number needed"}</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      {issues.length ? (
        <div className="mb-4 rounded-xl bg-danger/10 p-3 text-xs font-bold leading-5 text-danger">
          {issues.map((issue) => <p key={issue}>{issue}</p>)}
        </div>
      ) : reviewNotes.length ? (
        <div className="mb-4 rounded-xl bg-warning/10 p-3 text-xs font-bold leading-5 text-warning">
          {reviewNotes.map((note) => <p key={note}>{note}</p>)}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <ImportField label="Client" value={row.client_name} onChange={(value) => onUpdate("client_name", value)} required />
        <ImportField label="Phone" value={row.phone_number} onChange={(value) => onUpdate("phone_number", value)} review={!row.phone_number.trim()} />
        <ImportField label="Policy No." value={row.policy_number} onChange={(value) => onUpdate("policy_number", value)} required />
        <label className="block text-sm font-semibold">
          Type
          <Select value={row.policy_type} onChange={(event) => onUpdate("policy_type", event.target.value)} className={`mt-1 ${!row.policy_type ? "border-warning bg-warning/10" : ""}`}>
            <option value="">Choose type</option>
            {policyTypes.map((type) => <option key={type}>{type}</option>)}
          </Select>
        </label>
        <ImportField label="Insurer" value={row.insurer_name} onChange={(value) => onUpdate("insurer_name", value)} required />
        <ImportField label="End Date" type="date" value={row.policy_end_date} onChange={(value) => onUpdate("policy_end_date", value)} required />
        <ImportField label="Premium" type="number" value={row.premium ? String(row.premium) : ""} onChange={(value) => onUpdate("premium", value)} review={row.premium === undefined} />
      </div>
      <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">More fields</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <ImportField label="Start Date" type="date" value={row.policy_start_date} onChange={(value) => onUpdate("policy_start_date", value)} review={!row.policy_start_date} />
          {row.policy_type === "Motor" ? <ImportField label="Vehicle Number" value={row.vehicle_number ?? ""} onChange={(value) => onUpdate("vehicle_number", value)} review={!row.vehicle_number?.trim()} /> : null}
          {row.policy_type === "Property" ? <ImportField label="Property Location" value={row.property_location ?? ""} onChange={(value) => onUpdate("property_location", value)} review={!row.property_location?.trim()} /> : null}
          <ImportField label="Commission Amount" type="number" value={row.commission_amount ? String(row.commission_amount) : ""} onChange={(value) => onUpdate("commission_amount", value)} />
          <ImportField label="Commission Rate" type="number" value={row.commission_rate !== undefined ? String(row.commission_rate) : ""} onChange={(value) => onUpdate("commission_rate", value)} review={row.commission_rate === undefined} />
          <label className="block text-sm font-semibold">
            Commission Status
            <Select value={row.commission_status ?? "Pending"} onChange={(event) => onUpdate("commission_status", event.target.value)} className="mt-1">
              <option>Paid</option>
              <option>Pending</option>
            </Select>
          </label>
          <ImportField label="Payment Date" type="date" value={row.commission_payment_date ?? ""} onChange={(value) => onUpdate("commission_payment_date", value)} />
        </div>
      </details>
    </div>
  );
}

function ImportField({ label, value, onChange, required = false, review = false, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; review?: boolean; type?: "text" | "date" | "number" }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <ImportInput type={type} value={value} onChange={onChange} required={required} review={review} />
    </label>
  );
}

function ImportInput({ value, onChange, required = false, review = false, type = "text" }: { value: string; onChange: (value: string) => void; required?: boolean; review?: boolean; type?: "text" | "date" | "number" }) {
  return (
    <Input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`mt-1 ${(required && !value.trim()) || review ? "border-warning bg-warning/10" : ""}`}
    />
  );
}

function InsurerAutocomplete({ category, value, onChange }: { category: InsuranceCategory; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const suggestions = useMemo(() => {
    const search = value.trim().toLowerCase();
    return insuranceCompanies
      .filter((company) => company.category === category)
      .filter((company) => !search || company.name.toLowerCase().includes(search))
      .slice(0, 8);
  }, [category, value]);

  return (
    <label className="relative block text-sm font-semibold">
      Insurer
      <Input
        name="insurer_name"
        required
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={`Search and choose a ${category.toLowerCase()} insurer`}
        autoComplete="off"
        className="mt-1"
      />
      {open && suggestions.length ? (
        <div className="absolute z-[70] mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-soft">
          {suggestions.map((company) => (
            <button
              key={company.name}
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(company.name);
                setOpen(false);
              }}
            >
              <span>{company.name}</span>
              <BusinessClassBadge value={company.category} />
            </button>
          ))}
        </div>
      ) : null}
      <p className="mt-1 text-xs font-medium text-slate-500">Select one of the approved suggestions to keep reports clean.</p>
    </label>
  );
}

function BusinessClassBadge({ value }: { value: InsuranceCategory }) {
  return <Badge tone={value === "Life" ? "green" : value === "Health" ? "orange" : "slate"}>{value}</Badge>;
}

function NeedsReviewBadge({ policy }: { policy: PolicyWithClient }) {
  return needsPolicyReview(policy) ? <Badge tone="amber">Needs Review</Badge> : null;
}

function PolicyReviewSummary({ policy, compact = false }: { policy: PolicyWithClient; compact?: boolean }) {
  if (!needsPolicyReview(policy)) return null;
  const note = policy.notes?.replace(/^Needs Review:\s*/i, "").trim();
  const text = note || "Open this policy and fill the missing details.";
  return (
    <p className={`${compact ? "mt-1 max-w-xs" : "mt-3 rounded-xl bg-warning/10 p-3"} text-xs font-bold leading-5 text-warning`}>
      {compact ? `Review: ${text}` : text}
    </p>
  );
}

function ExistingClientDetails({ client }: { client: Client }) {
  return (
    <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
      <label className="block text-sm font-semibold">Full Name<Input readOnly value={client.full_name} className="mt-1 bg-slate-50" /></label>
      <label className="block text-sm font-semibold">Phone Number<Input readOnly value={client.phone_number} className="mt-1 bg-slate-50" /></label>
      <label className="block text-sm font-semibold">Email<Input readOnly value={client.email || "No email"} className="mt-1 bg-slate-50" /></label>
      <label className="block text-sm font-semibold">Date of Birth<Input readOnly value={client.date_of_birth ? formatDate(client.date_of_birth) : "Not recorded"} className="mt-1 bg-slate-50" /></label>
      <label className="block text-sm font-semibold md:col-span-2">Address<Textarea readOnly value={client.address || "No address recorded"} className="mt-1 min-h-16 bg-slate-50" /></label>
    </div>
  );
}

function PolicyDetailPanel({ policy, onClose, updateRenewal, saveNote }: { policy: PolicyWithClient; onClose: () => void; updateRenewal: (id: string, status: RenewalStatus) => void; saveNote: (input: { client_id?: string; policy_id?: string; note_text: string }) => void }) {
  const commission = policy.commission;
  const [noteText, setNoteText] = useState("");
  function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveNote({ client_id: policy.client_id, policy_id: policy.id, note_text: noteText });
    setNoteText("");
  }
  const rows = [
    ["Policy Number", policy.policy_number],
    ["Type", policy.policy_type],
    ["Business Class", policy.insurance_category ?? insuranceCategoryForPolicyType(policy.policy_type)],
    ...(policy.policy_type === "Motor" ? [["Vehicle Number", policy.vehicle_number ?? "—"]] : []),
    ...(policy.policy_type === "Property" ? [["Property Address/Location", policy.property_location ?? "—"]] : []),
    ["Insurer", policy.insurer_name],
    ["Start Date", formatDate(policy.start_date)],
    ["Expiry Date", formatDate(policy.expiry_date)],
    ["Premium", formatCurrency(policy.premium_amount)],
    ["Status", policy.status],
    ["Urgency", <UrgencyBadge key="urgency" date={policy.expiry_date} status={policy.renewal_status} />],
    ["Commission Rate", commission ? `${commission.commission_rate}%` : "—"],
    ["Commission Amount", commission ? formatCurrency(policy.premium_amount * commission.commission_rate / 100) : "—"],
    ["Payment Status", commission?.payment_status ?? "—"],
    ["Payment Date", commission?.payment_date ? formatDate(commission.payment_date) : "—"]
  ];
  return <div className="fixed inset-y-0 right-0 z-[55] w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-soft"><div className="mb-6 flex items-center justify-between"><div><h2 className="text-2xl font-extrabold">Policy Detail</h2><div className="mt-2"><NeedsReviewBadge policy={policy} /></div></div><Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button></div><div className="space-y-5"><Card><CardContent className="space-y-3 p-5"><h3 className="font-bold">{policy.client.full_name}</h3><p>{policy.client.phone_number}</p><p>{policy.client.email || "No email"}</p><p>{policy.client.date_of_birth ? `Birthday: ${formatDate(policy.client.date_of_birth)}` : "Birthday not recorded"}</p><div className="flex flex-wrap gap-2"><WhatsAppButton href={clientWhatsAppHref(policy.client)} label="WhatsApp Client" /><WhatsAppButton href={renewalWhatsAppHref(policy)} label="Send Renewal Reminder" /></div></CardContent></Card><Card><CardContent className="p-4"><label className="block text-sm font-semibold">Renewal Status<Select value={policy.renewal_status} onChange={(event) => updateRenewal(policy.id, event.target.value as RenewalStatus)} className="mt-1">{renewalStatuses.map((status) => <option key={status}>{status}</option>)}</Select></label></CardContent></Card><dl className="grid grid-cols-2 gap-4 text-sm">{rows.map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3"><dt className="font-bold text-slate-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl><Card><CardHeader><h3 className="font-bold">Policy Notes</h3></CardHeader><CardContent><p className="text-sm leading-6 text-slate-600">{policy.notes || "No policy notes recorded."}</p></CardContent></Card><ActivityNotesCard notes={policy.activity_notes ?? []} value={noteText} onChange={setNoteText} onSubmit={submitNote} /></div></div>;
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><div className="mt-1 font-semibold">{value}</div></div>;
}

function ConfirmModal({ title, body, onClose, onConfirm }: { title: string; body: string; onClose: () => void; onConfirm: () => Promise<void> | void }) {
  return <ModalFrame title={title} onClose={onClose} narrow><p className="text-slate-600">{body}</p><div className="mt-6 flex justify-end gap-3"><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={onConfirm}>Delete</Button></div></ModalFrame>;
}

function DemoModal({ onClose }: { onClose: () => void }) {
  return <ModalFrame title="Create your free account" onClose={onClose} narrow><p className="text-slate-600">This feature is available to registered agents. Create your free PolicyHQ account to get started.</p><div className="mt-6 flex flex-wrap gap-3"><Button asChild><Link href="/sign-up">Sign Up Free</Link></Button><Button variant="outline" onClick={onClose}>Continue Browsing Demo</Button></div></ModalFrame>;
}

function ModalFrame({ title, children, onClose, narrow = false, wide = false }: { title: string; children: ReactNode; onClose: () => void; narrow?: boolean; wide?: boolean }) {
  const width = narrow ? "max-w-md" : wide ? "max-w-6xl" : "max-w-3xl";
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-3 sm:p-4"><Card className={`max-h-[94vh] w-full overflow-y-auto ${width}`}><CardHeader className="flex flex-row items-center justify-between"><h2 className="text-xl font-extrabold">{title}</h2><Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button></CardHeader><CardContent>{children}</CardContent></Card></div>;
}

function Avatar({ profile, large = false }: { profile: AppData["profile"]; large?: boolean }) {
  if (profile.avatar_url) {
    const size = large ? 96 : 40;
    return <Image src={profile.avatar_url} alt="" width={size} height={size} className={`${large ? "h-24 w-24" : "h-10 w-10"} rounded-full object-cover`} />;
  }
  return <div className={`${large ? "h-24 w-24 text-3xl" : "h-10 w-10 text-sm"} flex items-center justify-center rounded-full bg-accent/10 font-extrabold text-accent`}>{firstName(profile.full_name)[0]}</div>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  return <div className="overflow-auto"><table className="w-full min-w-[720px] text-sm"><thead className="sticky top-0 bg-slate-50"><tr>{headers.map((h) => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-t odd:bg-white even:bg-slate-50">{row.map((cell, j) => <td key={j} className="px-4 py-3">{cell}</td>)}</tr>)}</tbody></table></div>;
}

function Empty({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return <Card><CardContent className="flex min-h-96 flex-col items-center justify-center text-center"><FileText className="h-12 w-12 text-slate-300" /><h1 className="mt-4 text-xl font-bold">{title}</h1><Button className="mt-5" onClick={onAction}>{action}</Button></CardContent></Card>;
}

function BirthdayDashboardCard({ clients }: { clients: Client[] }) {
  return (
    <Card className="min-h-[260px] overflow-hidden">
      <CardHeader className="border-b-0 p-[26px] pb-0">
        <h2 className="flex items-center gap-2 text-2xl font-extrabold leading-[30px] text-primary">
          <Cake className="h-5 w-5 text-accent" /> Today’s Birthdays
        </h2>
      </CardHeader>
      <CardContent className="space-y-4 p-[26px] pt-[26px]">
        {clients.length ? clients.map((client) => (
          <div key={client.id} className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold text-primary">{client.full_name}</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-500">{client.phone_number}</p>
            </div>
            <WhatsAppButton href={birthdayWhatsAppHref(client)} label="WhatsApp" />
          </div>
        )) : <p className="text-sm font-semibold text-slate-500">No client birthdays today.</p>}
      </CardContent>
    </Card>
  );
}

function ActivityNotesCard({ notes, value, onChange, onSubmit }: { notes: ActivityNote[]; value: string; onChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <Card>
      <CardHeader><h3 className="font-bold">Activity Notes</h3></CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="space-y-3">
          <Textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="Add a short follow-up note" className="min-h-20" />
          <Button disabled={!value.trim()}>Add Note</Button>
        </form>
        <div className="space-y-3">
          {notes.length ? notes.map((note) => (
            <div key={note.id} className="rounded-xl bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-800">{note.note_text}</p>
              <p className="mt-2 text-xs font-bold uppercase text-slate-400">{formatDate(note.created_at)} · {note.author_name ?? "Agent"}</p>
            </div>
          )) : <p className="text-sm font-semibold text-slate-500">No activity notes yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function WhatsAppButton({ href, label, className = "" }: { href: string; label: string; className?: string }) {
  return <Button asChild size="sm" variant="outline" className={className}><a href={href} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> {label}</a></Button>;
}

function CommissionStatusBadge({ status }: { status: CommissionDisplayStatus }) {
  if (status === "Paid") return <Badge tone="green">Paid</Badge>;
  if (status === "Overdue") return <Badge tone="red">Overdue</Badge>;
  return <Badge tone="slate">Pending</Badge>;
}

function CommissionAction({ commission, status, confirming, flagged, onStart, onCancel, onConfirm, onFlag, onView, mobile = false }: { commission: Commission; status: CommissionDisplayStatus; confirming: boolean; flagged: boolean; onStart: () => void; onCancel: () => void; onConfirm: () => void; onFlag: () => void; onView: () => void; mobile?: boolean }) {
  if (status === "Paid") return <Button variant="ghost" className={mobile ? "mt-4 w-full" : ""} onClick={onView}>View Details</Button>;
  if (confirming) {
    return (
      <div className={`flex items-center gap-2 ${mobile ? "mt-4" : ""}`}>
        <span className="text-sm font-bold text-primary">Confirm?</span>
        <Button size="sm" onClick={onConfirm}>Yes</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    );
  }
  return (
    <div className={`flex flex-wrap gap-2 ${mobile ? "mt-4" : ""}`}>
      <Button size="sm" className={mobile ? "flex-1" : ""} onClick={onStart}>Mark as Paid</Button>
      {status === "Overdue" ? <Button size="sm" variant="outline" onClick={onFlag}><Flag className="h-4 w-4" /> {flagged ? "Flagged" : "Flag"}</Button> : null}
    </div>
  );
}

function UrgencyBadge({ date, status }: { date: string; status?: RenewalStatus }) {
  const level = renewalUrgency(date, status);
  const tone = level === "Overdue" || level === "Critical" ? "red" : level === "Urgent" || level === "Watch" ? "amber" : "green";
  return <Badge tone={tone}>{level}</Badge>;
}

function commissionTotal(commissions: Commission[], policies: PolicyWithClient[]) {
  return commissions.reduce((sum, commission) => {
    const policy = policies.find((item) => item.id === commission.policy_id);
    return sum + (policy ? policy.premium_amount * commission.commission_rate / 100 : 0);
  }, 0);
}

function daysBetween(startDate: string, endDate: Date) {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  return Math.max(0, Math.floor((end - start) / 86400000));
}

function isCurrentMonth(value: string | null) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00Z`);
  const today = new Date();
  return date.getUTCFullYear() === today.getUTCFullYear() && date.getUTCMonth() === today.getUTCMonth();
}

function commissionEarnedDate(commission: Commission) {
  return commission.payment_date ?? commission.created_at.slice(0, 10);
}

function sortCommissionItems(a: { displayStatus: CommissionDisplayStatus; daysPending: number; amount: number; commission: Commission }, b: { displayStatus: CommissionDisplayStatus; daysPending: number; amount: number; commission: Commission }) {
  const rank: Record<CommissionDisplayStatus, number> = { Overdue: 0, Pending: 1, Paid: 2 };
  if (rank[a.displayStatus] !== rank[b.displayStatus]) return rank[a.displayStatus] - rank[b.displayStatus];
  if (a.displayStatus === "Overdue") return b.daysPending - a.daysPending;
  if (a.displayStatus === "Pending") return b.amount - a.amount;
  return new Date(b.commission.payment_date ?? 0).getTime() - new Date(a.commission.payment_date ?? 0).getTime();
}

function shortInsurerName(name: string) {
  return name
    .replace(/\b(Insurance|Assurance|Company|Limited|Ltd\.?|Ghana|PLC)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || name;
}

function clientRows(clients: Client[], policies: PolicyWithClient[]) {
  return clients.map((client) => ({
    "Full Name": client.full_name,
    "Phone Number": client.phone_number,
    Email: client.email ?? "",
    "Date of Birth": client.date_of_birth ? formatDate(client.date_of_birth) : "",
    Address: client.address ?? "",
    "Number of Policies": policies.filter((policy) => policy.client_id === client.id).length,
    "Date Added": formatDate(client.created_at)
  }));
}

function policyRows(policies: PolicyWithClient[]) {
  return policies.map((policy) => ({
    "Client Name": policy.client.full_name,
    "Policy Number": policy.policy_number,
    Type: policy.policy_type,
    "Business Class": policy.insurance_category ?? insuranceCategoryForPolicyType(policy.policy_type),
    "Vehicle Number": policy.policy_type === "Motor" ? policy.vehicle_number ?? "" : "",
    "Property Address/Location": policy.policy_type === "Property" ? policy.property_location ?? "" : "",
    Insurer: policy.insurer_name,
    "Start Date": formatDate(policy.start_date),
    "Expiry Date": formatDate(policy.expiry_date),
    Premium: formatCurrency(policy.premium_amount),
    Status: policy.status,
    "Renewal Status": policy.renewal_status,
    Review: needsPolicyReview(policy) ? "Needs Review" : ""
  }));
}

function commissionRows(commissions: Commission[], policies: PolicyWithClient[]) {
  return commissions.flatMap((commission) => {
    const policy = policies.find((item) => item.id === commission.policy_id);
    if (!policy) return [];
    return {
      "Client Name": policy.client.full_name,
      "Policy Number": policy.policy_number,
      "Policy Type": policy.policy_type,
      "Business Class": policy.insurance_category ?? insuranceCategoryForPolicyType(policy.policy_type),
      Insurer: policy.insurer_name,
      Premium: formatCurrency(policy.premium_amount),
      "Commission Rate": `${commission.commission_rate}%`,
      "Commission Amount": formatCurrency(policy.premium_amount * commission.commission_rate / 100),
      "Payment Status": commission.payment_status,
      "Payment Date": commission.payment_date ? formatDate(commission.payment_date) : ""
    };
  });
}

function navHref(base: string, section: Section) {
  if (base) return section === "dashboard" ? base : `${base}/${section}`;
  return section === "dashboard" ? "/dashboard" : `/${section}`;
}

function policiesForClient(policies: PolicyWithClient[], clientId: string) {
  return policies.filter((policy) => policy.client_id === clientId);
}

function needsPolicyReview(policy: PolicyWithClient) {
  return policy.notes?.startsWith("Needs Review:") ?? false;
}

function renewalWhatsAppHref(policy: PolicyWithClient) {
  const message = `Hello ${policy.client.full_name}, this is a reminder that your ${policy.policy_type} policy expires on ${formatDate(policy.expiry_date)}. Kindly let me know when you would like us to start the renewal process. Thank you.`;
  return whatsAppUrl(policy.client.phone_number, message);
}

function lapseShieldWhatsAppHref(policy: PolicyWithClient) {
  const message = `Hello ${policy.client.full_name}, I am checking in on your ${policy.policy_type} policy. Please confirm whether your latest premium payment has gone through so we can keep the policy active. Thank you.`;
  return whatsAppUrl(policy.client.phone_number, message);
}

function clientWhatsAppHref(client: Client) {
  return whatsAppUrl(client.phone_number, `Hello ${client.full_name}, thank you for trusting us. How may I help you today?`);
}

function birthdayWhatsAppHref(client: Client) {
  return whatsAppUrl(client.phone_number, `Happy Birthday ${client.full_name}! Wishing you good health, happiness, and a wonderful year ahead. Thank you for trusting us.`);
}

function prospectWhatsAppHref(prospect: Prospect) {
  return whatsAppUrl(prospect.phone_number, `Hello ${prospect.full_name}, thank you for your interest. I am following up to see how I can help with your insurance needs.`);
}

function isTodayOrPast(value: string) {
  const today = new Date();
  const target = new Date(`${value}T00:00:00`);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return target.getTime() <= today.getTime();
}

function isProspectDueToday(prospect: Prospect) {
  if (!prospect.follow_up_date || ["Converted", "Not Interested"].includes(prospect.status)) return false;
  const today = new Date().toISOString().slice(0, 10);
  return prospect.follow_up_date === today;
}

function localDate(value?: string | null) {
  const date = value ? new Date(`${value}T00:00:00`) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function weekBounds(offsetWeeks: number) {
  const today = startOfLocalDay(new Date());
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = addDays(today, mondayOffset + offsetWeeks * 7);
  const end = addDays(start, 6);
  return { start, end };
}

function prospectMatchesTimeFilter(prospect: Prospect, filter: ProspectTimeFilter) {
  if (filter === "All") return true;
  const date = localDate(prospect.follow_up_date);
  if (!date) return false;
  const today = startOfLocalDay(new Date());
  if (filter === "Today") return date.getTime() <= today.getTime();
  if (filter === "This Week") {
    const { start, end } = weekBounds(0);
    return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
  }
  if (filter === "Next Week") {
    const { start, end } = weekBounds(1);
    return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
  }
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return date.getTime() >= monthStart.getTime() && date.getTime() <= monthEnd.getTime();
}

function prospectMatchesStatusFilter(prospect: Prospect, filter: ProspectStatusFilter) {
  if (filter === "All Active") return prospect.status !== "Converted" && prospect.status !== "Not Interested";
  return prospect.status === filter;
}

function sortProspectsByFollowUp(prospects: Prospect[]) {
  return [...prospects].sort((a, b) => {
    const aInactive = a.status === "Converted" || a.status === "Not Interested";
    const bInactive = b.status === "Converted" || b.status === "Not Interested";
    if (aInactive !== bInactive) return aInactive ? 1 : -1;
    const aTime = localDate(a.follow_up_date)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bTime = localDate(b.follow_up_date)?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    return a.full_name.localeCompare(b.full_name);
  });
}

function prospectQueueMetrics(prospects: Prospect[]) {
  const today = startOfLocalDay(new Date());
  const todayKey = dateKey(today);
  const { start, end } = weekBounds(0);
  const active = prospects.filter((prospect) => prospect.status !== "Converted" && prospect.status !== "Not Interested");
  return {
    overdue: active.filter((prospect) => {
      const date = localDate(prospect.follow_up_date);
      return date ? date.getTime() < today.getTime() : false;
    }).length,
    today: active.filter((prospect) => prospect.follow_up_date === todayKey).length,
    thisWeek: active.filter((prospect) => {
      const date = localDate(prospect.follow_up_date);
      return date ? date.getTime() >= start.getTime() && date.getTime() <= end.getTime() : false;
    }).length,
    converted: prospects.filter((prospect) => prospect.status === "Converted").length
  };
}

function prospectFollowUpLabel(prospect: Prospect) {
  if (prospect.status === "Converted") return { label: "Converted", tone: "success" as const };
  if (prospect.status === "Not Interested") return { label: "Closed", tone: "muted" as const };
  const date = localDate(prospect.follow_up_date);
  if (!date) return { label: "No date", tone: "muted" as const };
  const today = startOfLocalDay(new Date());
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return { label: `Overdue · ${formatDate(prospect.follow_up_date!)}`, tone: "danger" as const };
  if (diffDays === 0) return { label: "Today", tone: "warning" as const };
  if (diffDays === 1) return { label: "Tomorrow", tone: "orange" as const };
  return { label: formatDate(prospect.follow_up_date!), tone: "neutral" as const };
}

function prospectFollowUpToneClass(tone: "danger" | "warning" | "orange" | "neutral" | "success" | "muted") {
  if (tone === "danger") return "bg-danger/10 text-danger";
  if (tone === "warning") return "bg-amber-100 text-amber-700";
  if (tone === "orange") return "bg-accent/10 text-accent";
  if (tone === "success") return "bg-success/10 text-success";
  if (tone === "muted") return "bg-slate-100 text-slate-500";
  return "bg-slate-50 text-slate-600";
}

function ProspectStatusBadge({ status }: { status: ProspectStatus }) {
  const tone = status === "Interested" ? "green" : status === "Call Back" ? "amber" : status === "Converted" ? "orange" : status === "Not Interested" ? "red" : "slate";
  return <Badge tone={tone}>{status}</Badge>;
}

function formatDashboardCurrency(value: number) {
  const hasPesewas = Math.round(value * 100) % 100 !== 0;
  return `GHS ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: hasPesewas ? 2 : 0,
    maximumFractionDigits: hasPesewas ? 2 : 0
  }).format(value)}`;
}

function dashboardActivities(data: AppData, birthdays: Client[], base: string, openPolicy: (policy: PolicyWithClient) => void): DashboardActivity[] {
  const policyById = new Map(data.policies.map((policy) => [policy.id, policy]));
  const activities: DashboardActivity[] = [];

  for (const policy of [...data.policies].sort((a, b) => activityTime(b.updated_at ?? b.created_at) - activityTime(a.updated_at ?? a.created_at)).slice(0, 4)) {
    activities.push({
      id: `policy-${policy.id}`,
      title: `${policy.client.full_name} · ${policy.policy_type}`,
      body: `${policy.policy_number} · ${policy.renewal_status}`,
      badge: policy.renewal_status,
      tone: policy.renewal_status === "Renewed" ? "success" : policy.renewal_status === "Lost" ? "danger" : "warning",
      createdAt: policy.updated_at ?? policy.created_at,
      onClick: () => openPolicy(policy)
    });
  }

  for (const prospect of data.prospects.filter(isProspectDueToday).slice(0, 2)) {
    activities.push({
      id: `prospect-${prospect.id}`,
      title: `${prospect.full_name} · prospect follow-up`,
      body: prospect.notes || `Status: ${prospect.status}`,
      badge: "Follow up",
      tone: "warning",
      createdAt: prospect.follow_up_date ? `${prospect.follow_up_date}T12:00:00` : prospect.created_at,
      href: `${navHref(base, "prospects")}?filter=today`
    });
  }

  for (const client of birthdays.slice(0, 2)) {
    activities.push({
      id: `birthday-${client.id}`,
      title: `${client.full_name} · birthday today`,
      body: "Relationship touchpoint ready",
      badge: "Birthday",
      tone: "accent",
      createdAt: new Date().toISOString(),
      href: `${base}/birthdays`
    });
  }

  for (const commission of [...data.commissions].sort((a, b) => activityTime(commissionActivityDate(b)) - activityTime(commissionActivityDate(a))).slice(0, 3)) {
    const policy = policyById.get(commission.policy_id);
    if (!policy) continue;
    activities.push({
      id: `commission-${commission.id}`,
      title: `${policy.client.full_name} · commission ${commission.payment_status.toLowerCase()}`,
      body: `${formatCurrency(commission.commission_amount)} · ${policy.policy_number}`,
      badge: commission.payment_status,
      tone: commission.payment_status === "Paid" ? "success" : "warning",
      createdAt: commissionActivityDate(commission),
      href: navHref(base, "commissions")
    });
  }

  return activities.sort((a, b) => activityTime(b.createdAt) - activityTime(a.createdAt)).slice(0, 5);
}

function commissionActivityDate(commission: Commission) {
  return commission.payment_date ? `${commission.payment_date}T12:00:00` : commission.created_at;
}

function activityTime(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function dashboardFocusConfig(focus: "birthdays" | "anniversaries" | "life-retention" | "lapse-shield" | "recovered-life", birthdays: number, anniversaries: number, lifeRetention: number, recoveredLife: number, activeLapseCases: number, base: string) {
  if (focus === "birthdays") {
    return {
      title: "Birthdays Today",
      description: "Clients with birthdays today and quick relationship actions.",
      emptyTitle: "No birthdays today.",
      metrics: [
        { label: "Birthdays", value: birthdays, href: `${base}/birthdays`, tone: birthdays ? "accent" : "primary", helper: "Today" },
        { label: "WhatsApp Ready", value: birthdays, href: `${base}/birthdays`, tone: "success", helper: "Messages" },
        { label: "Follow-ups", value: 0, href: `${navHref(base, "prospects")}?filter=today`, tone: "primary", helper: "Prospects" }
      ] satisfies DashboardPanelMetric[]
    };
  }
  if (focus === "anniversaries") {
    return {
      title: "Policy Anniversaries",
      description: "Policies reaching an anniversary in the next 7 days.",
      emptyTitle: "No anniversaries due this week.",
      metrics: [
        { label: "Anniversaries", value: anniversaries, href: `${base}/anniversaries`, tone: "success", helper: "Next 7 days" },
        { label: "Reviews", value: anniversaries, href: `${base}/anniversaries`, tone: "accent", helper: "Coverage" },
        { label: "Policies", value: anniversaries, href: navHref(base, "policies"), tone: "primary", helper: "Linked" }
      ] satisfies DashboardPanelMetric[]
    };
  }
  if (focus === "life-retention") {
    return {
      title: "At Risk Life",
      description: "Active life policies still inside the year 1-3 lapse danger zone.",
      emptyTitle: "No at-risk life policies right now.",
      metrics: [
        { label: "At Risk Life", value: lifeRetention, href: `${base}/life-retention`, tone: lifeRetention ? "warning" : "success", helper: "Years 1-3" },
        { label: "Recovered", value: recoveredLife, href: `${base}/life-retention/recovered`, tone: "success", helper: "Renewed" },
        { label: "Life Book", value: lifeRetention + recoveredLife, href: navHref(base, "policies"), tone: "primary", helper: "Tracked" }
      ] satisfies DashboardPanelMetric[]
    };
  }
  if (focus === "recovered-life") {
    return {
      title: "Recovered Life",
      description: "Life policies marked as recovered or renewed after follow-up.",
      emptyTitle: "No recovered life policies yet.",
      metrics: [
        { label: "Recovered", value: recoveredLife, href: `${base}/life-retention/recovered`, tone: "success", helper: "Renewed" },
        { label: "At Risk Life", value: lifeRetention, href: `${base}/life-retention`, tone: lifeRetention ? "warning" : "success", helper: "Watch" },
        { label: "Policies", value: recoveredLife, href: navHref(base, "policies"), tone: "primary", helper: "Life" }
      ] satisfies DashboardPanelMetric[]
    };
  }
  return {
    title: "Lapse Shield",
    description: "Statement review workspace for life policy lapse protection.",
    emptyTitle: "No statement review yet.",
    metrics: [
      { label: "Active Cases", value: activeLapseCases, href: `${base}/lapse-shield`, tone: activeLapseCases ? "danger" : "success", helper: activeLapseCases ? "Needs follow-up" : "Clear" },
      { label: "At Risk Life", value: lifeRetention, href: `${base}/life-retention`, tone: lifeRetention ? "warning" : "success", helper: "Years 1-3" },
      { label: "Recovered", value: recoveredLife, href: `${base}/life-retention/recovered`, tone: "success", helper: "Renewed" }
    ] satisfies DashboardPanelMetric[]
  };
}

function dashboardRevenueAction(mix: DashboardBusinessMix, metrics: DashboardPanelMetric[], base: string) {
  const valueFor = (label: string) => metrics.find((metric) => metric.label === label)?.value ?? 0;
  if (mix === "life") {
    const missing = valueFor("Missing Statement");
    const atRisk = valueFor("At Risk Life");
    if (missing) return { title: "Lapse Shield", body: `${missing} clients missing from the latest commission statement.`, badge: "Review", tone: "danger" as const, href: `${base}/lapse-shield` };
    if (atRisk) return { title: "Life retention watch", body: `${atRisk} clients are still inside the year 1-3 danger zone.`, badge: "Watch", tone: "warning" as const, href: `${base}/life-retention` };
    return { title: "Life book stable", body: "No immediate lapse or statement risk showing today.", badge: "Clear", tone: "success" as const, href: `${base}/life-retention` };
  }

  if (mix === "mixed") {
    const week = valueFor("This Week");
    const missing = valueFor("Missing Statement");
    if (missing && !week) return { title: "Highest risk today", body: `${missing} life statement gaps need review.`, badge: "Act Now", tone: "danger" as const, href: `${base}/lapse-shield` };
    if (week || missing) return { title: "Highest risk today", body: `${missing} life statement gaps + ${week} policies expiring this week.`, badge: "Act Now", tone: "danger" as const, href: `${base}/renewals/week` };
    return { title: "Mixed book stable", body: "No critical renewal or life-retention action today.", badge: "Clear", tone: "success" as const, href: `${base}/renewals/week` };
  }

  const week = valueFor("This Week");
  if (week) return { title: `${week} policies expire this week`, body: "Prioritise critical renewals before they become lost business.", badge: "This Week", tone: "danger" as const, href: `${base}/renewals/week` };
  const nextWeek = valueFor("Next Week");
  if (nextWeek) return { title: `${nextWeek} renewals next week`, body: "Prepare quotes and client follow-ups before the window gets tight.", badge: "Next", tone: "warning" as const, href: `${base}/renewals/next-week` };
  return { title: "Renewal queue stable", body: "No urgent renewal pressure in the current week.", badge: "Clear", tone: "success" as const, href: `${base}/renewals/month` };
}

function dashboardRelationshipAction(metrics: DashboardPanelMetric[], base: string) {
  const followUps = metrics.find((metric) => metric.label === "Follow-ups Due")?.value ?? 0;
  const clientsToContact = metrics.find((metric) => metric.label === "Clients to Contact")?.value ?? 0;
  const anniversaries = metrics.find((metric) => metric.label === "Anniversaries")?.value ?? 0;
  if (followUps) return { title: "Relationship tasks due", body: `${followUps} prospect follow-ups need attention today.`, badge: "Follow up", tone: "warning" as const, href: `${navHref(base, "prospects")}?filter=today` };
  if (clientsToContact) return { title: "Clients to contact", body: `${clientsToContact} existing clients have renewal conversations or near-term renewals to chase.`, badge: "Contact", tone: "warning" as const, href: `${base}/renewals/month` };
  if (anniversaries) return { title: "Policy anniversary reviews", body: `${anniversaries} clients due for a coverage review.`, badge: "Upsell", tone: "success" as const, href: `${base}/anniversaries` };
  return { title: "Client touchpoints clear", body: "No birthday, follow-up, or client contact task due today.", badge: "Clear", tone: "success" as const, href: `${base}/birthdays` };
}

function dashboardBusinessMix(data: AppData): DashboardBusinessMix {
  if (!data.clients.length && !data.policies.length && !data.prospects.length) return "empty";
  const lifePolicies = data.policies.filter(isLifePolicy).length;
  const otherPolicies = data.policies.length - lifePolicies;
  if (lifePolicies && otherPolicies) return "mixed";
  if (lifePolicies) return "life";
  return "non-life";
}

function dashboardRevenueMetrics(policies: PolicyWithClient[], lapseCases: LapseShieldCase[], mix: DashboardBusinessMix, base: string): DashboardPanelMetric[] {
  const nonLifePolicies = policies.filter((policy) => !isLifePolicy(policy));
  const lifePolicies = policies.filter(isLifePolicy);
  const thisWeek = policiesForRange(nonLifePolicies, "week").length;
  const nextWeek = policiesForRange(nonLifePolicies, "next-week").length;
  const thisMonth = policiesForRange(nonLifePolicies, "month").length;
  const missingStatement = lapseCases.length;
  const atRiskLife = lifePolicies.filter(isLifeRetentionWatch).length;
  const recoveredLife = lifePolicies.filter((policy) => policy.renewal_status === "Renewed").length;

  if (mix === "life") {
    return [
      { label: "Missing Statement", value: missingStatement, href: `${base}/lapse-shield`, tone: "danger", helper: "Lapse Shield" },
      { label: "At Risk Life", value: atRiskLife, href: `${base}/life-retention`, tone: atRiskLife ? "warning" : "success", helper: "Years 1-3" },
      { label: "Recovered", value: recoveredLife, href: `${base}/life-retention/recovered`, tone: "success", helper: "Marked renewed" }
    ];
  }

  if (mix === "mixed") {
    return [
      { label: "This Week", value: thisWeek, href: `${base}/renewals/week`, tone: thisWeek ? "warning" : "success", helper: "Non-life" },
      { label: "This Month", value: thisMonth, href: `${base}/renewals/month`, tone: thisMonth ? "accent" : "primary", helper: "Non-life" },
      { label: "Missing Statement", value: missingStatement, href: `${base}/lapse-shield`, tone: "danger", helper: "Life" }
    ];
  }

  return [
    { label: "This Week", value: thisWeek, href: `${base}/renewals/week`, tone: thisWeek ? "warning" : "success", helper: "Expiring" },
    { label: "Next Week", value: nextWeek, href: `${base}/renewals/next-week`, tone: nextWeek ? "accent" : "primary", helper: "Expiring" },
    { label: "This Month", value: thisMonth, href: `${base}/renewals/month`, tone: thisMonth ? "danger" : "primary", helper: "Expiring" }
  ];
}

function dashboardRelationshipMetrics(policies: PolicyWithClient[], mix: DashboardBusinessMix, birthdaysToday: number, followUpsDueToday: number, base: string): DashboardPanelMetric[] {
  const clientsToContact = clientContactPolicies(policies).length;
  const anniversaryCount = policies.filter((policy) => isLifePolicy(policy) && isPolicyAnniversarySoon(policy)).length;
  const thirdMetric: DashboardPanelMetric = mix === "life"
    ? { label: "Anniversaries", value: anniversaryCount, href: `${base}/anniversaries`, tone: anniversaryCount ? "success" : "primary", helper: "Life reviews" }
    : { label: "Clients to Contact", value: clientsToContact, href: `${base}/renewals/month`, tone: clientsToContact ? "warning" : "success", helper: "Renewals" };

  return [
    { label: "Birthdays Today", value: birthdaysToday, href: `${base}/birthdays`, tone: birthdaysToday ? "accent" : "primary", helper: "WhatsApp ready" },
    { label: "Follow-ups Due", value: followUpsDueToday, href: `${navHref(base, "prospects")}?filter=today`, tone: followUpsDueToday ? "warning" : "success", helper: "Prospects" },
    thirdMetric
  ];
}

function clientContactPolicies(policies: PolicyWithClient[]) {
  const byClient = new Map<string, PolicyWithClient>();
  const candidates = policies.filter(isClientContactCandidate).sort((a, b) => clientContactPriority(a) - clientContactPriority(b) || sortByExpiry(a, b));
  for (const policy of candidates) {
    if (!byClient.has(policy.client_id)) byClient.set(policy.client_id, policy);
  }
  return Array.from(byClient.values());
}

function clientContactPriority(policy: PolicyWithClient) {
  if (policy.renewal_status === "Payment Pending") return 0;
  if (policy.renewal_status === "Quote Requested") return 1;
  if (policy.renewal_status === "Contacted") return 2;
  if (policiesForRange([policy], "month").length > 0) return 3;
  return 4;
}

function clientContactReason(policy: PolicyWithClient): { label: string; body: string; tone: "slate" | "orange" | "green" | "red" | "amber" } {
  if (policy.renewal_status === "Payment Pending") {
    return { label: "Payment Pending", body: "Renewal conversation is already in the payment stage.", tone: "amber" };
  }
  if (policy.renewal_status === "Quote Requested") {
    return { label: "Quote Requested", body: "Client is waiting for a quote or needs quote follow-up.", tone: "orange" };
  }
  if (policy.renewal_status === "Contacted") {
    return { label: "Contacted", body: "Renewal conversation has started and needs the next follow-up.", tone: "slate" };
  }
  return { label: "Expires This Month", body: `${policy.policy_type} policy expires on ${formatDate(policy.expiry_date)}.`, tone: "red" };
}

function isClientContactCandidate(policy: PolicyWithClient) {
  if (policy.status !== "Active" || policy.renewal_status === "Renewed" || policy.renewal_status === "Lost") return false;
  if (["Contacted", "Quote Requested", "Payment Pending"].includes(policy.renewal_status)) return true;
  return policiesForRange([policy], "month").length > 0;
}

function isLifePolicy(policy: PolicyWithClient) {
  return (policy.insurance_category ?? insuranceCategoryForPolicyType(policy.policy_type)) === "Life";
}

function isLifeRetentionWatch(policy: PolicyWithClient) {
  if (policy.status !== "Active" || policy.renewal_status === "Lost") return false;
  const start = new Date(`${policy.start_date}T00:00:00`);
  const today = new Date();
  if (Number.isNaN(start.getTime())) return false;
  const threeYearsAfterStart = new Date(start);
  threeYearsAfterStart.setFullYear(threeYearsAfterStart.getFullYear() + 3);
  return today <= threeYearsAfterStart;
}

function isPolicyAnniversarySoon(policy: PolicyWithClient) {
  const start = new Date(`${policy.start_date}T00:00:00`);
  if (Number.isNaN(start.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const anniversary = new Date(today.getFullYear(), start.getMonth(), start.getDate());
  if (anniversary < today) anniversary.setFullYear(today.getFullYear() + 1);
  const daysAway = Math.ceil((anniversary.getTime() - today.getTime()) / 86400000);
  return daysAway >= 0 && daysAway <= 7;
}

function downloadClientImportTemplate() {
  const headers = ["client_name", "phone_number", "policy_number", "policy_type", "insurer_name", "policy_start_date", "policy_end_date", "vehicle_number", "property_location", "premium", "commission_rate", "commission_status", "commission_payment_date", "email", "date_of_birth", "notes"];
  const example = ["Ama Mensah", "+233241234567", "POL-GH-MOT-2026-001", "Motor", "Enterprise Insurance LTD", "2026-01-01", "2026-12-31", "GR-4421-26", "", "1200", "7.5", "Paid", "2026-02-07", "ama@example.com", "1990-05-18", "Imported client"];
  const csv = `${headers.join(",")}\n${example.map((value) => `"${value}"`).join(",")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "policyhq-client-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function parseClientImportFile(file: File): Promise<{ rows: ImportClientRow[]; errors: string[] }> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    return parseClientCsv(await file.text());
  }
  if (lowerName.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    const rows = await readSheet(file);
    return parseClientTable(rows.map((row) => row.map((cell) => formatStatementCell(cell))));
  }
  return { rows: [], errors: ["Upload a CSV or Excel .xlsx file."] };
}

function parseClientCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  return parseClientTable(lines.map((line) => splitCsvLine(line)));
}

function parseClientTable(table: string[][]): { rows: ImportClientRow[]; errors: string[] } {
  const rowsWithContent = table.filter((row) => row.some((cell) => cell.trim()));
  if (rowsWithContent.length < 2) return { rows: [], errors: ["The file needs a header row and at least one client row."] };
  const headers = rowsWithContent[0].map((header) => normalizeImportHeader(header));
  const recognizedHeaders = ["client_name", "phone_number", "policy_number", "policy_type", "insurer_name", "policy_start_date", "policy_end_date", "premium", "email", "date_of_birth", "notes", "vehicle_number", "property_location", "commission_rate", "commission_amount", "commission_status", "commission_payment_date", "commission_released"];
  if (!headers.some((header) => recognizedHeaders.includes(header))) {
    return { rows: [], errors: ["PolicyHQ could not recognise this file's column names. Use the template or rename the first row to include client/policy fields."] };
  }

  const rows: ImportClientRow[] = [];
  rowsWithContent.slice(1).forEach((values) => {
    const record = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex]?.trim() ?? ""])) as Record<string, string>;
    if (!record.insurer_name && isEnterprisePolicyExport(headers)) record.insurer_name = "Enterprise";
    record.policy_start_date = normalizeImportDate(record.policy_start_date);
    record.policy_end_date = normalizeImportDate(record.policy_end_date);
    record.date_of_birth = normalizeImportDate(record.date_of_birth);
    const premium = parseImportMoney(record.premium);
    const commissionAmount = parseImportMoney(record.commission_amount);
    const explicitRate = record.commission_rate ? Number(record.commission_rate) : undefined;
    const commissionRate = Number.isFinite(explicitRate) && explicitRate !== undefined
      ? roundPercent(explicitRate)
      : commissionAmount && premium
        ? roundPercent(commissionAmount / premium * 100)
        : undefined;
    const commissionStatus = importCommissionStatus(record, isEnterprisePolicyExport(headers));
    const commissionPaymentDate = importCommissionPaymentDate(record, commissionStatus);
    const policyType = normalizeImportPolicyType(record.policy_type);
    rows.push({
      client_name: record.client_name ?? "",
      phone_number: record.phone_number ? normalizeGhanaPhoneNumber(record.phone_number) : "",
      policy_number: record.policy_number ? normalizePolicyNumber(record.policy_number) : "",
      policy_type: policyType,
      insurer_name: resolveImportInsurerName(record.insurer_name ?? "", policyType) ?? record.insurer_name ?? "",
      policy_start_date: record.policy_start_date ?? "",
      policy_end_date: record.policy_end_date ?? "",
      vehicle_number: record.vehicle_number || undefined,
      property_location: record.property_location || undefined,
      premium,
      commission_rate: commissionRate,
      commission_amount: commissionAmount ?? (premium && commissionRate !== undefined ? Number((premium * commissionRate / 100).toFixed(2)) : undefined),
      commission_status: commissionStatus,
      commission_payment_date: commissionPaymentDate,
      email: record.email || undefined,
      date_of_birth: record.date_of_birth || undefined,
      notes: record.notes || undefined
    });
  });
  return { rows, errors: [] };
}

function resolveImportInsurerName(value: string, policyType: PolicyType | "") {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const category = policyType ? insuranceCategoryForPolicyType(policyType) : null;
  const exact = findInsuranceCompany(trimmed);
  if (exact && (!category || exact.category === category)) return exact.name;

  const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
  const candidates = insuranceCompanies.filter((company) => !category || company.category === category);
  const match = candidates.find((company) => {
    const companyName = company.name.toLowerCase();
    return companyName.includes(normalized) || normalized.includes(companyName);
  });

  return match?.name ?? null;
}

async function parseLapseShieldStatementFile(file: File): Promise<LapseShieldStatementParseResult> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    return parseLapseShieldStatementCsv(await file.text());
  }
  if (lowerName.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    const rows = await readSheet(file);
    return parseLapseShieldStatementTable(rows.map((row) => row.map((cell) => formatStatementCell(cell))));
  }
  return {
    rows: [],
    errors: ["Upload a CSV, Excel .xlsx, or text-based PDF commission statement."]
  };
}

function statementKindForFile(file: File) {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".xlsx")) return "Excel";
  if (lowerName.endsWith(".pdf")) return "PDF";
  if (lowerName.endsWith(".csv")) return "CSV";
  return "CSV, Excel, or PDF";
}

function formatStatementCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function parseLapseShieldStatementCsv(text: string): LapseShieldStatementParseResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { rows: [], errors: ["The statement needs a header row and at least one policy row."] };
  return parseLapseShieldStatementTable(lines.map((line) => splitCsvLine(line)));
}

function parseLapseShieldStatementTable(table: string[][]): LapseShieldStatementParseResult {
  const rowsWithContent = table.filter((row) => row.some((cell) => cell.trim()));
  if (rowsWithContent.length < 2) return { rows: [], errors: ["The statement needs a header row and at least one policy row."] };
  const headers = rowsWithContent[0].map((header) => normalizeImportHeader(header));
  const policyNumberIndex = headers.indexOf("policy_number");
  if (policyNumberIndex === -1) return { rows: [], errors: ["PolicyHQ could not find a policy number column. Rename the column to policy_number or Policy Number and try again."] };
  const clientNameIndex = headers.indexOf("client_name");
  const rows = rowsWithContent.slice(1).flatMap((values, index) => {
    const policyNumber = normalizePolicyNumber(values[policyNumberIndex]?.trim() ?? "");
    if (!policyNumber) return [];
    return {
      rowNumber: index + 2,
      policy_number: policyNumber,
      client_name: clientNameIndex >= 0 ? values[clientNameIndex]?.trim() ?? "" : ""
    };
  });
  if (!rows.length) return { rows: [], errors: ["PolicyHQ found the policy number column, but no policy numbers were readable."] };
  return { rows, errors: [] };
}

function compareLapseShieldStatement(lifePolicies: PolicyWithClient[], statementRows: LapseShieldStatementRow[]): LapseShieldReview {
  const statementPolicyNumbers = new Set(statementRows.map((row) => row.policy_number));
  const policyNumbers = new Set(lifePolicies.map((policy) => normalizePolicyNumber(policy.policy_number)));
  return {
    matched: lifePolicies.filter((policy) => statementPolicyNumbers.has(normalizePolicyNumber(policy.policy_number))),
    missing: lifePolicies.filter((policy) => !statementPolicyNumbers.has(normalizePolicyNumber(policy.policy_number))),
    unknown: statementRows.filter((row) => !policyNumbers.has(row.policy_number)),
    statementRows: statementRows.length
  };
}

function validateImportRows(rows: ImportClientRow[]) {
  return rows.flatMap((row, index) => importRowIssues(row, index + 2));
}

function importRowIssues(row: ImportClientRow, rowNumber: number) {
  const errors: string[] = [];
  if (!row.client_name.trim()) errors.push(`Row ${rowNumber}: add the client name.`);
  if (!row.policy_number.trim()) errors.push(`Row ${rowNumber}: add the policy number.`);
  if (row.policy_number && !isValidPolicyNumber(row.policy_number)) errors.push(`Row ${rowNumber}: policy number format needs checking.`);
  if (!row.policy_type) errors.push(`Row ${rowNumber}: choose the policy type.`);
  if (!row.insurer_name.trim()) errors.push(`Row ${rowNumber}: add the insurer name.`);
  if (row.insurer_name && !resolveImportInsurerName(row.insurer_name, row.policy_type)) errors.push(`Row ${rowNumber}: choose an approved insurer name.`);
  if (!row.policy_end_date) errors.push(`Row ${rowNumber}: add the policy end date.`);
  if (row.policy_start_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.policy_start_date)) errors.push(`Row ${rowNumber}: start date must be YYYY-MM-DD.`);
  if (row.policy_end_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.policy_end_date)) errors.push(`Row ${rowNumber}: end date must be YYYY-MM-DD.`);
  if (row.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(row.date_of_birth)) errors.push(`Row ${rowNumber}: date of birth must be YYYY-MM-DD.`);
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push(`Row ${rowNumber}: email is invalid.`);
  if (row.phone_number && !/^\+?[0-9 ()-]{8,20}$/.test(row.phone_number)) errors.push(`Row ${rowNumber}: phone number format needs checking.`);
  if (row.commission_rate !== undefined && row.commission_rate < 0) errors.push(`Row ${rowNumber}: commission rate cannot be negative.`);
  if (row.commission_status === "Paid" && row.commission_payment_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.commission_payment_date)) errors.push(`Row ${rowNumber}: commission payment date must be YYYY-MM-DD.`);
  return errors;
}

function importReviewWarnings(rows: ImportClientRow[]) {
  const warnings: string[] = [];
  rows.forEach((row, index) => {
    const missing = importRowReviewNotes(row);
    if (missing.length) warnings.push(`Row ${index + 2}: ${missing.join(", ")} missing.`);
  });
  return warnings;
}

function importRowReviewNotes(row: ImportClientRow) {
  const missing: string[] = [];
  if (!row.phone_number.trim()) missing.push("phone");
  if (!row.policy_start_date) missing.push("start date");
  if (row.premium === undefined) missing.push("premium");
  if (row.commission_rate === undefined) missing.push("commission rate");
  if (row.policy_type === "Motor" && !row.vehicle_number?.trim()) missing.push("vehicle number");
  if (row.policy_type === "Property" && !row.property_location?.trim()) missing.push("property location");
  return missing;
}

function normalizeImportPolicyType(value: string | undefined): PolicyType | "" {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "";
  const match = policyTypes.find((type) => type.toLowerCase() === normalized);
  if (match) return match;
  if (normalized.includes("motor") || normalized.includes("vehicle") || normalized.includes("auto")) return "Motor";
  if (normalized.includes("life")) return "Life";
  if (normalized.includes("health") || normalized.includes("medical")) return "Health";
  if (normalized.includes("fire")) return "Fire";
  if (normalized.includes("marine")) return "Marine";
  if (normalized.includes("travel")) return "Travel";
  if (normalized.includes("property") || normalized.includes("building") || normalized.includes("home")) return "Property";
  if (normalized.includes("accident") || normalized === "pa") return "Accident";
  return match ?? "";
}

function normalizeImportHeader(header: string) {
  const normalized = header.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s./-]+/g, "_").replace(/^_+|_+$/g, "");
  const aliases: Record<string, string> = {
    client_name: "client_name",
    client: "client_name",
    customer_name: "client_name",
    insured_name: "client_name",
    policyholder_name: "client_name",
    phone_number: "phone_number",
    phone: "phone_number",
    telephone: "phone_number",
    mobile: "phone_number",
    mobile_number: "phone_number",
    contact_number: "phone_number",
    policy_number: "policy_number",
    policy_no: "policy_number",
    policy: "policy_number",
    policy_type: "policy_type",
    insurance: "policy_type",
    insurance_type: "policy_type",
    class: "policy_type",
    business_class: "policy_type",
    insurer_name: "insurer_name",
    insurer: "insurer_name",
    insurance_company: "insurer_name",
    company: "insurer_name",
    policy_start_date: "policy_start_date",
    start_date: "policy_start_date",
    effective_date: "policy_start_date",
    inception_date: "policy_start_date",
    policy_end_date: "policy_end_date",
    expiry_date: "policy_end_date",
    expiration_date: "policy_end_date",
    end_date: "policy_end_date",
    policy_expiry_date: "policy_end_date",
    premium: "premium",
    premium_amount: "premium",
    commission_due: "commission_amount",
    commission: "commission_amount",
    commission_amount: "commission_amount",
    commission_rate: "commission_rate",
    rate: "commission_rate",
    commission_status: "commission_status",
    payment_status: "commission_status",
    commission_payment_date: "commission_payment_date",
    payment_date: "commission_payment_date",
    released: "commission_released",
    date_of_birth: "date_of_birth",
    dob: "date_of_birth",
    notes: "notes",
    note: "notes",
    vehicle_number: "vehicle_number",
    vehicle_no: "vehicle_number",
    registration_number: "vehicle_number",
    reg_no: "vehicle_number",
    property_location: "property_location",
    property_address: "property_location",
    address: "property_location"
  };
  return aliases[normalized] ?? normalized;
}

function isEnterprisePolicyExport(headers: string[]) {
  return headers.includes("trans_date") && headers.includes("commission_amount") && headers.includes("policy_number");
}

function importCommissionStatus(record: Record<string, string>, enterpriseExport: boolean): "Paid" | "Pending" {
  const explicitStatus = record.commission_status?.trim().toLowerCase();
  if (["paid", "released", "yes"].includes(explicitStatus)) return "Paid";
  if (["pending", "unpaid", "no"].includes(explicitStatus)) return "Pending";

  const released = record.commission_released?.trim().toLowerCase();
  if (released && released !== "no" && released !== "pending") return "Paid";

  if (!enterpriseExport || !record.policy_start_date) return "Pending";
  return isPastPolicyMonth(record.policy_start_date) ? "Paid" : "Pending";
}

function importCommissionPaymentDate(record: Record<string, string>, status: "Paid" | "Pending") {
  if (status !== "Paid") return "";
  const explicitPaymentDate = normalizeImportDate(record.commission_payment_date || record.commission_released);
  if (explicitPaymentDate) return explicitPaymentDate;
  return seventhDayOfNextMonth(record.policy_start_date);
}

function isPastPolicyMonth(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  const thisMonth = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const policyMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  return policyMonth < thisMonth;
}

function seventhDayOfNextMonth(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  const paymentDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 7));
  return paymentDate.toISOString().slice(0, 10);
}

function roundPercent(value: number) {
  return Number(value.toFixed(2));
}

function dateOfBirthForDisplay(value: string | null | undefined) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function dateOfBirthToIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!match) return trimmed;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normalizeImportDate(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const slashDate = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashDate) {
    const [, day, month, year] = slashDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const withoutOrdinals = trimmed.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1");
  const parsed = new Date(`${withoutOrdinals} UTC`);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toISOString().slice(0, 10);
}

function parseImportMoney(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const amount = Number(trimmed.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(amount) || amount === 0) return undefined;
  return Math.abs(amount);
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}
