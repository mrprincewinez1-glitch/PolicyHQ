import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

type PolicyRecord = {
  id: string;
  agent_id: string;
  policy_number: string;
  policy_type: string;
  insurer_name: string;
  expiry_date: string;
  renewal_status: string;
  clients: {
    id: string;
    agent_id: string;
    full_name: string;
    phone_number: string;
    email: string | null;
    deleted_at: string | null;
  };
  profiles: {
    id: string;
    full_name: string;
    company_name: string | null;
    phone_number: string | null;
    whatsapp_enabled: boolean;
    email_notifications_enabled: boolean;
    agent_whatsapp_summary_enabled: boolean;
    reminder_30_enabled: boolean;
    reminder_14_enabled: boolean;
    reminder_7_enabled: boolean;
  };
};

type RawPolicyRecord = Omit<PolicyRecord, "clients" | "profiles"> & {
  clients: PolicyRecord["clients"] | PolicyRecord["clients"][] | null;
  profiles: PolicyRecord["profiles"] | PolicyRecord["profiles"][] | null;
};

type WhatsAppTextBody = {
  messaging_product: "whatsapp";
  to: string;
  type: "text";
  text: { body: string };
};

type WhatsAppTemplateParameter = { type: "text"; text: string };

type WhatsAppTemplateBody = {
  messaging_product: "whatsapp";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components: [{ type: "body"; parameters: WhatsAppTemplateParameter[] }];
  };
};

type WhatsAppBody = WhatsAppTextBody | WhatsAppTemplateBody;

type MetaErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

type MetaSendResponse = {
  messages?: Array<{ id?: string }>;
};

type WhatsAppSendResult = {
  messageId: string | null;
};

type RunStats = {
  policiesChecked: number;
  messagesSent: number;
  messagesFailed: number;
  messagesSkipped: number;
};

type CriticalFunctionError = {
  message: string;
  stack: string | null;
  timestamp: string;
};

type AgentSummaryItem = {
  days: number;
  clientName: string;
  policyType: string;
  insurerName: string;
  expiryDate: string;
};

type AgentSummary = {
  agentId: string;
  profile: PolicyRecord["profiles"];
  items: AgentSummaryItem[];
};

const reminderTypes = new Map([
  [30, "renewal_30"],
  [14, "renewal_14"],
  [7, "renewal_7"]
]);
const approvedTemplateNames = new Set(["renewal_reminder", "birthday_message", "agent_daily_summary"]);
const dailyRunTemplateName = "renewal_reminder";
const functionName = "send-renewal-reminders";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://policyhq.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function authError(message: string, status: number) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function decodeJwtPayload(token: string) {
  const [, payload] = token.split(".");
  if (!payload) return null;
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, "=");
  return JSON.parse(atob(padded)) as { role?: string };
}

function requireTrustedJwt(req: Request) {
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return { error: authError("Missing Supabase JWT.", 401) };
  }

  const token = authorization.slice("Bearer ".length);
  try {
    const claims = decodeJwtPayload(token);
    if (claims?.role !== "service_role") {
      return { error: authError("A trusted server JWT is required.", 403) };
    }
  } catch {
    return { error: authError("Invalid Supabase JWT.", 401) };
  }

  return { token };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function todayUtcWindow() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00Z`));
}

function shouldSend(profile: PolicyRecord["profiles"], days: number) {
  if (days === 30) return profile.reminder_30_enabled;
  if (days === 14) return profile.reminder_14_enabled;
  return profile.reminder_7_enabled;
}

function firstJoinedRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function normalizePolicyRecord(policy: RawPolicyRecord) {
  const client = firstJoinedRecord(policy.clients);
  const profile = firstJoinedRecord(policy.profiles);
  if (!client || !profile) return null;

  return {
    ...policy,
    clients: client,
    profiles: profile
  } satisfies PolicyRecord;
}

function normalizePhoneNumber(phoneNumber: string) {
  const trimmed = phoneNumber.trim();
  if (trimmed.startsWith("+")) {
    const digits = trimmed.replace(/[^\d]/g, "");
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    return `+233${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith("233")) {
    return `+${digits}`;
  }

  return null;
}

