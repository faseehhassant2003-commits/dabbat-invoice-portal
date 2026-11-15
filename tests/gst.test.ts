import test from "node:test";
import assert from "node:assert/strict";
import { assertGstInvoice, defaultGstSettings, gstComponent, summarizeGstLines, validateGstSettings } from "../src/lib/gst";
import { makeInvoiceSnapshot } from "../src/lib/invoice-core";
import { sampleOrders } from "../src/lib/sample-data";
import type { GstSettings, Order, RecordedTaxLine, Seller } from "../src/lib/types";

const now = new Date("2026-11-15T06:00:00Z");
const settings: GstSettings = { enabled: true, gstin: "27ABCDE1234F1Z5", legalName: "Fictional Test Seller", stateCode: "27", registrationDate: "2026-11-01", shopifyTaxesReviewed: true };
const seller: Seller = { name: "Dabbat", email: "support@dabbat.in", website: "dabbat.in", address: ["Synthetic test address"], gst: settings };
function line(component: "CGST" | "SGST" | "IGST", amount: number, ratePercentage = 9): RecordedTaxLine {
  return { title: component, component, amount, ratePercentage, channelLiable: false, kind: "product" };
}
function taxedOrder(): Order {
  const order = structuredClone(sampleOrders[1]);
  order.source = "shopify";
  order.tax = 18000;
  order.total += order.tax;
  order.taxData = { source: "shopify", complete: true, estimated: false, edited: false, collectedAt: now.toISOString(), lines: [line("CGST", 9000), line("SGST", 9000)] };
  return order;
}

test("GST defaults off and disabling removes hidden registration details", () => {
  assert.deepEqual(defaultGstSettings(), { enabled: false, gstin: "", legalName: "", stateCode: "", registrationDate: "", shopifyTaxesReviewed: false });
  assert.deepEqual(validateGstSettings({ ...settings, enabled: false }, now), defaultGstSettings());
  const snapshot = makeInvoiceSnapshot(sampleOrders[1], { ...seller, gst: defaultGstSettings(), taxRegistration: settings.gstin }, "SAMPLE-2026-0100", now);
  assert.equal(snapshot.seller.gst?.enabled, false);
  assert.equal(snapshot.seller.taxRegistration, undefined);
});

test("activation requires real-format registration, matching state, effective date and review", () => {
  assert.deepEqual(validateGstSettings(settings, now), settings);
  for (const change of [{ gstin: "" }, { gstin: "NOT-A-GSTIN" }, { legalName: "" }, { stateCode: "29" }, { registrationDate: "2026-02-30" }, { registrationDate: "2027-01-01" }, { shopifyTaxesReviewed: false }]) {
    assert.throws(() => validateGstSettings({ ...settings, ...change }, now));
  }
  assert.throws(() => validateGstSettings({ enabled: "false" }, now));
});

test("disabled GST blocks recorded taxes without changing amounts", () => {
  const order = taxedOrder();
  const before = structuredClone(order);
  assert.throws(() => assertGstInvoice(order, defaultGstSettings(), now), /GST is disabled/);
  assert.deepEqual(order, before);
});

test("only final complete Shopify tax amounts are accepted with GST enabled", () => {
  const order = taxedOrder();
  assert.doesNotThrow(() => assertGstInvoice(order, settings, now));
  for (const change of [{ complete: false }, { estimated: true }, { edited: true }, { source: "sample" as const }, { collectedAt: "invalid" }]) {
    assert.throws(() => assertGstInvoice({ ...order, taxData: { ...order.taxData!, ...change } }, settings, now));
  }
  assert.throws(() => assertGstInvoice({ ...order, taxData: undefined }, settings, now));
  assert.throws(() => assertGstInvoice({ ...order, source: "sample" }, settings, now), /Sample orders/);
  assert.throws(() => assertGstInvoice({ ...order, currency: "USD" }, settings, now), /INR/);
});

test("generic GST, missing rates, unclear liability and mismatched totals fail closed", () => {
  const order = taxedOrder();
  for (const lines of [
    [{ ...line("IGST", 18000, 18), title: "GST", component: null }],
    [{ ...line("IGST", 18000), ratePercentage: null }],
    [{ ...line("IGST", 18000), channelLiable: null }],
    [{ ...line("IGST", 18000), channelLiable: true }],
    [line("IGST", 17999)],
    [line("IGST", 9000), line("CGST", 4500), line("SGST", 4500)],
    [line("CGST", 18000)],
    [line("CGST", 8990), line("SGST", 9010)],
  ]) assert.throws(() => assertGstInvoice({ ...order, taxData: { ...order.taxData!, lines } }, settings, now));
  assert.equal(gstComponent("GST 18%"), null);
  assert.equal(gstComponent("CGST 9%"), "CGST");
});

test("shipping amounts are aggregated once without calculating tax from rates", () => {
  const order = taxedOrder();
  order.taxData!.lines = [line("CGST", 8500), line("SGST", 8500), { ...line("CGST", 500), kind: "shipping" }, { ...line("SGST", 500), kind: "shipping" }];
  assert.doesNotThrow(() => assertGstInvoice(order, settings, now));
  assert.deepEqual(summarizeGstLines(order.taxData!.lines).map(value => value.amount), [9000, 9000]);
  order.taxesIncluded = true;
  order.total -= order.tax;
  assert.doesNotThrow(() => makeInvoiceSnapshot(order, seller, "DB-2026-0100", now));
});

test("registration does not apply to older orders, refunds or cancellations", () => {
  const order = taxedOrder();
  assert.throws(() => assertGstInvoice({ ...order, createdAt: "2026-10-01T00:00:00Z" }, settings, now), /predates/);
  for (const paymentStatus of ["refunded", "partially_refunded", "voided"] as const) {
    assert.throws(() => assertGstInvoice({ ...order, paymentStatus }, settings, now), /refund or cancellation/);
  }
  for (const paymentStatus of ["paid", "pending"] as const) {
    assert.throws(() => assertGstInvoice({ ...order, paymentStatus, taxData: { ...order.taxData!, cancelledAt: now.toISOString() } }, settings, now), /was cancelled/);
  }
});

test("saved GST details and COD payment status remain immutable after settings change", () => {
  const order = taxedOrder();
  const localSeller = structuredClone(seller);
  const snapshot = makeInvoiceSnapshot(order, localSeller, "DB-2026-0101", now);
  const before = structuredClone(snapshot);
  localSeller.gst = defaultGstSettings();
  order.taxData!.lines[0].amount = 123;
  assert.deepEqual(snapshot, before);
  assert.equal(snapshot.seller.gst?.gstin, settings.gstin);
  assert.equal(snapshot.order.paymentStatus, "pending");
  assert.equal(snapshot.invoice.paymentStatus, "pending");
});
