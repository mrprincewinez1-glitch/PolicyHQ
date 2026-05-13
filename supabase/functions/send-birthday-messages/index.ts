import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

type ClientRecord = {
  id: string;
  agent_id: string;
  full_name: string;
  phone_number: string;
  date_of_birth: string | null;
  profiles: {
    full_name: string;
    company_name: string | null;
    whatsapp_enabled: boolean;
    birthday_messages_enabled: boolean;
  };
};

type RawClientRecord = Omit<ClientRecord, "profiles"> & {
  profiles: ClientRecord["profiles"] | ClientRecord["profiles"][] | null;
};

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

async function sendWhatsApp(client: ClientRecord, message: string) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const version = Deno.env.get("WHATSAPP_API_VERSION") ?? "v20.0";
  const templateName = Deno.env.get("WHATSAPP_BIRTHDAY_TEMPLATE_NAME");
  const templateLanguage = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "en";
  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp credentials are not configured");
  }

  const body = templateName
    ? {
        messaging_product: "whatsapp",
        to: client.phone_number.replace(/[^\d]/g, ""),
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
      }
    : {
        messaging_product: "whatsapp",
        to: client.phone_number.replace(/[^\d]/g, ""),
        type: "text",
        text: { body: message }
      };

  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`WhatsApp birthday send failed with status ${response.status}`);
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
  const { date, month, day } = todayParts();
  const results: Array<Record<string, unknown>> = [];

  const { data, error } = await supabase
    .from("clients")
    .select("id, agent_id, full_name, phone_number, date_of_birth, profiles(full_name, company_name, whatsapp_enabled, birthday_messages_enabled)")
    .not("date_of_birth", "is", null);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message, timestamp: new Date().toISOString() }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  for (const rawClient of (data ?? []) as unknown as RawClientRecord[]) {
    const client = normalizeClientRecord(rawClient);
    if (!client) {
      results.push({ status: "missing_join_data", timestamp: new Date().toISOString() });
      continue;
    }

    if (!isBirthdayToday(client.date_of_birth, month, day)) continue;

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
      await sendWhatsApp(client, message);
    } catch (err) {
      status = "failed";
      detail = err instanceof Error ? `birthday:${date}:${err.message}` : `birthday:${date}:failed`;
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
});
