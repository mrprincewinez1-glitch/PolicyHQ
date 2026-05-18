"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import {
  Bell,
  Calculator,
  CheckCircle2,
  Download,
  FileText,
  Flag,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
  MessageCircle,
  type LucideIcon
} from "lucide-react";
import {
  deleteClient as deleteClientAction,
  deletePolicy as deletePolicyAction,
  markAllNotificationsRead,
  markCommissionPaid,
  markNotificationRead,
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
import { isValidPolicyNumber, normalizePolicyNumber, policyNumberHelpText } from "@/lib/policy-number";
import { feedbackMailto } from "@/lib/site";
import { createClient } from "@/lib/supabase/client";
import type { AppData, Client, Commission, InsuranceCategory, Policy, PolicyStatus, PolicyType, PolicyWithClient, RenewalStatus } from "@/lib/types";
import {
  activePolicies,
  expiringThisMonth,
  firstName,
  formatCurrency,
  formatDate,
  fullDate,
  greeting,
  policiesForRange,
  sortByExpiry,
  toCsv,
  urgency
} from "@/lib/utils";

type Section = "dashboard" | "clients" | "policies" | "commissions" | "notifications" | "profile";
type ModalState =
  | { type: "demo" }
  | { type: "client"; client?: Client }
  | { type: "policy"; policy?: PolicyWithClient }
  | { type: "confirm"; title: string; body: string; action: () => Promise<void> | void }
  | null;
type PolicySavePayload = Partial<Policy> & {
  commission_rate?: number;
  payment_status?: "Paid" | "Pending";
  new_client?: Partial<Client>;
};
type CommissionPaymentFilter = "All" | "Paid" | "Pending";
type CommissionDisplayStatus = "Pending" | "Overdue" | "Paid";
type CommissionClassFilter = "All" | InsuranceCategory;
type CommissionPeriodMode = "Monthly" | "Yearly" | "All Time";
type NavItem = readonly [Section | "admin", LucideIcon, string];

const nav = [
  ["dashboard", LayoutDashboard, "Dashboard"],
  ["clients", Users, "Clients"],
  ["policies", ShieldCheck, "Policies"],
  ["commissions", Calculator, "Commissions"],
  ["notifications", Bell, "Renewal Alerts"],
  ["profile", Settings, "Profile"]
] as const;

const policyTypes: PolicyType[] = ["Life", "Health", "Motor", "Property", "Fire", "Marine", "Travel"];
const policyStatuses: PolicyStatus[] = ["Active", "Expired", "Cancelled"];
const renewalStatuses: RenewalStatus[] = ["Not Started", "Reminder Sent", "Under Renewal", "Renewed", "Lapsed"];
const commissionBusinessClasses: InsuranceCategory[] = ["Life", "Non-Life", "Health"];
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function AppShell({
  initialData,
  section = "dashboard",
  demo = false,
  renewalRange,
  clientId
}: {
  initialData: AppData;
  section?: Section;
  demo?: boolean;
  renewalRange?: "week" | "next-week" | "month";
  clientId?: string;
}) {
  const [data, setData] = useState(initialData);
  const [active, setActive] = useState<Section>(section);
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [detailPolicy, setDetailPolicy] = useState<PolicyWithClient | null>(null);
  const base = demo ? "/demo" : "";
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
    notify("success", "CSV export downloaded.");
  }

  async function updateRenewal(policyId: string, status: RenewalStatus) {
    if (blockWrite()) return;
    const previous = data.policies;
    setData((current) => ({
      ...current,
      policies: current.policies.map((policy) => policy.id === policyId ? { ...policy, renewal_status: status } : policy)
    }));
    const result = await updatePolicyRenewalStatus({ policy_id: policyId, renewal_status: status });
    if (!result.ok) {
      setData((current) => ({ ...current, policies: previous }));
      notify("error", result.message);
      return;
    }
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
    notify("success", "Client saved successfully.");
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
        renewal_status: payload.renewal_status ?? "Not Started",
        notes: payload.notes?.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: null,
        commission
      };
      setData((current) => ({
        ...current,
        clients: existingClient ? current.clients : [client, ...current.clients],
        policies: payload.id ? current.policies.map((policy) => policy.id === nextPolicy.id ? nextPolicy : policy) : [nextPolicy, ...current.policies],
        commissions: payload.id ? current.commissions.map((item) => item.policy_id === nextPolicy.id ? commission : item) : [commission, ...current.commissions]
      }));
      setModal(null);
      notify("success", "Policy and client saved in local preview.");
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
      renewal_status: payload.renewal_status ?? "Not Started",
      notes: payload.notes?.trim() || "",
      commission_rate: Number(payload.commission_rate ?? 10),
      payment_status: payload.payment_status ?? "Pending"
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
        : [commission, ...current.commissions]
    }));
    setModal(null);
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

  const totalEarned = commissionTotal(data.commissions, data.policies);
  const totalPaid = commissionTotal(data.commissions.filter((item) => item.payment_status === "Paid"), data.policies);
  const totalPaidThisMonth = commissionTotal(data.commissions.filter((item) => item.payment_status === "Paid" && isCurrentMonth(commissionEarnedDate(item))), data.policies);

  const selectedClient = clientId ? data.clients.find((client) => client.id === clientId) : null;

  const content = selectedClient ? (
    <ClientDetail
      client={selectedClient}
      policies={data.policies.filter((policy) => policy.client_id === selectedClient.id)}
      base={base}
      openPolicy={setDetailPolicy}
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
  ) : active === "dashboard" ? (
    <Dashboard data={data} base={base} totalPaidThisMonth={totalPaidThisMonth} openPolicy={setDetailPolicy} />
  ) : active === "clients" ? (
    <Clients
      clients={filteredClients}
      policies={data.policies}
      base={base}
      onAdd={() => blockWrite() || setModal({ type: "client" })}
      onEdit={(client) => blockWrite() || setModal({ type: "client", client })}
      onDelete={(client) => blockWrite() || setModal({ type: "confirm", title: "Archive client?", body: `This will hide ${client.full_name} from active records while preserving policy and commission history.`, action: () => deleteClient(client) })}
      onExport={() => downloadCsv("policyhq-clients", clientRows(data.clients, data.policies))}
    />
  ) : active === "policies" ? (
    <Policies
      policies={filteredPolicies}
      clients={data.clients}
      onAdd={() => blockWrite() || setModal({ type: "policy" })}
      onEdit={(policy) => blockWrite() || setModal({ type: "policy", policy })}
      onDelete={(policy) => blockWrite() || setModal({ type: "confirm", title: "Delete policy?", body: `This will permanently delete ${policy.policy_number}.`, action: () => deletePolicy(policy) })}
      onExport={() => downloadCsv("policyhq-policies", policyRows(data.policies))}
      updateRenewal={updateRenewal}
      openPolicy={setDetailPolicy}
    />
  ) : active === "commissions" ? (
    <Commissions
      data={data}
      totalEarned={totalEarned}
      totalPaid={totalPaid}
      base={base}
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

  return (
    <div>
      {demo ? (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 bg-primary px-3 py-2 text-xs font-semibold leading-5 text-white sm:px-4 sm:py-3 sm:text-sm">
          <span><span className="sm:hidden">Live demo. Fictional data only.</span><span className="hidden sm:inline">🔍 You are viewing a live demo. All data shown is fictional. Sign up free to manage your real policies.</span></span>
          <Button asChild size="sm" className="shrink-0 whitespace-nowrap px-3"><Link href="/sign-up">Sign Up Free</Link></Button>
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
                className={`flex w-full items-center gap-3 rounded-xl border-l-4 px-4 py-3 text-left text-sm font-semibold ${active === key && !renewalRange ? "border-accent bg-white/10 text-white" : "border-transparent text-slate-300 hover:bg-white/5"}`}
              >
                <Icon className="h-5 w-5" /> {label}
              </Link>
            ))}
            </nav>
            <div className="mt-6 border-t border-white/10 pt-4">
              <a href={feedbackMailto()} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-white/10">
                <MessageCircle className="h-4 w-4" />
                Send Feedback
              </a>
            </div>
          </aside>
        <main className="min-h-screen lg:pl-72">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-8">
            <button className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu /></button>
            <Link
              href={navHref(base, "dashboard")}
              aria-label="Go to dashboard"
              onClick={() => setActive("dashboard")}
              className="ml-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent lg:hidden"
            >
              <PolicyHqLogo className="h-9 w-auto max-w-[132px]" />
            </Link>
            <div className="hidden max-w-md flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 lg:flex">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full outline-none" placeholder="Search clients, policies, or insurers" />
            </div>
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
              {demo ? <Button asChild size="sm" className="whitespace-nowrap px-3"><Link href="/sign-up"><span className="sm:hidden">Sign Up</span><span className="hidden sm:inline">Sign Up Free</span></Link></Button> : <form action={signOut}><Button variant="ghost" size="sm"><LogOut className="h-4 w-4" /> Sign Out</Button></form>}
            </div>
          </header>
          <div className="p-4 lg:p-8">{content}</div>
        </main>
      </div>

      {mobileOpen ? <button aria-label="Close menu" className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)}><X className="ml-auto mr-5 mt-5 text-white" /></button> : null}
      {modal?.type === "demo" ? <DemoModal onClose={() => setModal(null)} /> : null}
      {modal?.type === "client" ? <ClientModal client={modal.client} onClose={() => setModal(null)} onSave={saveClient} /> : null}
      {modal?.type === "policy" ? <PolicyModal policy={modal.policy} clients={data.clients} onClose={() => setModal(null)} onSave={savePolicy} /> : null}
      {modal?.type === "confirm" ? <ConfirmModal title={modal.title} body={modal.body} onClose={() => setModal(null)} onConfirm={modal.action} /> : null}
      {detailPolicy ? <PolicyDetailPanel policy={detailPolicy} onClose={() => setDetailPolicy(null)} /> : null}
      {toast ? <div className={`fixed bottom-5 right-5 z-[70] rounded-xl px-4 py-3 text-sm font-bold text-white shadow-soft ${toast.tone === "success" ? "bg-success" : "bg-danger"}`}>{toast.message}</div> : null}
    </div>
  );
}