function toMetaPhoneNumber(phoneNumber: string) {
  const normalized = normalizePhoneNumber(phoneNumber);
  return normalized ? normalized.slice(1) : null;
}

function requireApprovedTemplateName(templateName: string) {
  if (!approvedTemplateNames.has(templateName)) {
    throw new Error("WhatsApp template is not approved");
  }
}

function sanitizeWhatsAppError(err: unknown) {
  if (err instanceof Error && err.message === "Invalid WhatsApp phone number") {
    return err.message;
  }
  if (err instanceof Error && err.message === "WhatsApp credentials are not configured") {
    return err.message;
  }
  if (err instanceof Error && err.message === "WhatsApp template is not approved") {
    return err.message;
  }
  if (err instanceof Error && err.message === "Client does not belong to policy agent") {
    return err.message;
  }
  return "WhatsApp send failed";
}

function criticalFunctionError(err: unknown): CriticalFunctionError {
  if (err instanceof Error) {
    return {
      message: err.message || "Unknown function error",
      stack: err.stack ?? null,
      timestamp: new Date().toISOString()
    };
  }

  return {
    message: "Unknown function error",
    stack: null,
    timestamp: new Date().toISOString()
  };
}

async function sendCriticalErrorEmail(error: CriticalFunctionError) {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const alertEmail = Deno.env.get("FUNCTION_ERROR_ALERT_EMAIL")?.trim() || "mrprincewinez1@gmail.com";
  if (!apiKey || !alertEmail) return;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "PolicyHQ Alerts <alerts@policyhq.app>",
        to: [alertEmail],
        subject: `PolicyHQ critical function failure: ${functionName}`,
        html: `
          <div style="font-family: Inter, Arial, sans-serif; color: #0F172A; line-height: 1.6;">
            <h2 style="margin: 0 0 12px;">Critical Edge Function Failure</h2>
            <p><strong>Function:</strong> ${functionName}</p>
            <p><strong>Time:</strong> ${error.timestamp}</p>
            <p><strong>Error:</strong> ${error.message}</p>
          </div>
        `
      })
    });

    if (!response.ok) {
      console.error("Critical function error alert email failed");
    }
  } catch {
    console.error("Critical function error alert email crashed");
  }
}

async function logCriticalFunctionError(supabase: ReturnType<typeof createClient>, err: unknown) {
  const error = criticalFunctionError(err);

  try {
    const insert = await supabase.from("function_error_logs").insert({
      function_name: functionName,
      error_message: error.message,
      error_stack: error.stack
    });

    if (insert.error) {
      console.error("Critical function error log insert failed", insert.error.message);
    }
  } catch (logErr) {
    console.error("Critical function error log insert crashed", logErr instanceof Error ? logErr.message : "Unknown error");
  }

  await sendCriticalErrorEmail(error);
}

async function postWhatsAppMessage(body: WhatsAppBody): Promise<WhatsAppSendResult> {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN")?.trim();
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim();
  const version = Deno.env.get("WHATSAPP_API_VERSION")?.trim() || "v20.0";
  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp credentials are not configured");
  }

  try {
    const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      await response.json().catch((): MetaErrorResponse | null => null);
      throw new Error("WhatsApp send failed");
    }

    const metaResponse = await response.json().catch((): MetaSendResponse | null => null);
    return { messageId: metaResponse?.messages?.[0]?.id ?? null };
  } catch {
    throw new Error("WhatsApp send failed");
  }
}

function renewalTemplateName(days: number) {
  return Deno.env.get("WHATSAPP_RENEWAL_TEMPLATE_NAME")?.trim() || "renewal_reminder";
}

async function recentlySentWhatsApp(
  supabase: ReturnType<typeof createClient>,
  policy: PolicyRecord,
  templateName: string
) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data, error } = await supabase
      .from("whatsapp_logs")
      .select("id")
      .eq("client_id", policy.clients.id)
      .eq("policy_id", policy.id)
      .eq("template_name", templateName)
      .eq("status", "sent")
      .gte("sent_at", since)
      .maybeSingle();

    if (error) {
      console.error("WhatsApp duplicate check failed", error.message);
      throw new Error("WhatsApp duplicate check failed");
    }

    return Boolean(data);
  } catch (err) {
    console.error("WhatsApp duplicate check crashed", err instanceof Error ? err.message : "Unknown error");
    throw new Error("WhatsApp duplicate check failed");
  }
}

