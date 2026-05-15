import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

type ClientRecord = {
  id: string;
  agent_id: string;
  full_name: string;
  phone_number: string;
  date_of_birth: string | null;
  deleted_at: string | null;
  profiles: {
    id: string;
    full_name: string;
    company_name: string | null;
    whatsapp_enabled: boolean;
    birthday_messages_enabled: boolean;
  };
};

type RawClientRecord = Omit<ClientRecord, "profiles"> & {
  profiles: ClientRecord["profiles"] | ClientRecord["profiles"][] | null;
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

type WhatsAppTextBody = {
  messaging_product: "whatsapp";
  to: string;
  type: "text";
  text: { body: string };
};

type WhatsAppBody = WhatsAppTemplateBody | WhatsAppTextBody;

type MetaSendResponse = {
  messages?: Array<{ id?: string }>;
};

type CriticalFunctionError = {
  message: string;
  stack: string | null;
  timestamp: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://policyhq.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const approvedTemplateNames = new Set(["renewal_reminder", "birthday_message", "agent_daily_summary"]);
const functionName = "send-birthday-messages";

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

function todayParts() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Accra",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const [year, month, day] = formatter.format(new Date()).split("-");
  return { date: `${year}-${month}-${day}`, month, day };
}

function isBirthdayToday(dateOfBirth: string | null, month: string, day: string) {
  if (!dateOfBirth) return false;
  const [, birthMonth, birthDay] = dateOfBirth.split("-");
  return birthMonth === month && birthDay === day;
}

function birthdayMessage(client: ClientRecord) {
  const companyName = client.profiles.company_name ?? client.profiles.full_name;
  return `Happy birthday, ${client.full_name}! ${companyName} wishes you good health, happiness, and a wonderful year ahead. Thank you for trusting us with your insurance needs.`;
}

function firstJoinedRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function normalizeClientRecord(client: RawClientRecord) {
  const profile = firstJoinedRecord(client.profiles);
  if (!profile) return null;

  return {
    ...client,
    profiles: profile
  } satisfies ClientRecord;
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
  if (err instanceof Error && err.message === "Client does not belong to birthday agent") {
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

async function insertWhatsAppLog(
  supabase: ReturnType<typeof createClient>,
  client: ClientRecord,
  templateName: string,
  status: "sent" | "failed",
  messageId: string | null,
  errorReason: string | null
) {
  await supabase.from("whatsapp_logs").insert({
    agent_id: client.agent_id,
    client_id: client.id,
    template_name: templateName,
    status,
    message_id: messageId,
    error_reason: errorReason
  });
}

async function sendWhatsApp(client: ClientRecord, message: string) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN")?.trim();
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim();
  const version = Deno.env.get("WHATSAPP_API_VERSION") ?? "v20.0";
  const templateName = Deno.env.get("WHATSAPP_BIRTHDAY_TEMPLATE_NAME")?.trim() || "birthday_message";
  const templateLanguage = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "en";
  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp credentials are not configured");
  }
  if (client.profiles.id !== client.agent_id) {
    throw new Error("Client does not belong to birthday agent");
  }
  const recipientPhone = toMetaPhoneNumber(client.phone_number);
  if (!recipientPhone) {
    throw new Error("Invalid WhatsApp phone number");
  }

  const body: WhatsAppBody = Deno.env.get("WHATSAPP_BIRTHDAY_TEMPLATE_NAME")?.trim()
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
                { type: "text", text: client.full_name },
                { type: "text", text: client.profiles.company_name ?? client.profiles.full_name }
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
      await response.json().catch((): null => null);
      throw new Error("WhatsApp send failed");
    }

    const metaResponse = await response.json().catch((): MetaSendResponse | null => null);
    return { messageId: metaResponse?.messages?.[0]?.id ?? null, templateName };
  } catch {
    throw new Error("WhatsApp send failed");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const trustedJwt = requireTrustedJwt(req);
  if ("error" in trustedJwt) return trustedJwt.error;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabase = createClient(supabaseUrl, trustedJwt.token, {
    global: {
      headers: {
        Authorization: `Bearer ${trustedJwt.token}`
      }
    }
  });

  try {
    const { date, month, day } = todayParts();
    const results: Array<Record<string, unknown>> = [];

    const { data, error } = await supabase
      .from("clients")
      .select("id, agent_id, full_name, phone_number, date_of_birth, deleted_at, profiles(id, full_name, company_name, whatsapp_enabled, birthday_messages_enabled)")
      .not("date_of_birth", "is", null)
      .is("deleted_at", null);

    if (error) {
      throw new Error("Birthday client query failed");
    }

    for (const rawClient of (data ?? []) as unknown as RawClientRecord[]) {
      const client = normalizeClientRecord(rawClient);
      if (!client) {
        results.push({ status: "missing_join_data", timestamp: new Date().toISOString() });
        continue;
      }

      if (!isBirthdayToday(client.date_of_birth, month, day)) continue;
      if (client.deleted_at) continue;

      const alreadySent = await supabase
        .from("notification_logs")
        .select("id")
        .eq("agent_id", client.agent_id)
        .eq("client_id", client.id)
        .eq("channel", "whatsapp")
        .eq("status", "sent")
        .eq("detail", `birthday:${date}:sent`)
        .gte("created_at", `${date}T00:00:00+00:00`)
        .lt("created_at", `${date}T23:59:59+00:00`)
        .maybeSingle();

      if (alreadySent.data) {
        results.push({ client_id: client.id, status: "skipped_duplicate", timestamp: new Date().toISOString() });
        continue;
      }

      if (!client.profiles.whatsapp_enabled || !client.profiles.birthday_messages_enabled) {
        await supabase.from("notification_logs").insert({
          agent_id: client.agent_id,
          client_id: client.id,
          channel: "whatsapp",
          status: "skipped",
          detail: `birthday:${date}:disabled`
        });
        results.push({ client_id: client.id, status: "skipped_disabled", timestamp: new Date().toISOString() });
        continue;
      }

      const message = birthdayMessage(client);
      let status = "sent";
      let detail = `birthday:${date}:sent`;

      try {
        const sent = await sendWhatsApp(client, message);
        await insertWhatsAppLog(supabase, client, sent.templateName, "sent", sent.messageId, null);
      } catch (err) {
        status = "failed";
        const reason = sanitizeWhatsAppError(err);
        detail = `birthday:${date}:${reason}`;
        await insertWhatsAppLog(supabase, client, "birthday_message", "failed", null, reason);
      }

      await supabase.from("notification_logs").insert({
        agent_id: client.agent_id,
        client_id: client.id,
        channel: "whatsapp",
        status,
        detail
      });

      await supabase.from("notifications").insert({
        agent_id: client.agent_id,
        client_id: client.id,
        type: "birthday",
        message: status === "sent"
          ? `Birthday WhatsApp message sent to ${client.full_name}.`
          : `Birthday WhatsApp message failed for ${client.full_name}.`
      });

      results.push({ client_id: client.id, status, timestamp: new Date().toISOString() });
    }

    return new Response(JSON.stringify({ ok: true, date, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    await logCriticalFunctionError(supabase, err);
    console.error("Birthday message job failed", err instanceof Error ? err.message : "Unknown error");
    return new Response(JSON.stringify({ ok: false, error: "Birthday message job failed." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
