import "server-only";
import { automaticInvoiceReadiness, automaticInvoicesEnabled } from "@/lib/automatic-invoices";
import { requireApiSession } from "./auth";
import { getAppOrigin, isDemoMode } from "./config";
import { readPrivateStore, updatePrivateStore } from "./storage";
import { shopifyGraphql } from "./oauth";

async function webhookReadiness(): Promise<string | null> {
  try {
    const result = await shopifyGraphql<{ webhookSubscriptions: { nodes: { topic: string; uri: string }[] } }>("query AutomaticInvoiceWebhooks { webhookSubscriptions(first: 100) { nodes { topic uri } pageInfo { hasNextPage } } }");
    const target = `${getAppOrigin()}/api/shopify/webhooks`;
    const subscriptions = result.webhookSubscriptions.nodes;
    return ["ORDERS_CREATE", "ORDERS_PAID"].every(topic => subscriptions.some(subscription => subscription.topic === topic && subscription.uri === target))
      ? null : "Connect Shopify order-created and order-paid notifications to this portal before enabling automatic invoices.";
  } catch { return "Shopify order notifications could not be verified. Check the Shopify connection before enabling automatic invoices."; }
}

export async function getAutomaticInvoiceSettings() {
  if (isDemoMode()) return { enabled: false, unavailableReason: "Automatic invoices are available in live mode." };
  await requireApiSession();
  const store = await readPrivateStore();
  const unavailableReason = automaticInvoiceReadiness({ shopifyConnected: Boolean(store.shopify), customerDataApproved: process.env.SHOPIFY_CUSTOMER_DATA_APPROVED === "true", gmailConnected: Boolean(store.googleMail?.refreshToken), gmailTestPassed: Boolean(store.googleMail?.testedAt) });
  return {
    enabled: automaticInvoicesEnabled(store.automaticInvoicesEnabled, process.env.GMAIL_AUTO_SEND_ENABLED),
    unavailableReason: unavailableReason ?? await webhookReadiness(),
  };
}

export async function saveAutomaticInvoiceSettings(enabled: boolean) {
  await requireApiSession();
  if (isDemoMode()) throw new Error("Automatic invoices are available in live mode.");
  if (enabled) {
    const reason = await webhookReadiness();
    if (reason) throw new Error(reason);
  }
  await updatePrivateStore(store => {
    if (enabled) {
      const reason = automaticInvoiceReadiness({ shopifyConnected: Boolean(store.shopify), customerDataApproved: process.env.SHOPIFY_CUSTOMER_DATA_APPROVED === "true", gmailConnected: Boolean(store.googleMail?.refreshToken), gmailTestPassed: Boolean(store.googleMail?.testedAt) });
      if (reason) throw new Error(reason);
    }
    store.automaticInvoicesEnabled = enabled;
  });
  return getAutomaticInvoiceSettings();
}
