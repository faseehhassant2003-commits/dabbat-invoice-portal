import "server-only";
import type { Order, PaymentStatus } from "@/lib/types";
import { sampleOrders } from "@/lib/sample-data";
import { getShopifyConfig, isDemoMode } from "./config";
import { requireApiSession } from "./auth";
import { shopifyGraphql, shopifyGraphqlForWebhook } from "./oauth";
import { orderDetailQuery, recentOrdersQuery } from "./order-queries";
import { toMinorUnits } from "@/lib/invoice-core";
import { recordShopifyTaxData, type ShopifyTaxLine } from "@/lib/shopify-tax";

type MoneyBag = { shopMoney: { amount: string; currencyCode: string } };
type RawLine = { id: string; title: string; variantTitle: string | null; sku: string | null; quantity: number; originalUnitPriceSet: MoneyBag; originalTotalSet: MoneyBag; taxLines: ShopifyTaxLine[] };
type RawOrder = {
  id: string; name: string; createdAt: string; updatedAt: string; edited: boolean; cancelledAt: string | null; currencyCode: string; email: string | null;
  displayFinancialStatus: string | null; displayFulfillmentStatus: string; paymentGatewayNames: string[]; taxesIncluded: boolean; estimatedTaxes: boolean;
  subtotalPriceSet: MoneyBag | null; totalDiscountsSet: MoneyBag | null; totalPriceSet: MoneyBag; totalTaxSet: MoneyBag | null;
  billingAddress: { name: string | null; address1: string | null; address2: string | null; city: string | null; province: string | null; zip: string | null; country: string | null } | null;
  shippingLines: { nodes: { discountedPriceSet: MoneyBag; taxLines: ShopifyTaxLine[] }[]; pageInfo: { hasNextPage: boolean } };
  lineItems: { nodes: RawLine[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
};

function normalize(raw: RawOrder, complete: boolean): Order {
  const currency = raw.currencyCode;
  const amount = (bag: MoneyBag | null) => {
    if (!bag) return 0;
    if (bag.shopMoney.currencyCode !== currency) throw new Error("Mixed currencies cannot be invoiced.");
    return toMinorUnits(bag.shopMoney.amount, currency);
  };
  const customer = raw.billingAddress?.name || "Customer details unavailable";
  const status = (raw.displayFinancialStatus || "UNKNOWN").toLowerCase();
  const known = ["paid", "pending", "partially_paid", "refunded", "partially_refunded", "authorized", "voided"];
  const paymentStatus = (known.includes(status) ? status : "unknown") as PaymentStatus;
  const address = raw.billingAddress;
  const discountedSubtotal = amount(raw.subtotalPriceSet);
  // Complete invoices derive gross product prices from the purchased lines. This
  // keeps free-shipping discounts out of the product discount and avoids adding
  // them twice when shippingLines already reports discounted shipping prices.
  const subtotal = complete ? raw.lineItems.nodes.reduce((sum, line) => sum + amount(line.originalTotalSet), 0) : discountedSubtotal + amount(raw.totalDiscountsSet);
  const discount = subtotal - discountedSubtotal;
  return {
    id: raw.id.split("/").at(-1)!, number: raw.name, createdAt: raw.createdAt,
    customer, ...(raw.email ? { email: raw.email } : {}),
    initials: customer.split(/\s+/).slice(0, 2).map((word) => word[0]).join(""),
    paymentStatus, paymentMethod: raw.paymentGatewayNames.join(", ") || "Not specified by Shopify",
    fulfillment: raw.displayFulfillmentStatus.replaceAll("_", " ").toLowerCase(), currency,
    items: raw.lineItems.nodes.map((line) => ({ id: line.id, name: line.title, variant: line.variantTitle || "Default", sku: line.sku || "—", quantity: line.quantity, unitPrice: amount(line.originalUnitPriceSet), total: amount(line.originalTotalSet) })),
    billing: address ? { name: address.name || "Name unavailable", lines: [address.address1, address.address2, [address.city, address.province, address.zip].filter(Boolean).join(", "), address.country].filter((line): line is string => Boolean(line)), ...(raw.email ? { email: raw.email } : {}) } : null,
    itemsComplete: complete, subtotal, discount, shipping: raw.shippingLines.nodes.reduce((sum, line) => sum + amount(line.discountedPriceSet), 0),
    tax: amount(raw.totalTaxSet), total: amount(raw.totalPriceSet), taxesIncluded: raw.taxesIncluded, source: "shopify",
    taxData: recordShopifyTaxData({ currency, complete: complete && !raw.shippingLines.pageInfo.hasNextPage, estimated: raw.estimatedTaxes, edited: raw.edited, cancelledAt: raw.cancelledAt, products: raw.lineItems.nodes, shipping: raw.shippingLines.nodes }),
    note: !complete ? "Open the order to load all line items before generating an invoice." : "Order values before returns. This invoice records the payment status at the time it was generated.",
  };
}

function sampleWithTaxData(order: Order): Order {
  return { ...order, taxData: { source: "sample", complete: true, estimated: false, edited: false, cancelledAt: null, collectedAt: new Date().toISOString(), lines: [] } };
}

async function assertLiveRead() {
  await requireApiSession();
  if (process.env.SHOPIFY_CUSTOMER_DATA_APPROVED !== "true") {
    throw new Error("Customer data access is not enabled. Confirm Shopify protected customer data access before loading orders.");
  }
}

export async function listOrders(search?: string): Promise<Order[]> {
  const term = (search || "").trim();
  if (isDemoMode()) return sampleOrders.filter((order) => !term || order.number.toLowerCase().includes(term.toLowerCase().replace(/^#/, ""))).map(sampleWithTaxData);
  await assertLiveRead();
  if (term && !/^#?[a-zA-Z0-9-]{1,40}$/.test(term)) throw new Error("Enter an order number using letters, numbers, or a hyphen.");
  const result = await shopifyGraphql<{ orders: { nodes: RawOrder[] } }>(recentOrdersQuery, { search: term ? `name:${term.replace(/^#/, "")}` : null });
  return result.orders.nodes.map((raw) => normalize(raw, !raw.lineItems.pageInfo.hasNextPage));
}

export async function getOrder(id: string): Promise<Order | null> {
  if (isDemoMode()) { const order = sampleOrders.find((item) => item.id === id); return order ? sampleWithTaxData(order) : null; }
  await assertLiveRead();
  return loadOrder(id, shopifyGraphql);
}

export async function getOrderForWebhook(id: string): Promise<Order | null> {
  if (isDemoMode()) throw new Error("Shopify webhooks are disabled in sample mode.");
  if (!getShopifyConfig().customerDataApproved) throw new Error("Customer data access is not enabled for background invoice processing.");
  return loadOrder(id, shopifyGraphqlForWebhook);
}

async function loadOrder(
  id: string,
  query: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>,
): Promise<Order | null> {
  if (!/^\d{1,30}$/.test(id)) return null;
  let after: string | null = null;
  let order: RawOrder | null = null;
  const lines: RawLine[] = [];
  for (let page = 0; page < 20; page++) {
    const result: { order: RawOrder | null } = await query<{ order: RawOrder | null }>(orderDetailQuery, { id: `gid://shopify/Order/${id}`, after });
    if (!result.order) return null;
    if (order && result.order.updatedAt !== order.updatedAt) throw new Error("This order has changed while its items were loading. Please try again.");
    if (!order) order = result.order;
    lines.push(...result.order.lineItems.nodes);
    if (result.order.shippingLines.pageInfo.hasNextPage) throw new Error("This order has too many shipping lines for this invoice template. No invoice was generated.");
    if (!result.order.lineItems.pageInfo.hasNextPage) {
      order.lineItems.nodes = lines;
      return normalize(order, true);
    }
    const next = result.order.lineItems.pageInfo.endCursor;
    if (!next || next === after) throw new Error("Could not load every line item. No invoice was generated.");
    after = next;
  }
  throw new Error("This order exceeds the supported item count. No invoice was generated.");
}
