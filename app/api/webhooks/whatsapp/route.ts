import crypto from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type WebhookStatus = {
  id?: string;
  status?: string;
};

type WebhookMessage = {
  id?: string;
  type?: string;
};

type WebhookChangeValue = {
  statuses?: WebhookStatus[];
  messages?: WebhookMessage[];
};

type WebhookChange = {
  value?: WebhookChangeValue;
  field?: string;
};

type WebhookEntry = {
  changes?: WebhookChange[];
};

type WhatsAppWebhookPayload = {
  entry?: WebhookEntry[];
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 100;
const SIGNATURE_PREFIX = "sha256=";
const MESSAGE_ID_PREVIEW_LENGTH = 12;

const rateLimitGlobal = globalThis as typeof globalThis & {
  policyhqWhatsappWebhookRateLimit?: Map<string, RateLimitBucket>;
};

function getRateLimitStore() {
  if (!rateLimitGlobal.policyhqWhatsappWebhookRateLimit) {
    rateLimitGlobal.policyhqWhatsappWebhookRateLimit = new Map<string, RateLimitBucket>();
  }

  return rateLimitGlobal.policyhqWhatsappWebhookRateLimit;
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(ipAddress: string) {
  const now = Date.now();
  const store = getRateLimitStore();
  const bucket = store.get(ipAddress);

  if (!bucket || bucket.resetAt <= now) {
    store.set(ipAddress, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  bucket.count += 1;

  return bucket.count > RATE_LIMIT_MAX_REQUESTS;
}

function verifyMetaSignature(payload: string, signatureHeader: string | null, appSecret: string) {
  if (!signatureHeader?.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", appSecret)
    .update(payload, "utf8")
    .digest("hex");
  const providedSignature = signatureHeader.slice(SIGNATURE_PREFIX.length);
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const providedBuffer = Buffer.from(providedSignature, "hex");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function isWebhookPayload(value: unknown): value is WhatsAppWebhookPayload {
  return typeof value === "object" && value !== null;
}

function getWebhookSummary(payload: WhatsAppWebhookPayload) {
  const firstChange = payload.entry?.[0]?.changes?.[0];
  const firstMessage = firstChange?.value?.messages?.[0];
  const firstStatus = firstChange?.value?.statuses?.[0];
  const messageId = firstMessage?.id || firstStatus?.id || "unknown";
  const messageType = firstMessage?.type || firstStatus?.status || firstChange?.field || "unknown";

  return {
    messageIdPreview: messageId.slice(0, MESSAGE_ID_PREVIEW_LENGTH),
    messageType
  };
}

export async function GET(request: Request) {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error("WhatsApp webhook verify token is not configured.");
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 500 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  console.error("Rejected WhatsApp webhook verification attempt.");
  return NextResponse.json({ error: "Invalid webhook request" }, { status: 403 });
}

export async function POST(request: Request) {
  const ipAddress = getClientIp(request);

  if (isRateLimited(ipAddress)) {
    console.error(`Rate limited WhatsApp webhook request from ${ipAddress}.`);
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    console.error("Meta app secret is not configured.");
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 500 });
  }

  const rawPayload = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(rawPayload, signature, appSecret)) {
    console.error(`Rejected WhatsApp webhook request with invalid signature from ${ipAddress}.`);
    return NextResponse.json({ error: "Invalid webhook request" }, { status: 403 });
  }

  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(rawPayload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!isWebhookPayload(parsedPayload)) {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  const summary = getWebhookSummary(parsedPayload);

  if (process.env.NODE_ENV !== "production") {
    console.error(
      `WhatsApp webhook received type=${summary.messageType} message_id=${summary.messageIdPreview}`
    );
  }

  return NextResponse.json({ received: true });
}
