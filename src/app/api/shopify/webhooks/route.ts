import { NextResponse } from "next/server";
import { getShopifyConfig } from "@/lib/server/config";
import { createInvoiceForWebhook } from "@/lib/server/invoices";
import { emailSavedInvoice } from "@/lib/server/email";
import { getOrderForWebhook } from "@/lib/server/orders";
import { validShopifyWebhookHmac } from "@/lib/server/security";
import { updatePrivateStore } from "@/lib/server/storage";
import { claimWebhookEvent } from "@/lib/integration-reliability";
import { automaticInvoicesEnabled } from "@/lib/automatic-invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const topics = new Set(["orders/create", "orders/paid"]);
const maxBodyBytes = 2 * 1024 * 1024;
const headers = { "Cache-Control": "no-store" };

async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBodyBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    reader.releaseLock();
  }
}

async function finishWebhook(id: string, status: "processed" | "ignored" | "failed") {
  await updatePrivateStore((store) => {
    const record = store.shopifyWebhooks?.find((item) => item.id === id);
    if (record) record.status = status;
  });
}

export async function POST(request: Request) {
  let config;
  try {
    config = getShopifyConfig();
  } catch {
    return NextResponse.json({ error: "Shopify webhook integration is not configured." }, { status: 503, headers });
  }

  const rawBody = await readBoundedBody(request);
  if (!rawBody) return NextResponse.json({ error: "Webhook body is missing or too large." }, { status: 413, headers });
  const topic = request.headers.get("x-shopify-topic") ?? "";
  const shop = request.headers.get("x-shopify-shop-domain")?.toLowerCase() ?? "";
  const webhookId = request.headers.get("x-shopify-webhook-id") ?? "";
  const hmac = request.headers.get("x-shopify-hmac-sha256") ?? "";
  if (!validShopifyWebhookHmac(rawBody, hmac, config.clientSecret) || shop !== config.shop ||
      !topics.has(topic) || !/^[a-zA-Z0-9-]{8,128}$/.test(webhookId)) {
    return NextResponse.json({ error: "Webhook verification failed." }, { status: 401, headers });
  }

  let payload: { id?: unknown; admin_graphql_api_id?: unknown };
  try {
    payload = JSON.parse(Buffer.from(rawBody).toString("utf8")) as { id?: unknown; admin_graphql_api_id?: unknown };
  } catch {
    return NextResponse.json({ error: "Webhook payload is invalid." }, { status: 400, headers });
  }
  const orderIdValue = typeof payload.id === "number" || typeof payload.id === "string" ? String(payload.id) : "";
  const orderId = orderIdValue || (typeof payload.admin_graphql_api_id === "string" ? payload.admin_graphql_api_id.split("/").at(-1) ?? "" : "");
  if (!/^\d{1,30}$/.test(orderId)) return NextResponse.json({ error: "Webhook order identifier is invalid." }, { status: 400, headers });

  let automaticSending = false;
  const claimed = await updatePrivateStore((store) => {
    automaticSending = automaticInvoicesEnabled(store.automaticInvoicesEnabled, process.env.GMAIL_AUTO_SEND_ENABLED);
    const events = store.shopifyWebhooks ?? [];
    const result = claimWebhookEvent(events, { id: webhookId, topic, orderId, receivedAt: Date.now() });
    store.shopifyWebhooks = events.slice(-5000);
    return result;
  });
  if (claimed === null) return NextResponse.json({ received: true, duplicate: true }, { headers });

  if (!automaticSending) {
    await finishWebhook(webhookId, "ignored");
    return NextResponse.json({ received: true, automaticSending: false }, { headers });
  }

  try {
    if (!config.customerDataApproved) throw new Error("Protected customer data access is not enabled.");
    const order = await getOrderForWebhook(orderId);
    if (!order) throw new Error("Order was not found in Shopify.");
    const eligible = topic === "orders/paid"
      ? order.paymentStatus === "paid"
      : order.paymentStatus === "pending" && /cash on delivery|\bcod\b/i.test(order.paymentMethod);
    if (!eligible) {
      await finishWebhook(webhookId, "ignored");
      return NextResponse.json({ received: true, eligible: false }, { headers });
    }
    const invoice = await createInvoiceForWebhook(order);
    const requestId = claimed === "retry" ? `shopify-${webhookId}-${Date.now().toString(36)}` : `shopify-${webhookId}`;
    await emailSavedInvoice(invoice.id, requestId, false, true, "gmail-api");
    await finishWebhook(webhookId, "processed");
    return NextResponse.json({ received: true, processed: true }, { headers });
  } catch {
    await finishWebhook(webhookId, "failed");
    console.error("Shopify invoice webhook processing failed.", { webhookId });
    return NextResponse.json({ error: "Webhook was verified but processing failed. Review the portal and handle the invoice manually." }, { status: 500, headers });
  }
}
