import test from "node:test";
import assert from "node:assert/strict";
import { isValidElement, type ReactNode } from "react";
import { InvoiceDocument } from "../src/components/invoice-document";
import { defaultGstSettings } from "../src/lib/gst";
import { makeInvoiceSnapshot } from "../src/lib/invoice-core";
import { sampleInvoices, sampleOrders } from "../src/lib/sample-data";
import type { InvoiceRecord, Order, Seller } from "../src/lib/types";

function textValues(node: ReactNode): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(textValues);
  if (isValidElement<{ children?: ReactNode; value?: string }>(node)) return typeof node.props.value === "string" ? [node.props.value] : textValues(node.props.children);
  return [];
}
const seller: Seller = { name: "Dabbat", email: "support@dabbat.in", website: "dabbat.in", address: [] };
const invoice: InvoiceRecord = { ...sampleInvoices[0], orderId: sampleOrders[0].id, orderNumber: sampleOrders[0].number, total: sampleOrders[0].total };

test("new GST-disabled PDFs hide registration and tax rows", () => {
  const values = textValues(InvoiceDocument({ invoice, order: sampleOrders[0], seller: { ...seller, taxRegistration: "OLD-REGISTRATION-MUST-STAY-HIDDEN", gst: defaultGstSettings() } }));
  assert.equal(values.includes("Tax"), false);
  assert.equal(values.some(value => value.includes("GSTIN:") || value.includes("OLD-REGISTRATION-MUST-STAY-HIDDEN")), false);
  assert.equal(values.includes("GST not charged."), true);
});

test("legacy snapshots retain their captured registration and generic tax line", () => {
  const order = { ...sampleOrders[0], tax: 5000, total: sampleOrders[0].total + 5000 };
  const values = textValues(InvoiceDocument({ invoice: { ...invoice, total: order.total }, order, seller: { ...seller, taxRegistration: "LEGACY-REGISTRATION" } }));
  assert.equal(values.includes("Tax"), true);
  assert.equal(values.includes("Tax registration: LEGACY-REGISTRATION"), true);
  assert.equal(values.includes("Shipping"), true);
  assert.equal(values.includes("Shipping after discounts"), false);
  assert.equal(values.includes("GST not charged."), false);
});

test("enabled PDFs display recorded components, legal name and GSTIN without changing pending payment", () => {
  const createdAt = "2026-11-15T10:00:00+05:30";
  const order: Order = {
    ...structuredClone(sampleOrders[1]), source: "shopify", createdAt, subtotal: 100000, discount: 0, shipping: 10000, tax: 5500, total: 115500,
    items: [{ id: "qa-only", name: "Synthetic QA item", variant: "Navy / M", sku: "QA-ONLY", quantity: 1, unitPrice: 100000, total: 100000 }],
    taxData: { source: "shopify", complete: true, estimated: false, edited: false, collectedAt: createdAt, lines: [
      { title: "CGST", component: "CGST", ratePercentage: 2.5, amount: 2500, channelLiable: false, kind: "product" },
      { title: "SGST", component: "SGST", ratePercentage: 2.5, amount: 2500, channelLiable: false, kind: "product" },
      { title: "CGST", component: "CGST", ratePercentage: 2.5, amount: 250, channelLiable: false, kind: "shipping" },
      { title: "SGST", component: "SGST", ratePercentage: 2.5, amount: 250, channelLiable: false, kind: "shipping" },
    ] },
  };
  const registered: Seller = { ...seller, gst: { enabled: true, gstin: "27ABCDE1234F1Z5", legalName: "Synthetic GST QA Fixture", stateCode: "27", registrationDate: "2026-11-15", shopifyTaxesReviewed: true } };
  const snapshot = makeInvoiceSnapshot(order, registered, "SAMPLE-QA-GST", new Date(createdAt));
  snapshot.invoice.source = "sample";
  const values = textValues(InvoiceDocument(snapshot));
  assert.equal(values.includes("Synthetic GST QA Fixture"), true);
  assert.equal(values.includes("GSTIN: 27ABCDE1234F1Z5"), true);
  assert.equal(values.includes("CGST"), true);
  assert.equal(values.includes("SGST"), true);
  assert.equal(values.filter(value => value === "INR 27.50").length, 2);
  assert.equal(values.includes("Payment pending"), true);
  assert.equal(values.includes("Tax"), false);
});