async function remindersAlreadySentToday(supabase: ReturnType<typeof createClient>) {
  const { start, end } = todayUtcWindow();

  try {
    const { data, error } = await supabase
      .from("whatsapp_logs")
      .select("id")
      .eq("template_name", dailyRunTemplateName)
      .eq("status", "sent")
      .gte("sent_at", start)
      .lt("sent_at", end)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Daily renewal run check failed", error.message);
      return { checked: false, alreadyRan: true };
    }

    return { checked: true, alreadyRan: Boolean(data) };
  } catch (err) {
    console.error("Daily renewal run check crashed", err instanceof Error ? err.message : "Unknown error");
    return { checked: false, alreadyRan: true };
  }
}

async function insertWhatsAppLog(
  supabase: ReturnType<typeof createClient>,
  policy: PolicyRecord,
  templateName: string,
  status: "sent" | "failed",
  messageId: string | null,
  errorReason: string | null
) {
  try {
    const { error } = await supabase.from("whatsapp_logs").insert({
      agent_id: policy.agent_id,
      client_id: policy.clients.id,
      policy_id: policy.id,
      template_name: templateName,
      status,
      message_id: messageId,
      error_reason: errorReason
    });

    if (error) {
      console.error("WhatsApp log insert failed", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("WhatsApp log insert crashed", err instanceof Error ? err.message : "Unknown error");
    return false;
  }
}

async function sendClientWhatsApp(policy: PolicyRecord, message: string, days: number) {
  const templateName = renewalTemplateName(days);
  if (policy.clients.agent_id !== policy.agent_id || policy.profiles.id !== policy.agent_id) {
    throw new Error("Client does not belong to policy agent");
  }

  const configuredTemplateName = Deno.env.get("WHATSAPP_RENEWAL_TEMPLATE_NAME")?.trim();
  const templateLanguage = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "en";
  const recipientPhone = toMetaPhoneNumber(policy.clients.phone_number);
  if (!recipientPhone) {
    throw new Error("Invalid WhatsApp phone number");
  }

  const body: WhatsAppBody = configuredTemplateName
    ? (requireApprovedTemplateName(templateName), {
        messaging_product: "whatsapp",
        to: recipientPhone,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLanguage },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: policy.clients.full_name },
                { type: "text", text: policy.profiles.company_name ?? policy.profiles.full_name },
                { type: "text", text: policy.policy_type },
                { type: "text", text: policy.policy_number },
                { type: "text", text: policy.insurer_name },
                { type: "text", text: formatDate(policy.expiry_date) }
              ]
            }
          ]
        }
      })
    : {
        messaging_product: "whatsapp",
        to: recipientPhone,
        type: "text",
        text: { body: message }
      };

  return await postWhatsAppMessage(body);
}

function buildAgentSummaryMessage(summary: AgentSummary) {
  const visibleItems = summary.items.slice(0, 8);
  const lines = visibleItems.map((item, index) => (
    `${index + 1}. ${item.clientName} - ${item.policyType} with ${item.insurerName} - expires ${formatDate(item.expiryDate)} (${item.days} days)`
  ));
  const extra = summary.items.length > visibleItems.length
    ? `\n\n${summary.items.length - visibleItems.length} more follow-ups are waiting in PolicyHQ.`
    : "";
  return `Good morning. You have ${summary.items.length} renewal follow-up${summary.items.length === 1 ? "" : "s"} today:\n\n${lines.join("\n")}${extra}\n\nOpen PolicyHQ to continue.`;
}