function Dashboard({ data, base, totalPaidThisMonth, openPolicy }: { data: AppData; base: string; totalPaidThisMonth: number; openPolicy: (policy: PolicyWithClient) => void }) {
  const recent = [...data.policies].sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime()).slice(0, 5);
  const active = activePolicies(data.policies);
  const premiumDueThisMonth = expiringThisMonth(data.policies).reduce((sum, policy) => sum + policy.premium_amount, 0);
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-extrabold">{greeting(firstName(data.profile.full_name))}</h1><p className="mt-1 text-slate-600">{fullDate()}</p></div>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Total Clients", data.clients.length, navHref(base, "clients")],
          ["Active Policies", active.length, navHref(base, "policies")],
          ["Commissions Earned This Month", formatCurrency(totalPaidThisMonth), navHref(base, "commissions")],
          ["Premium Due This Month", formatCurrency(premiumDueThisMonth), `${base}/renewals/month`]
        ].map(([label, value, href]) => (
          <Link key={label} href={href as string} className="rounded-xl focus:outline-none focus:ring-2 focus:ring-accent">
            <Card className="h-full transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md">
              <CardContent className="p-5">
                <p className="text-sm font-semibold text-slate-500">{label}</p>
                <strong className="mt-2 block text-3xl">{value}</strong>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-accent">
            <Bell className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-extrabold text-primary">Renewal Alerts</h2>
            <p className="text-sm text-slate-600">Click a card to view policies that need renewal attention.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Expiring This Week", policiesForRange(data.policies, "week").length, "week"],
            ["Expiring Next Week", policiesForRange(data.policies, "next-week").length, "next-week"],
            ["Expiring This Month", policiesForRange(data.policies, "month").length, "month"]
          ].map(([label, count, range]) => (
            <Link key={label} href={`${base}/renewals/${range}`} aria-label={`Renewal alerts: ${label}`} className="rounded-xl border border-orange-200 bg-white p-5 shadow-soft transition hover:-translate-y-0.5">
              <p className="font-bold text-primary">{label}</p><strong className="mt-3 block text-4xl text-accent">{count}</strong>
            </Link>
          ))}
        </div>
      </div>
      <Card><CardHeader><h2 className="font-bold">Recent Activity</h2></CardHeader><DataTable headers={["Client Name", "Policy Number", "Type", "Expiry Date", "Status"]} rows={recent.map((p) => [<button className="font-bold text-primary" onClick={() => openPolicy(p)} key={p.id}>{p.client.full_name}</button>, p.policy_number, p.policy_type, formatDate(p.expiry_date), p.status])} /></Card>
    </div>
  );
}

