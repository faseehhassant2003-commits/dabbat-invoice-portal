import test from "node:test";
import assert from "node:assert/strict";
import { assertInvoiceOrder, makeInvoiceSnapshot, toMinorUnits } from "../src/lib/invoice-core";
import { sampleOrders } from "../src/lib/sample-data";
import type { Seller } from "../src/lib/types";
import { assertPdfTextValues, pdfFontForCharacter } from "../src/lib/pdf-fonts";
const seller: Seller = { name: "Dabbat", email: "support@dabbat.in", website: "dabbat.in", address: [] };
test("Shopify decimal money is parsed exactly and unsupported precisions fail", () => {
  assert.equal(toMinorUnits("1099.99", "INR"), 109999);
  assert.equal(toMinorUnits("0.1", "INR"), 10);
  assert.throws(() => toMinorUnits("1.999", "INR"));
  assert.throws(() => toMinorUnits("-1", "INR"));
  assert.throws(() => toMinorUnits("1", "JPY"), /two decimal places/);
});

test("sample totals reconcile and no tax registration is invented", () => {
  for (const order of sampleOrders) assert.doesNotThrow(() => assertInvoiceOrder(order));
  const snapshot = makeInvoiceSnapshot(sampleOrders[0], seller, "SAMPLE-2026-0003");
  assert.equal(snapshot.seller.taxRegistration, undefined);
  assert.equal(snapshot.invoice.source, "sample");
});
test("unpaid COD stays pending on immutable saved snapshot", () => {
  const order = structuredClone(sampleOrders.find((item) => item.paymentStatus === "pending")!);
  const snapshot = makeInvoiceSnapshot(order, seller, "SAMPLE-2026-0004");
  order.paymentStatus = "paid";
  order.items[0].quantity = 100;
  seller.address.push("Temporary fixture address");
  assert.equal(snapshot.invoice.paymentStatus, "pending");
  assert.equal(snapshot.order.paymentStatus, "pending");
  assert.equal(snapshot.order.items[0].quantity, 1);
  assert.deepEqual(snapshot.seller.address, []);
  seller.address = [];
});
test("included taxes are not added to total again", () => {
  const order = structuredClone(sampleOrders[0]);
  order.taxesIncluded = true;
  order.tax = 10000;
  assert.doesNotThrow(() => assertInvoiceOrder(order));
  order.taxesIncluded = false;
  assert.throws(() => assertInvoiceOrder(order), /totals include adjustments/);
});
test("incomplete line items and unrepresented fees prevent invoice issue", () => {
  const truncated = structuredClone(sampleOrders[0]);
  truncated.itemsComplete = false;
  assert.throws(() => assertInvoiceOrder(truncated), /Could not load every line item/);
  const order = structuredClone(sampleOrders[0]);
  order.items.pop();
  assert.throws(() => assertInvoiceOrder(order), /Line items do not match/);
  const fees = structuredClone(sampleOrders[0]);
  fees.total += 9900;
  assert.throws(() => assertInvoiceOrder(fees), /No invoice was generated/);
});
test("different snapshots have unique opaque identifiers", () => {
  const first = makeInvoiceSnapshot(sampleOrders[0], seller, "SAMPLE-2026-0001");
  const second = makeInvoiceSnapshot(sampleOrders[0], seller, "SAMPLE-2026-0002");
  assert.notEqual(first.invoice.id, second.invoice.id);
});
test("bundled fonts preserve Latin, rupee, and Hindi customer text", () => {
  assert.equal(pdfFontForCharacter("A"), "Noto Sans");
  assert.equal(pdfFontForCharacter("म"), "Noto Devanagari");
  assert.doesNotThrow(() => assertPdfTextValues({ name: "आरव शर्मा", address: "मुंबई, महाराष्ट्र 400001", amount: "INR ₹1,299.00" }));
  assert.throws(() => assertPdfTextValues("Unconfigured font: 漢"), /script the PDF fonts do not support/);
});
