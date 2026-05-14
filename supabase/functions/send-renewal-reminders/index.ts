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
    full_name: string;
    phone_number: string;
    email: string | null;
  };
  profiles: {
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
  return phoneNumber.replace(/[^\d]/g, "");
}

async function postWhatsAppMessage(body: WhatsAppBody): Promise<WhatsAppSendResult> {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN")?.trim();
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim();
  const version = Deno.env.get("WHATSAPP_API_VERSION")?.trim() || "v20.0";
  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp credentials are not configured");
  }

  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const metaError = await response.json().catch((): MetaErrorResponse | null => null);
    const metaMessage = metaError?.error?.message;
    const safeMessage = metaMessage ? `: ${metaMessage}` : "";
    throw new Error(`WhatsApp send failed with status ${response.status}${safeMessage}`);
  }

  const metaResponse = await response.json().catch((): MetaSendResponse | null => null);
  return { messageId: metaResponse?.messages?.[0]?.id ?? null };
}

function renewalTemplateName(days: number) {
  return Deno.env.get("WHATSAPP_RENEWAL_TEMPLATE_NAME")?.trim() || `renewal_text_${days}`;
}

async function recentlySentWhatsApp(
  supabase: ReturnType<typeof createClient>,
  policy: PolicyRecord,
  templateName: string
) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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
    throw new Error("WhatsApp duplicate check failed");
  }

  return Boolean(data);
}

async function insertWhatsAppLog(
  supabase: ReturnType<typeof createClient>,
  policy: PolicyRecord,
  templateName: string,
  status: "sent" | "failed",
  messageId: string | null,
  errorReason: string | null
) {
  await supabase.from("whatsapp_logs").insert({
    agent_id: policy.agent_id,
    client_id: policy.clients.id,
    policy_id: policy.id,
    template_name: templateName,
    status,
    message_id: messageId,
    error_reason: errorReason
  });
}

async function sendClientWhatsApp(policy: PolicyRecord, message: string, days: number) {
  const templateName = renewalTemplateName(days);
  const configuredTemplateName = Deno.env.get("WHATSAPP_RENEWAL_TEMPLATE_NAME")?.trim();
  const templateLanguage = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "en";
  const body: WhatsAppBody = configuredTemplateName
    ? {
        messaging_product: "whatsapp",
        to: normalizePhoneNumber(policy.clients.phone_number),
        type: "template",
        template: {
          name: configuredTemplateName,
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
      }
    : {
        messaging_product: "whatsapp",
        to: normalizePhoneNumber(policy.clients.phone_number),
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
  if (!summary.profile.phone_number) {
    throw new Error("Agent phone number is not configured");
  }
  const message = buildAgentSummaryMessage(summary);
  const templateLanguage = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "en";
  const body: WhatsAppBody = {
    messaging_product: "whatsapp",
    to: normalizePhoneNumber(summary.profile.phone_number),
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components: [{ type: "body", parameters: [{ type: "text", text: message }] }]
    }
  };

  await postWhatsAppMessage(body);
  return "sent";
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

    await supabase.from("notification_logs").insert({
      agent_id: summary.agentId,
      channel: "whatsapp",
      status: "sent",
      detail: `agent_summary:${summary.items.length}:sent`
    });

    await supabase.from("notifications").insert({
      agent_id: summary.agentId,
      type: "general",
      message: `Daily WhatsApp renewal summary sent to you for ${summary.items.length} follow-up${summary.items.length === 1 ? "" : "s"}.`
    });

    return {
      agent_id: summary.agentId,
      status: "sent",
      detail: `agent_summary:${summary.items.length}:sent`,
      timestamp: new Date().toISOString()
    };
  } catch {
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

  for (const days of [30, 14, 7]) {
    const expiryDate = addDays(today, days);
    const { data, error } = await supabase
      .from("policies")
      .select("id, agent_id, policy_number, policy_type, insurer_name, expiry_date, renewal_status, clients(id, full_name, phone_number, email), profiles(full_name, company_name, phone_number, whatsapp_enabled, email_notifications_enabled, agent_whatsapp_summary_enabled, reminder_30_enabled, reminder_14_enabled, reminder_7_enabled)")
      .eq("status", "Active")
      .eq("expiry_date", expiryDate);

    if (error) {
      results.push({ days, status: "query_failed", error: error.message, timestamp: new Date().toISOString() });
      continue;
    }

    for (const rawPolicy of (data ?? []) as unknown as RawPolicyRecord[]) {
      const policy = normalizePolicyRecord(rawPolicy);
      if (!policy) {
        results.push({ days, status: "missing_join_data", timestamp: new Date().toISOString() });
        continue;
      }

      if (!shouldSend(policy.profiles, days)) continue;

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
          } else {
            const sent = await sendClientWhatsApp(policy, message, days);
            await insertWhatsAppLog(supabase, policy, templateName, "sent", sent.messageId, null);
            activity.whatsapp = "sent";
          }
        }
      } catch (err) {
        const templateName = renewalTemplateName(days);
        const reason = err instanceof Error ? err.message : "failed";
        await insertWhatsAppLog(supabase, policy, templateName, "failed", null, reason);
        activity.whatsapp = reason;
      }

      try {
        if (policy.profiles.email_notifications_enabled) {
          await sendEmail(policy, message);
          activity.email = "sent";
        }
      } catch (err) {
        activity.email = err instanceof Error ? err.message : "failed";
      }

      await supabase.from("notifications").insert({
        agent_id: policy.agent_id,
        policy_id: policy.id,
        client_id: policy.clients.id,
        type: reminderTypes.get(days),
        message: `${days}-day renewal reminder sent for ${policy.clients.full_name} (${policy.policy_number}).`
      });

      await supabase.from("notification_logs").insert([
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

      if (activity.whatsapp === "sent" || String(activity.whatsapp).startsWith("skipped") || activity.email === "sent") {
        await supabase.from("notification_logs").insert({
          agent_id: policy.agent_id,
          policy_id: policy.id,
          client_id: policy.clients.id,
          channel: "whatsapp",
          status: "sent",
          detail: `${days}-day:${policy.expiry_date}:processed`
        });
      }

      if (policy.renewal_status === "Not Started") {
        await supabase.from("policies").update({ renewal_status: "Reminder Sent" }).eq("id", policy.id);
      }

      results.push(activity);
    }
  }

  for (const summary of agentSummaries.values()) {
    results.push(await logAgentSummary(supabase, summary));
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
  } catch (err) {
    console.error("Renewal reminder job failed", err instanceof Error ? err.message : "Unknown error");
    return new Response(JSON.stringify({ ok: false, error: "Renewal reminder job failed." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