function RenewalList({ title, policies, base, updateRenewal, openPolicy, onBack }: { title: string; policies: PolicyWithClient[]; base: string; updateRenewal: (id: string, status: RenewalStatus) => void; openPolicy: (policy: PolicyWithClient) => void; onBack: () => void }) {
  return (
    <div className="space-y-5">
      <Button asChild variant="outline"><Link href={navHref(base, "dashboard")} onClick={onBack}>Back to dashboard</Link></Button>
      <Card><CardHeader><h1 className="text-2xl font-extrabold">{title}</h1></CardHeader><div className="overflow-auto"><table className="w-full min-w-[980px] text-sm"><thead className="sticky top-0 bg-slate-50"><tr>{["Client Name", "Phone Number", "Policy Number", "Policy Type", "Insurer", "Expiry Date", "Premium Amount (GHS)", "Renewal Status", "Alert"].map((h) => <th className="px-4 py-3 text-left" key={h}>{h}</th>)}</tr></thead><tbody>{[...policies].sort(sortByExpiry).map((p) => <tr key={p.id} onClick={() => openPolicy(p)} className={`cursor-pointer border-t ${urgency(p.expiry_date) === "urgent" ? "bg-red-50" : urgency(p.expiry_date) === "soon" ? "bg-amber-50" : "odd:bg-white even:bg-slate-50"}`}><td className="px-4 py-3 font-semibold">{p.client.full_name}</td><td className="px-4 py-3">{p.client.phone_number}</td><td className="px-4 py-3">{p.policy_number}</td><td className="px-4 py-3">{p.policy_type}</td><td className="px-4 py-3">{p.insurer_name}</td><td className="px-4 py-3">{formatDate(p.expiry_date)}</td><td className="px-4 py-3">{formatCurrency(p.premium_amount)}</td><td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><Select value={p.renewal_status} onChange={(e) => updateRenewal(p.id, e.target.value as RenewalStatus)}>{renewalStatuses.map((s) => <option key={s}>{s}</option>)}</Select></td><td className="px-4 py-3">{UrgencyBadge(p.expiry_date)}</td></tr>)}</tbody></table></div></Card>
    </div>
  );
}