async function sendAgentSummaryWhatsApp(summary: AgentSummary) {
  const templateName = Deno.env.get("WHATSAPP_AGENT_SUMMARY_TEMPLATE_NAME")?.trim();
  if (!templateName) {
    return "template_not_configured";
  }
  requireApprovedTemplateName(templateName);
  if (!summary.profile.phone_number) {
    throw new Error("Agent phone number is not configured");
  }
  const agentPhone = toMetaPhoneNumber(summary.profile.phone_number);
  if (!agentPhone) {
    throw new Error("Invalid WhatsApp phone number");
  }
  const message = buildAgentSummaryMessage(summary);
  const templateLanguage = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "en";
  const body: WhatsAppBody = {
    messaging_product: "whatsapp",
    to: agentPhone,
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components: [{ type: "body", parameters: [{ type: "text", text: message }] }]
    }
  };

  const result = await postWhatsAppMessage(body);
  return result.messageId;
}

async function logAgentSummary(supabase: ReturnType<typeof createClient>, summary: AgentSummary) {
  if (!summary.profile.agent_whatsapp_summary_enabled) {
    return {
      agent_id: summary.agentId,
      status: "skipped",
      detail: `agent_summary:${summary.items.length}:disabled`,
      timestamp: new Date().toISOString()
    };
  }

  try {
    const result = await sendAgentSummaryWhatsApp(summary);
    if (result === "template_not_configured") {
      return {
        agent_id: summary.agentId,
        status: "skipped",
        detail: `agent_summary:${summary.items.length}:template_not_configured`,
        timestamp: new Date().toISOString()
      };
    }

    const summaryLog = await supabase.from("whatsapp_logs").insert({
      agent_id: summary.agentId,
      template_name: "agent_daily_summary",
      status: "sent",
      message_id: result
    });
    if (summaryLog.error) {
      console.error("Agent WhatsApp summary log insert failed", summaryLog.error.message);
    }

    const notificationLog = await supabase.from("notification_logs").insert({
      agent_id: summary.agentId,
      channel: "whatsapp",
      status: "sent",
      detail: `agent_summary:${summary.items.length}:sent`
    });
    if (notificationLog.error) {
      console.error("Agent summary notification log insert failed", notificationLog.error.message);
    }

    const notification = await supabase.from("notifications").insert({
      agent_id: summary.agentId,
      type: "general",
      message: `Daily WhatsApp renewal summary sent to you for ${summary.items.length} follow-up${summary.items.length === 1 ? "" : "s"}.`
    });
    if (notification.error) {
      console.error("Agent summary notification insert failed", notification.error.message);
    }

    return {
      agent_id: summary.agentId,
      status: "sent",
      detail: `agent_summary:${summary.items.length}:sent`,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    try {
      const { error } = await supabase.from("whatsapp_logs").insert({
        agent_id: summary.agentId,
        template_name: "agent_daily_summary",
        status: "failed",
        error_reason: sanitizeWhatsAppError(err)
      });
      if (error) {
        console.error("Agent WhatsApp summary failure log insert failed", error.message);
      }
    } catch (logErr) {
      console.error("Agent WhatsApp summary failure log insert crashed", logErr instanceof Error ? logErr.message : "Unknown error");
    }

    return {
      agent_id: summary.agentId,
      status: "failed",
      detail: `agent_summary:${summary.items.length}:failed`,
      timestamp: new Date().toISOString()
    };
  }
}

async function sendEmail(policy: PolicyRecord, message: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey || !policy.clients.email) return;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "PolicyHQ <renewals@policyhq.app>",
      to: [policy.clients.email],
      subject: `Renewal reminder for policy ${policy.policy_number}`,
      html: `
        <div style="font-family: Inter, Arial, sans-serif; color: #0F172A; line-height: 1.6;">
          <h2 style="margin: 0 0 12px;">Policy renewal reminder</h2>
          <p>${message}</p>
          <p style="margin-top: 24px;">Thank you,<br />${policy.profiles.company_name ?? policy.profiles.full_name}</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    throw new Error(`Email send failed with status ${response.status}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return authError("Method not allowed.", 405);
  }

  const trustedJwt = requireTrustedJwt(req);
  if ("error" in trustedJwt) return trustedJwt.error;

  try {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabase = createClient(supabaseUrl, trustedJwt.token, {
    global: {
      headers: {
        Authorization: `Bearer ${trustedJwt.token}`
      }
    }
  });
  const today = new Date();
  const results: Array<Record<string, unknown>> = [];
  const agentSummaries = new Map<string, AgentSummary>();
  const stats: RunStats = {
    policiesChecked: 0,
    messagesSent: 0,
    messagesFailed: 0,
    messagesSkipped: 0
  };

  console.info("Renewal reminder job started", {
    started_at: new Date().toISOString()
  });

  const dailyRun = await remindersAlreadySentToday(supabase);
  if (dailyRun.alreadyRan) {
    console.info("Renewal reminder job skipped", {
      reason: dailyRun.checked ? "already_ran_today" : "daily_run_check_failed",
      ...stats,
      finished_at: new Date().toISOString()
    });

    return new Response(JSON.stringify({
      ok: true,
      skipped: true,
      reason: dailyRun.checked ? "already_ran_today" : "daily_run_check_failed",
      stats
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  for (const days of [30, 14, 7]) {
    const expiryDate = addDays(today, days);
    let data: RawPolicyRecord[] = [];
    try {
      const query = await supabase
        .from("policies")
        .select("id, agent_id, policy_number, policy_type, insurer_name, expiry_date, renewal_status, clients(id, agent_id, full_name, phone_number, email, deleted_at), profiles(id, full_name, company_name, phone_number, whatsapp_enabled, email_notifications_enabled, agent_whatsapp_summary_enabled, reminder_30_enabled, reminder_14_enabled, reminder_7_enabled)")
        .eq("status", "Active")
        .eq("expiry_date", expiryDate);

      if (query.error) {
        console.error("Renewal policy query failed", query.error.message);
        results.push({ days, status: "query_failed", timestamp: new Date().toISOString() });
        continue;
      }

      data = (query.data ?? []) as unknown as RawPolicyRecord[];
    } catch (err) {
      console.error("Renewal policy query crashed", err instanceof Error ? err.message : "Unknown error");
      results.push({ days, status: "query_failed", timestamp: new Date().toISOString() });
      continue;
    }

    for (const rawPolicy of data) {
      stats.policiesChecked += 1;
      const policy = normalizePolicyRecord(rawPolicy);
      if (!policy) {
        stats.messagesSkipped += 1;
        results.push({ days, status: "missing_join_data", timestamp: new Date().toISOString() });
        continue;
      }
      if (policy.clients.deleted_at) {
        stats.messagesSkipped += 1;
        results.push({ days, status: "skipped_deleted_client", timestamp: new Date().toISOString() });
        continue;
      }

      if (!shouldSend(policy.profiles, days)) {
        stats.messagesSkipped += 1;
        continue;
      }

      const companyName = policy.profiles.company_name ?? policy.profiles.full_name;
      const message = `Hello ${policy.clients.full_name}, this is a reminder from ${companyName} that your ${policy.policy_type} policy (Policy No: ${policy.policy_number}) with ${policy.insurer_name} is due for renewal on ${formatDate(policy.expiry_date)}. Please contact your agent to renew on time. Thank you.`;
      const summary = agentSummaries.get(policy.agent_id) ?? { agentId: policy.agent_id, profile: policy.profiles, items: [] };
      summary.items.push({
        days,
        clientName: policy.clients.full_name,
        policyType: policy.policy_type,
        insurerName: policy.insurer_name,
        expiryDate: policy.expiry_date
      });
      agentSummaries.set(policy.agent_id, summary);

      const activity = {
        policy_id: policy.id,
        agent_id: policy.agent_id,
        client_id: policy.clients.id,
        days,
        whatsapp: "skipped",
        email: "skipped",
        timestamp: new Date().toISOString()
      };

      try {
        if (policy.profiles.whatsapp_enabled) {
          const templateName = renewalTemplateName(days);
          const duplicate = await recentlySentWhatsApp(supabase, policy, templateName);
          if (duplicate) {
            console.warn("Skipped duplicate WhatsApp reminder within 24 hours", {
              policy_id: policy.id,
              client_id: policy.clients.id,
              template_name: templateName
            });
            activity.whatsapp = "skipped_duplicate_24h";
            stats.messagesSkipped += 1;
          } else {
            const sent = await sendClientWhatsApp(policy, message, days);
            await insertWhatsAppLog(supabase, policy, templateName, "sent", sent.messageId, null);
            activity.whatsapp = "sent";
            stats.messagesSent += 1;
          }
        } else {
          stats.messagesSkipped += 1;
        }
      } catch (err) {
        const templateName = renewalTemplateName(days);
        const reason = sanitizeWhatsAppError(err);
        await insertWhatsAppLog(supabase, policy, templateName, "failed", null, reason);
        activity.whatsapp = reason;
        stats.messagesFailed += 1;
      }

      try {
        if (policy.profiles.email_notifications_enabled) {
          await sendEmail(policy, message);
          activity.email = "sent";
        }
      } catch (err) {
        activity.email = err instanceof Error ? err.message : "failed";
      }

      try {
        const notification = await supabase.from("notifications").insert({
          agent_id: policy.agent_id,
          policy_id: policy.id,
          client_id: policy.clients.id,
          type: reminderTypes.get(days),
          message: `${days}-day renewal reminder sent for ${policy.clients.full_name} (${policy.policy_number}).`
        });
        if (notification.error) {
          console.error("Renewal notification insert failed", notification.error.message);
        }
      } catch (err) {
        console.error("Renewal notification insert crashed", err instanceof Error ? err.message : "Unknown error");
      }

      try {
        const logs = await supabase.from("notification_logs").insert([
          {
            agent_id: policy.agent_id,
            policy_id: policy.id,
            client_id: policy.clients.id,
            channel: "whatsapp",
            status: activity.whatsapp === "sent" ? "sent" : String(activity.whatsapp).startsWith("skipped") ? "skipped" : "failed",
            detail: String(activity.whatsapp)
          },
          {
            agent_id: policy.agent_id,
            policy_id: policy.id,
            client_id: policy.clients.id,
            channel: "email",
            status: activity.email === "sent" ? "sent" : activity.email === "skipped" ? "skipped" : "failed",
            detail: String(activity.email)
          }
        ]);
        if (logs.error) {
          console.error("Renewal notification logs insert failed", logs.error.message);
        }
      } catch (err) {
        console.error("Renewal notification logs insert crashed", err instanceof Error ? err.message : "Unknown error");
      }

      if (activity.whatsapp === "sent" || String(activity.whatsapp).startsWith("skipped") || activity.email === "sent") {
        try {
          const processedLog = await supabase.from("notification_logs").insert({
            agent_id: policy.agent_id,
            policy_id: policy.id,
            client_id: policy.clients.id,
            channel: "whatsapp",
            status: "sent",
            detail: `${days}-day:${policy.expiry_date}:processed`
          });
          if (processedLog.error) {
            console.error("Renewal processed log insert failed", processedLog.error.message);
          }
        } catch (err) {
          console.error("Renewal processed log insert crashed", err instanceof Error ? err.message : "Unknown error");
        }
      }

      if (policy.renewal_status === "Upcoming") {
        try {
          const update = await supabase.from("policies").update({ renewal_status: "Contacted" }).eq("id", policy.id);
          if (update.error) {
            console.error("Renewal status update failed", update.error.message);
          }
        } catch (err) {
          console.error("Renewal status update crashed", err instanceof Error ? err.message : "Unknown error");
        }
      }

      results.push(activity);
    }
  }

  for (const summary of agentSummaries.values()) {
    results.push(await logAgentSummary(supabase, summary));
  }

  console.info("Renewal reminder job finished", {
    ...stats,
    finished_at: new Date().toISOString()
  });

  return new Response(JSON.stringify({ ok: true, stats, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
  } catch (err) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabase = createClient(supabaseUrl, trustedJwt.token, {
      global: {
        headers: {
          Authorization: `Bearer ${trustedJwt.token}`
        }
      }
    });
    await logCriticalFunctionError(supabase, err);
    console.error("Renewal reminder job failed", err instanceof Error ? err.message : "Unknown error");
    return new Response(JSON.stringify({ ok: false, error: "Renewal reminder job failed." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
