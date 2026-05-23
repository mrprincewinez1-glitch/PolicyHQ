import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

type ClientRow = {
  id: string;
  agent_id: string;
  full_name: string;
  phone_number: string;
  email: string | null;
  date_of_birth: string | null;
  address: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type PolicyRow = {
  id: string;
  agent_id: string;
  client_id: string;
  policy_number: string;
  policy_type: string;
  insurance_category: string;
  vehicle_number: string | null;
  property_location: string | null;
  insurer_name: string;
  start_date: string;
  expiry_date: string;
  premium_amount: number;
  currency: string;
  status: string;
  renewal_status: string;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

type CriticalFunctionError = {
  message: string;
  stack: string | null;
  timestamp: string;
};

const functionName = "backup-weekly-data";
const backupBucket = "policy-backups";
const csvHeaders = [
  "table_name",
  "id",
  "agent_id",
  "client_id",
  "full_name",
  "phone_number",
  "email",
  "date_of_birth",
  "address",
  "deleted_at",
  "policy_number",
  "policy_type",
  "insurance_category",
  "vehicle_number",
  "property_location",
  "insurer_name",
  "start_date",
  "expiry_date",
  "premium_amount",
  "currency",
  "status",
  "renewal_status",
  "notes",
  "created_at",
  "updated_at"
];

const allowedOrigin = Deno.env.get("POLICYHQ_ALLOWED_ORIGIN")?.trim() || "https://policy-hq-beta.vercel.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-policyhq-cron-secret",
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

function requireCronSecret(req: Request) {
  const expectedSecret = Deno.env.get("POLICYHQ_CRON_SECRET")?.trim();
  if (!expectedSecret) {
    return { error: authError("Cron secret is not configured.", 500) };
  }

  const providedSecret = req.headers.get("x-policyhq-cron-secret")?.trim();
  if (providedSecret !== expectedSecret) {
    return { error: authError("Invalid cron secret.", 403) };
  }

  return { ok: true };
}

function csvValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function clientToCsvRow(client: ClientRow) {
  return [
    "clients",
    client.id,
    client.agent_id,
    "",
    client.full_name,
    client.phone_number,
    client.email,
    client.date_of_birth,
    client.address,
    client.deleted_at,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    client.created_at,
    client.updated_at
  ].map(csvValue).join(",");
}

function policyToCsvRow(policy: PolicyRow) {
  return [
    "policies",
    policy.id,
    policy.agent_id,
    policy.client_id,
    "",
    "",
    "",
    "",
    "",
    "",
    policy.policy_number,
    policy.policy_type,
    policy.insurance_category,
    policy.vehicle_number,
    policy.property_location,
    policy.insurer_name,
    policy.start_date,
    policy.expiry_date,
    policy.premium_amount,
    policy.currency,
    policy.status,
    policy.renewal_status,
    policy.notes,
    policy.created_at,
    policy.updated_at
  ].map(csvValue).join(",");
}

async function fetchAllRows<T>(
  supabase: ReturnType<typeof createClient>,
  tableName: string,
  columns: string
) {
  const rows: T[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(tableName)
      .select(columns)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Backup query failed for ${tableName}`);
    }

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < pageSize) break;
  }

  return rows;
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
  const alertEmail = Deno.env.get("FUNCTION_ERROR_ALERT_EMAIL")?.trim();
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

async function insertBackupLog(
  supabase: ReturnType<typeof createClient>,
  status: "success" | "failed",
  filePath: string | null
) {
  const { error } = await supabase.from("backup_logs").insert({
    tables_backed_up: ["clients", "policies"],
    file_path: filePath,
    status
  });

  if (error) {
    console.error("Backup log insert failed", error.message);
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
  const cronSecret = requireCronSecret(req);
  if ("error" in cronSecret) return cronSecret.error;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabase = createClient(supabaseUrl, trustedJwt.token, {
    global: {
      headers: {
        Authorization: `Bearer ${trustedJwt.token}`
      }
    }
  });

  let filePath: string | null = null;

  try {
    const [clients, policies] = await Promise.all([
      fetchAllRows<ClientRow>(
        supabase,
        "clients",
        "id, agent_id, full_name, phone_number, email, date_of_birth, address, deleted_at, created_at, updated_at"
      ),
      fetchAllRows<PolicyRow>(
        supabase,
        "policies",
        "id, agent_id, client_id, policy_number, policy_type, insurance_category, vehicle_number, property_location, insurer_name, start_date, expiry_date, premium_amount, currency, status, renewal_status, notes, created_at, updated_at"
      )
    ]);

    const backupDate = new Date().toISOString().slice(0, 10);
    filePath = `weekly/${backupDate}/clients-policies.csv`;
    const csv = [
      csvHeaders.join(","),
      ...clients.map(clientToCsvRow),
      ...policies.map(policyToCsvRow)
    ].join("\n");

    const upload = await supabase.storage
      .from(backupBucket)
      .upload(filePath, new Blob([csv], { type: "text/csv;charset=utf-8" }), {
        contentType: "text/csv;charset=utf-8",
        upsert: true
      });

    if (upload.error) {
      throw new Error("Backup upload failed");
    }

    await insertBackupLog(supabase, "success", filePath);

    return new Response(JSON.stringify({
      ok: true,
      file_path: filePath,
      clients: clients.length,
      policies: policies.length
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    await insertBackupLog(supabase, "failed", filePath);
    await logCriticalFunctionError(supabase, err);
    console.error("Weekly backup failed", err instanceof Error ? err.message : "Unknown error");

    return new Response(JSON.stringify({ ok: false, error: "Weekly backup failed." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
