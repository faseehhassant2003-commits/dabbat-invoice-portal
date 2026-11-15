import { randomUUID } from "node:crypto";
import type { InvoiceRecord, Order, Seller } from "./types";
import { assertGstInvoice, defaultGstSettings, validateGstSettings } from "./gst";
export type InvoiceSnapshot = { invoice: InvoiceRecord; order: Order; seller: Seller };

// Shopify returns decimal strings. Parse exactly instead of multiplying a float.
export function toMinorUnits(value: string, currency: string): number {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
  if (digits !== 2) throw new Error("This invoice template currently supports currencies with two decimal places only.");
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("Shopify returned an unsupported money amount.");
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw new Error("Order amount exceeds the supported range.");
  return result;
}

export function assertInvoiceOrder(order: Order): void {
  if (order.itemsComplete === false) throw new Error("Could not load every line item. No invoice was generated.");
  const values = [order.subtotal, order.discount, order.shipping, order.tax, order.total];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error("The order contains unsupported monetary values.");
  if (!order.items.length || order.items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isSafeInteger(item.total) || item.total < 0 || !Number.isSafeInteger(item.unitPrice) || item.unitPrice < 0)) throw new Error("This order has unsupported line items.");
  if (order.items.some((item) => item.unitPrice * item.quantity !== item.total)) throw new Error("This order has line amounts that do not match their quantities and unit prices.");
  const subtotal = order.items.reduce((sum, item) => sum + item.total, 0);
  if (subtotal !== order.subtotal) throw new Error("Line items do not match the order subtotal. This order needs manual review before invoicing.");
  const total = order.subtotal - order.discount + order.shipping + (order.taxesIncluded ? 0 : order.tax);
  if (total !== order.total) throw new Error("Order totals include adjustments this template cannot represent. No invoice was generated; review this order in Shopify.");
  if (order.discount > order.subtotal) throw new Error("The discount exceeds the product subtotal.");
}

export function makeInvoiceSnapshot(order: Order, seller: Seller, number: string, now = new Date()): InvoiceSnapshot {
  assertInvoiceOrder(order);
  const snapshotSeller = { ...seller, gst: validateGstSettings(seller.gst ?? defaultGstSettings(), now) };
  // Legacy registration text belongs only to existing saved documents.
  delete snapshotSeller.taxRegistration;
  assertGstInvoice(order, snapshotSeller.gst, now);
  const invoice: InvoiceRecord = {
    id: `${order.source === "sample" ? "sample-" : ""}${randomUUID()}`,
    number, orderId: order.id, orderNumber: order.number, customer: order.customer,
    total: order.total, currency: order.currency, createdAt: now.toISOString(),
    paymentStatus: order.paymentStatus, source: order.source,
  };
  // Never retain a mutable reference to an order or seller configuration.
  return structuredClone({ invoice, order, seller: snapshotSeller });
}