function Clients({ clients, policies, base, onAdd, onEdit, onDelete, onExport }: { clients: Client[]; policies: PolicyWithClient[]; base: string; onAdd: () => void; onEdit: (client: Client) => void; onDelete: (client: Client) => void; onExport: () => void }) {
  const [sort, setSort] = useState<"name" | "date">("name");
  const sorted = [...clients].sort((a, b) => sort === "name" ? a.full_name.localeCompare(b.full_name) : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  if (!clients.length) return <Empty title="No clients yet. Add your first client to get started." action="Add Client" onAction={onAdd} />;
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><h1 className="text-2xl font-extrabold">Clients</h1><div className="flex flex-wrap gap-2"><Select value={sort} onChange={(e) => setSort(e.target.value as "name" | "date")}><option value="name">Sort by Name</option><option value="date">Sort by Date Added</option></Select><Button variant="outline" onClick={onExport}><Download className="h-4 w-4" /> Export to CSV</Button><Button onClick={onAdd}><Plus className="h-4 w-4" /> Add New Client</Button></div></CardHeader>
      <div className="space-y-3 border-t p-4 md:hidden">
        {sorted.map((client) => (
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
      <div className="hidden overflow-auto md:block"><table className="w-full min-w-[1050px] text-sm"><thead className="sticky top-0 bg-slate-50"><tr>{["Full Name", "Phone Number", "Email", "Date of Birth", "Address", "Number of Policies", "Date Added", "Actions"].map((h) => <th className="px-4 py-3 text-left" key={h}>{h}</th>)}</tr></thead><tbody>{sorted.map((c) => <tr key={c.id} className="border-t odd:bg-white even:bg-slate-50"><td className="px-4 py-3 font-bold"><Link href={`${base}/clients/${c.id}`}>{c.full_name}</Link></td><td className="px-4 py-3">{c.phone_number}</td><td className="px-4 py-3">{c.email || "—"}</td><td className="px-4 py-3">{c.date_of_birth ? formatDate(c.date_of_birth) : "—"}</td><td className="px-4 py-3">{c.address || "—"}</td><td className="px-4 py-3">{policies.filter((p) => p.client_id === c.id).length}</td><td className="px-4 py-3">{formatDate(c.created_at)}</td><td className="px-4 py-3"><Button variant="ghost" size="sm" onClick={() => onEdit(c)}>Edit</Button><Button variant="ghost" size="sm" onClick={() => onDelete(c)}><Trash2 className="h-4 w-4 text-danger" /></Button></td></tr>)}</tbody></table></div>
    </Card>
  );
}

function ClientDetail({ client, policies, base, openPolicy }: { client: Client; policies: PolicyWithClient[]; base: string; openPolicy: (policy: PolicyWithClient) => void }) {
  return (
    <div className="space-y-5">
      <Button asChild variant="outline"><Link href={`${base}/clients`}>Back to clients</Link></Button>
      <Card>
        <CardHeader><h1 className="text-2xl font-extrabold">{client.full_name}</h1></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-5">
          <Info label="Phone Number" value={client.phone_number} />
          <Info label="Email" value={client.email || "No email"} />
          <Info label="Date of Birth" value={client.date_of_birth ? formatDate(client.date_of_birth) : "Not recorded"} />
          <Info label="Address" value={client.address || "No address"} />
          <Info label="Date Added" value={formatDate(client.created_at)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><h2 className="text-xl font-bold">Policies</h2></CardHeader>
        {policies.length ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 bg-slate-50"><tr>{["Policy Number", "Type", "Insurer", "Expiry Date", "Premium", "Status", "Renewal Status"].map((h) => <th className="px-4 py-3 text-left" key={h}>{h}</th>)}</tr></thead>
              <tbody>{policies.map((policy) => <tr key={policy.id} onClick={() => openPolicy(policy)} className="cursor-pointer border-t odd:bg-white even:bg-slate-50"><td className="px-4 py-3 font-bold">{policy.policy_number}</td><td className="px-4 py-3">{policy.policy_type}</td><td className="px-4 py-3">{policy.insurer_name}</td><td className="px-4 py-3">{formatDate(policy.expiry_date)} {UrgencyBadge(policy.expiry_date)}</td><td className="px-4 py-3">{formatCurrency(policy.premium_amount)}</td><td className="px-4 py-3"><Badge tone={policy.status === "Active" ? "green" : "slate"}>{policy.status}</Badge></td><td className="px-4 py-3">{policy.renewal_status}</td></tr>)}</tbody>
            </table>
          </div>
        ) : (
          <CardContent><p className="text-sm text-slate-600">No policies are linked to this client yet.</p></CardContent>
        )}
      </Card>
    </div>
  );
}

function Policies({ policies, clients, onAdd, onEdit, onDelete, onExport, updateRenewal, openPolicy }: { policies: PolicyWithClient[]; clients: Client[]; onAdd: () => void; onEdit: (policy: PolicyWithClient) => void; onDelete: (policy: PolicyWithClient) => void; onExport: () => void; updateRenewal: (id: string, status: RenewalStatus) => void; openPolicy: (policy: PolicyWithClient) => void }) {
  const [status, setStatus] = useState("All");
  const [type, setType] = useState("All");
  const filtered = policies.filter((p) => (status === "All" || p.status === status) && (type === "All" || p.policy_type === type));
  if (!policies.length) return <Empty title="No policies yet. Add your first policy to get started." action="Add Policy" onAction={onAdd} />;
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><h1 className="text-2xl font-extrabold">Policies</h1><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onExport}><Download className="h-4 w-4" /> Export to CSV</Button><Button onClick={onAdd}><Plus className="h-4 w-4" /> Add New Policy</Button></div></CardHeader>
      <div className="flex flex-wrap gap-3 p-4"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option>All</option>{policyStatuses.map((item) => <option key={item}>{item}</option>)}</Select><Select value={type} onChange={(e) => setType(e.target.value)}><option>All</option>{policyTypes.map((item) => <option key={item}>{item}</option>)}</Select></div>
      <div className="space-y-3 border-t p-4 md:hidden">
        {filtered.map((policy) => (
          <div key={policy.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <button type="button" onClick={() => openPolicy(policy)} className="block w-full text-left">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold text-primary">{policy.client.full_name}</p>
                  <p className="mt-1 font-mono text-sm font-bold text-slate-500">{policy.policy_number}</p>
                </div>
                <Badge tone={policy.status === "Active" ? "green" : "slate"}>{policy.status}</Badge>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-600">{policy.insurer_name}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <Info label="Type" value={policy.policy_type} />
                <Info label="Premium" value={formatCurrency(policy.premium_amount)} />
                <Info label="Expiry" value={formatDate(policy.expiry_date)} />
                <div>{UrgencyBadge(policy.expiry_date)}</div>
              </div>
            </button>
            <div className="mt-4 grid gap-2" onClick={(event) => event.stopPropagation()}>
              <Select value={policy.renewal_status} onChange={(event) => updateRenewal(policy.id, event.target.value as RenewalStatus)}>{renewalStatuses.map((item) => <option key={item}>{item}</option>)}</Select>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => onEdit(policy)}>Edit</Button>
                <Button variant="ghost" size="sm" className="h-11 w-11" aria-label={`Delete ${policy.policy_number}`} onClick={() => onDelete(policy)}><Trash2 className="h-4 w-4 text-danger" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-auto md:block"><table className="w-full min-w-[1100px] text-sm"><thead className="sticky top-0 bg-slate-50"><tr>{["Client Name", "Policy Number", "Type", "Insurer", "Start Date", "Expiry Date", "Premium (GHS)", "Status", "Renewal Status", "Actions"].map((h) => <th className="px-4 py-3 text-left" key={h}>{h}</th>)}</tr></thead><tbody>{filtered.map((p) => <tr key={p.id} onClick={() => openPolicy(p)} className={`cursor-pointer border-t ${urgency(p.expiry_date) === "urgent" ? "bg-red-50" : urgency(p.expiry_date) === "soon" ? "bg-amber-50" : "odd:bg-white even:bg-slate-50"}`}><td className="px-4 py-3 font-bold">{p.client.full_name}</td><td className="px-4 py-3">{p.policy_number}</td><td className="px-4 py-3">{p.policy_type}</td><td className="px-4 py-3">{p.insurer_name}</td><td className="px-4 py-3">{formatDate(p.start_date)}</td><td className="px-4 py-3">{formatDate(p.expiry_date)} {UrgencyBadge(p.expiry_date)}</td><td className="px-4 py-3">{formatCurrency(p.premium_amount)}</td><td className="px-4 py-3"><Badge tone={p.status === "Active" ? "green" : "slate"}>{p.status}</Badge></td><td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><Select value={p.renewal_status} onChange={(e) => updateRenewal(p.id, e.target.value as RenewalStatus)}>{renewalStatuses.map((s) => <option key={s}>{s}</option>)}</Select></td><td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><Button variant="ghost" size="sm" onClick={() => onEdit(p)}>Edit</Button><Button variant="ghost" size="sm" onClick={() => onDelete(p)}><Trash2 className="h-4 w-4 text-danger" /></Button></td></tr>)}</tbody></table></div>
    </Card>
  );
}

function Commissions({ data, totalEarned, totalPaid, base, markPaid, openPolicy, onExport, onWriteAttempt }: { data: AppData; totalEarned: number; totalPaid: number; base: string; markPaid: (commission: Commission) => void; openPolicy: (policy: PolicyWithClient) => void; onExport: (commissions: Commission[]) => void; onWriteAttempt: () => boolean }) {
  const [paymentFilter, setPaymentFilter] = useState<CommissionPaymentFilter>("All");
  const [classFilter, setClassFilter] = useState<CommissionClassFilter>("All");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const today = new Date();
  const [periodMode, setPeriodMode] = useState<CommissionPeriodMode>("All Time");
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const commissionItems = data.commissions.flatMap((commission) => {
    const policy = data.policies.find((item) => item.id === commission.policy_id);
    if (!policy) return [];
    const businessClass = policy.insurance_category ?? insuranceCategoryForPolicyType(policy.policy_type);
    const amount = policy.premium_amount * commission.commission_rate / 100;
    const daysPending = daysBetween(policy.start_date, new Date());
    const displayStatus: CommissionDisplayStatus = commission.payment_status === "Paid" ? "Paid" : daysPending > 30 ? "Overdue" : "Pending";
    return [{ commission, policy, businessClass, amount, daysPending, displayStatus }];
  });
  const periodLabel = commissionPeriodLabel(periodMode, selectedMonth, selectedYear);
  const availableYears = availableCommissionYears(data.commissions);
  const rows = commissionItems.filter((item) => {
    const paymentMatches = paymentFilter === "All" || item.commission.payment_status === paymentFilter;
    const classMatches = classFilter === "All" || item.businessClass === classFilter;
    const periodMatches = item.displayStatus !== "Paid" || commissionInPeriod(item.commission, periodMode, selectedMonth, selectedYear);
    return paymentMatches && classMatches && periodMatches;
  }).sort(sortCommissionItems);
  const breakdown = commissionBusinessClasses.map((businessClass) => {
    const items = commissionItems.filter((item) => item.businessClass === businessClass);
    const paid = items.filter((item) => item.commission.payment_status === "Paid").reduce((sum, item) => sum + item.amount, 0);
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    return { businessClass, count: items.length, total, paid, pending: total - paid };
  });
  const pendingTotal = commissionItems.filter((item) => item.displayStatus === "Pending").reduce((sum, item) => sum + item.amount, 0);
  const overdueItems = commissionItems.filter((item) => item.displayStatus === "Overdue");
  const overdueTotal = overdueItems.reduce((sum, item) => sum + item.amount, 0);
  const earnedForPeriod = commissionItems.filter((item) => item.displayStatus === "Paid" && commissionInPeriod(item.commission, periodMode, selectedMonth, selectedYear)).reduce((sum, item) => sum + item.amount, 0);
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
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-primary">Commissions</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">Choose the earnings period for Total Earned.</p>
          </div>
          <div className="grid w-full grid-cols-3 rounded-xl bg-slate-100 p-1 sm:inline-flex sm:w-auto sm:flex-wrap">
            <button
              type="button"
              onClick={() => setPeriodMode("All Time")}
              className={`rounded-lg px-2 py-2 text-xs font-bold sm:px-4 sm:text-sm ${periodMode === "All Time" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-primary"}`}
            >
              All Time
            </button>
            <div className={`flex items-center rounded-lg ${periodMode === "Yearly" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-primary"}`}>
              <button type="button" onClick={() => setPeriodMode("Yearly")} className="px-2 py-2 text-xs font-bold sm:px-4 sm:text-sm">Yearly</button>
              {periodMode === "Yearly" ? (
                <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} className="mr-1 h-8 rounded-md border border-slate-200 bg-white px-2 text-sm font-bold outline-none">
                  {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              ) : null}
            </div>
            <div className={`flex items-center rounded-lg ${periodMode === "Monthly" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-primary"}`}>
              <button type="button" onClick={() => setPeriodMode("Monthly")} className="px-2 py-2 text-xs font-bold sm:px-4 sm:text-sm">Monthly</button>
              {periodMode === "Monthly" ? (
                <div className="mr-1 flex items-center gap-1">
                  <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm font-bold outline-none">
                    {monthNames.map((month, index) => <option key={month} value={index}>{month}</option>)}
                  </select>
                  <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm font-bold outline-none">
                    {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
                  </select>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Total Pending", pendingTotal, `${commissionItems.filter((item) => item.displayStatus === "Pending").length} pending`],
          ["Total Overdue", overdueTotal, `${overdueItems.length} overdue`],
          ["Total Earned", earnedForPeriod, periodLabel]
        ].map(([label, value, meta]) => (
          <Card key={label as string}>
            <CardContent>
              <p className="text-sm font-semibold text-slate-500">{label as string}</p>
              <strong className="mt-2 block text-3xl">{formatCurrency(value as number)}</strong>
              <span className="mt-2 block text-xs font-bold uppercase text-slate-400">{meta as string}</span>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {breakdown.map((item) => (
          <button
            type="button"
            key={item.businessClass}
            onClick={() => setClassFilter(item.businessClass)}
            className={`rounded-xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent ${classFilter === item.businessClass ? "border-accent ring-2 ring-orange-100" : "border-transparent"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <BusinessClassBadge value={item.businessClass} />
              <span className="text-xs font-bold uppercase text-slate-400">{item.count} records</span>
            </div>
            <strong className="mt-4 block text-2xl">{formatCurrency(item.total)}</strong>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <span className="rounded-lg bg-green-50 px-3 py-2 font-semibold text-green-700">Paid {formatCurrency(item.paid)}</span>
              <span className="rounded-lg bg-amber-50 px-3 py-2 font-semibold text-amber-700">Pending {formatCurrency(item.pending)}</span>
            </div>
          </button>
        ))}
      </div>
      <Card>
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
                  <tr key={commission.id} onClick={() => openPolicy(policy)} className="cursor-pointer border-t odd:bg-white even:bg-slate-50 hover:bg-orange-50">
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
  return <Card><CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><Button asChild variant="outline" className="mb-3"><Link href={dashboardHref} onClick={onBack}>Back to Dashboard</Link></Button><h1 className="text-2xl font-extrabold">Renewal Alerts</h1></div><Button onClick={markAllRead}>Mark All as Read</Button></CardHeader><div className="divide-y">{data.notifications.map((n) => <button key={n.id} onClick={() => onClick(n.id)} className="flex w-full items-center gap-3 p-5 text-left hover:bg-slate-50"><span className={`h-3 w-3 rounded-full ${n.is_read ? "bg-slate-200" : "bg-accent"}`} /><div><p className="font-semibold">{n.message}</p><p className="text-sm text-slate-500">{formatDate(n.created_at)}</p></div></button>)}</div></Card>;
}

function Profile({ data, saveProfile, saveNotificationSettings, uploadAvatar, changePassword }: { data: AppData; saveProfile: (formData: FormData) => void; saveNotificationSettings: (formData: FormData) => void; uploadAvatar: (event: ChangeEvent<HTMLInputElement>) => void; changePassword: (formData: FormData) => void }) {
  const [tab, setTab] = useState<"profile" | "notifications">("profile");
  return (
    <Card>
      <CardHeader>
        <h1 className="text-2xl font-extrabold">Profile & Settings</h1>
        <div className="mt-4 inline-flex rounded-xl bg-slate-100 p-1">
          <button className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === "profile" ? "bg-white text-primary shadow-sm" : "text-slate-500"}`} onClick={() => setTab("profile")}>Profile</button>
          <button className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === "notifications" ? "bg-white text-primary shadow-sm" : "text-slate-500"}`} onClick={() => setTab("notifications")}>Notification Settings</button>
        </div>
      </CardHeader>
      <CardContent>
        {tab === "profile" ? (
          <div className="max-w-2xl space-y-4">
            <Avatar profile={data.profile} large />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold"><Upload className="h-4 w-4" /> Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={uploadAvatar} /></label>
            <form action={saveProfile} className="space-y-4"><label className="block text-sm font-semibold">Full Name<Input name="full_name" defaultValue={data.profile.full_name} className="mt-1" /></label><label className="block text-sm font-semibold">Email<Input readOnly defaultValue={data.profile.email ?? ""} placeholder="No email on this account" className="mt-1 bg-slate-50" /></label><label className="block text-sm font-semibold">Phone Number<Input name="phone_number" defaultValue={data.profile.phone_number ?? ""} className="mt-1" /></label><label className="block text-sm font-semibold">Company Name<Input name="company_name" defaultValue={data.profile.company_name ?? ""} className="mt-1" /></label><Button>Save Changes</Button></form>
            <form action={changePassword} className="border-t pt-4"><h3 className="font-bold">Change Password</h3><Input name="current_password" className="mt-3" type="password" placeholder="Current Password" /><Input name="new_password" className="mt-3" type="password" placeholder="New Password" /><Input name="confirm_password" className="mt-3" type="password" placeholder="Confirm New Password" /><Button className="mt-4">Update Password</Button></form>
          </div>
        ) : (
          <form action={saveNotificationSettings} className="max-w-2xl space-y-4"><p className="rounded-xl bg-orange-50 p-3 text-sm font-semibold text-orange-700">WhatsApp delivery requires approved Meta templates and production credentials. Email and in-app renewal tracking remain available during beta.</p><label className="flex items-center justify-between gap-4 font-semibold">Enable WhatsApp Notifications <input name="whatsapp_enabled" type="checkbox" defaultChecked={data.profile.whatsapp_enabled} /></label><label className="flex items-center justify-between gap-4 font-semibold">Send me daily WhatsApp renewal summary <input name="agent_whatsapp_summary_enabled" type="checkbox" defaultChecked={data.profile.agent_whatsapp_summary_enabled} /></label><label className="flex items-center justify-between gap-4 font-semibold">Enable Email Notifications <input name="email_notifications_enabled" type="checkbox" defaultChecked={data.profile.email_notifications_enabled} /></label><label className="flex items-center justify-between gap-4 font-semibold">Enable Birthday WhatsApp Messages <input name="birthday_messages_enabled" type="checkbox" defaultChecked={data.profile.birthday_messages_enabled} /></label><div className="rounded-xl bg-slate-50 p-4"><p className="font-bold text-primary">Renewal reminder schedule</p><div className="mt-3 space-y-3"><label className="flex items-center gap-3"><input name="reminder_30_enabled" type="checkbox" defaultChecked={data.profile.reminder_30_enabled} /> 30 Days Before Expiry</label><label className="flex items-center gap-3"><input name="reminder_14_enabled" type="checkbox" defaultChecked={data.profile.reminder_14_enabled} /> 14 Days Before Expiry</label><label className="flex items-center gap-3"><input name="reminder_7_enabled" type="checkbox" defaultChecked={data.profile.reminder_7_enabled} /> 7 Days Before Expiry</label></div></div><Button>Save Settings</Button></form>
        )}
      </CardContent>
    </Card>
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
      date_of_birth: String(form.get("date_of_birth") ?? ""),
      address: String(form.get("address") ?? "")
    });
  }
  return <ModalFrame title={client ? "Edit Client" : "Add New Client"} onClose={onClose}><form onSubmit={submit} className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-semibold">Full Name<Input name="full_name" required defaultValue={client?.full_name} className="mt-1" /></label><label className="block text-sm font-semibold">Phone Number<Input name="phone_number" required defaultValue={client?.phone_number} className="mt-1" /></label><label className="block text-sm font-semibold">Email<Input name="email" type="email" defaultValue={client?.email ?? ""} className="mt-1" /></label><label className="block text-sm font-semibold">Date of Birth<Input name="date_of_birth" type="date" defaultValue={client?.date_of_birth ?? ""} className="mt-1" /></label><label className="block text-sm font-semibold md:col-span-2">Address<Input name="address" defaultValue={client?.address ?? ""} className="mt-1" /></label><div className="md:col-span-2 mt-2 flex justify-end gap-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button>Save Client</Button></div></form></ModalFrame>;
}

function PolicyModal({ policy, clients, onClose, onSave }: { policy?: PolicyWithClient; clients: Client[]; onClose: () => void; onSave: (payload: PolicySavePayload) => void }) {
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
        date_of_birth: String(form.get("client_date_of_birth") ?? ""),
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
      renewal_status: String(form.get("renewal_status") ?? "Not Started") as RenewalStatus,
      notes: String(form.get("notes") ?? ""),
      commission_rate: Number(form.get("commission_rate") ?? policy?.commission?.commission_rate ?? 10),
      payment_status: String(form.get("payment_status") ?? policy?.commission?.payment_status ?? "Pending") as "Paid" | "Pending"
    });
  }
  return (
    <ModalFrame title={policy ? "Edit Policy" : "Add New Policy"} onClose={onClose}>
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
              <label className="block text-sm font-semibold">Full Name<Input name="client_full_name" required className="mt-1 bg-white" /></label>
              <label className="block text-sm font-semibold">Phone Number<Input name="client_phone_number" required className="mt-1 bg-white" /></label>
              <label className="block text-sm font-semibold">Email<Input name="client_email" type="email" className="mt-1 bg-white" /></label>
              <label className="block text-sm font-semibold">Date of Birth<Input name="client_date_of_birth" type="date" className="mt-1 bg-white" /></label>
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
            <label className="block text-sm font-semibold">Renewal Status<Select name="renewal_status" defaultValue={policy?.renewal_status ?? "Not Started"} className="mt-1">{renewalStatuses.map((item) => <option key={item}>{item}</option>)}</Select></label>
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

function PolicyDetailPanel({ policy, onClose }: { policy: PolicyWithClient; onClose: () => void }) {
  const commission = policy.commission;
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
    ["Renewal Status", policy.renewal_status],
    ["Commission Rate", commission ? `${commission.commission_rate}%` : "—"],
    ["Commission Amount", commission ? formatCurrency(policy.premium_amount * commission.commission_rate / 100) : "—"],
    ["Payment Status", commission?.payment_status ?? "—"],
    ["Payment Date", commission?.payment_date ? formatDate(commission.payment_date) : "—"]
  ];
  return <div className="fixed inset-y-0 right-0 z-[55] w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-soft"><div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-extrabold">Policy Detail</h2><Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button></div><div className="space-y-5"><Card><CardContent className="space-y-2 p-5"><h3 className="font-bold">{policy.client.full_name}</h3><p>{policy.client.phone_number}</p><p>{policy.client.email || "No email"}</p><p>{policy.client.date_of_birth ? `Birthday: ${formatDate(policy.client.date_of_birth)}` : "Birthday not recorded"}</p></CardContent></Card><dl className="grid grid-cols-2 gap-4 text-sm">{rows.map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><dt className="font-bold text-slate-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl><Card><CardHeader><h3 className="font-bold">Notes</h3></CardHeader><CardContent><p className="text-sm leading-6 text-slate-600">{policy.notes || "No notes recorded."}</p></CardContent></Card></div></div>;
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

function ConfirmModal({ title, body, onClose, onConfirm }: { title: string; body: string; onClose: () => void; onConfirm: () => Promise<void> | void }) {
  return <ModalFrame title={title} onClose={onClose} narrow><p className="text-slate-600">{body}</p><div className="mt-6 flex justify-end gap-3"><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={onConfirm}>Delete</Button></div></ModalFrame>;
}

function DemoModal({ onClose }: { onClose: () => void }) {
  return <ModalFrame title="Create your free account" onClose={onClose} narrow><p className="text-slate-600">This feature is available to registered agents. Create your free PolicyHQ account to get started.</p><div className="mt-6 flex flex-wrap gap-3"><Button asChild><Link href="/sign-up">Sign Up Free</Link></Button><Button variant="outline" onClick={onClose}>Continue Browsing Demo</Button></div></ModalFrame>;
}

function ModalFrame({ title, children, onClose, narrow = false }: { title: string; children: ReactNode; onClose: () => void; narrow?: boolean }) {
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"><Card className={`max-h-[92vh] w-full overflow-y-auto ${narrow ? "max-w-md" : "max-w-3xl"}`}><CardHeader className="flex flex-row items-center justify-between"><h2 className="text-xl font-extrabold">{title}</h2><Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button></CardHeader><CardContent>{children}</CardContent></Card></div>;
}

function Avatar({ profile, large = false }: { profile: AppData["profile"]; large?: boolean }) {
  if (profile.avatar_url) {
    const size = large ? 96 : 40;
    return <Image src={profile.avatar_url} alt="" width={size} height={size} className={`${large ? "h-24 w-24" : "h-10 w-10"} rounded-full object-cover`} />;
  }
  return <div className={`${large ? "h-24 w-24 text-3xl" : "h-10 w-10 text-sm"} flex items-center justify-center rounded-full bg-orange-100 font-extrabold text-orange-700`}>{firstName(profile.full_name)[0]}</div>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  return <div className="overflow-auto"><table className="w-full min-w-[720px] text-sm"><thead className="sticky top-0 bg-slate-50"><tr>{headers.map((h) => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-t odd:bg-white even:bg-slate-50">{row.map((cell, j) => <td key={j} className="px-4 py-3">{cell}</td>)}</tr>)}</tbody></table></div>;
}

function Empty({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return <Card><CardContent className="flex min-h-96 flex-col items-center justify-center text-center"><FileText className="h-12 w-12 text-slate-300" /><h1 className="mt-4 text-xl font-bold">{title}</h1><Button className="mt-5" onClick={onAction}>{action}</Button></CardContent></Card>;
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

function UrgencyBadge(date: string) {
  const level = urgency(date);
  if (level === "urgent") return <Badge tone="red">URGENT</Badge>;
  if (level === "soon") return <Badge tone="amber">DUE SOON</Badge>;
  return null;
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

function commissionInPeriod(commission: Commission, mode: CommissionPeriodMode, month: number, year: number) {
  if (mode === "All Time") return true;
  const paidAt = new Date(`${commissionEarnedDate(commission)}T00:00:00Z`);
  if (paidAt.getUTCFullYear() !== year) return false;
  return mode === "Yearly" || paidAt.getUTCMonth() === month;
}

function commissionPeriodLabel(mode: CommissionPeriodMode, month: number, year: number) {
  if (mode === "All Time") return "all time";
  if (mode === "Yearly") return `${year}`;
  return `${monthNames[month]} ${year}`;
}

function availableCommissionYears(commissions: Commission[]) {
  const currentYear = new Date().getFullYear();
  const years = new Set<number>();
  for (let year = currentYear; year >= 2015; year -= 1) {
    years.add(year);
  }
  commissions.forEach((commission) => {
    years.add(new Date(`${commissionEarnedDate(commission)}T00:00:00Z`).getUTCFullYear());
  });
  return Array.from(years).sort((a, b) => b - a);
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
    "Renewal Status": policy.renewal_status
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
