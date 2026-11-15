import test from "node:test";
import assert from "node:assert/strict";
import { buildInvoiceEmail, buildInvoiceMime } from "../src/lib/invoice-email";
import { sampleInvoices, sampleOrders } from "../src/lib/sample-data";
import type { InvoiceSnapshot } from "../src/lib/invoice-core";

const snapshot: InvoiceSnapshot = { invoice: { ...sampleInvoices[0], paymentStatus: "pending" }, order: { ...sampleOrders[0], customer: '<img src=x onerror="alert(1)">', paymentMethod: "Cash on delivery" }, seller: { name: "Dabbat", email: "support@dabbat.in", website: "dabbat.in", address: [] } };

test("invoice email escapes customer content and preserves unpaid COD status", () => {
  const content = buildInvoiceEmail(snapshot);
  assert.ok(content.html.includes("&lt;img"));
  assert.ok(!content.html.includes('<img src=x'));
  assert.match(content.text, /please pay when your order arrives/);
  assert.ok(!content.text.includes("Payment was recorded as paid"));
  assert.ok(content.subject.includes(snapshot.invoice.orderNumber));
  const paid = buildInvoiceEmail({ ...snapshot, invoice: { ...snapshot.invoice, paymentStatus: "paid" } });
  assert.match(paid.text, /Payment was recorded as paid/);
  assert.ok(!paid.text.includes("please pay"));
});

test("internal preview is sample marked and MIME contains both text versions and the PDF", () => {
  const content = buildInvoiceEmail(snapshot, true);
  assert.match(content.subject, /SAMPLE/);
  assert.match(content.text, /NOT A TAX INVOICE/);
  assert.match(content.html, /NOT A TAX INVOICE/);
  const pdf = Buffer.from("%PDF-1.7\nexample");
  const mime = Buffer.from(buildInvoiceMime("official@dabbat.in", "support@dabbat.in", content, "invoice.pdf", pdf), "base64url").toString();
  for (const type of ["multipart/mixed", "multipart/alternative", "text/plain", "text/html", "application/pdf"]) assert.ok(mime.includes(type));
  assert.ok(mime.includes(pdf.toString("base64")));
  assert.ok(mime.includes("Reply-To: support@dabbat.in"));
});
