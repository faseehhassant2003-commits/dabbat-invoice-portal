import test from "node:test";
import assert from "node:assert/strict";
import { recordShopifyTaxData, type ShopifyTaxLine } from "../src/lib/shopify-tax";

function line(title: string, amount: string, extras: Partial<ShopifyTaxLine> = {}): ShopifyTaxLine {
  return { title, ratePercentage: 2.5, channelLiable: false, source: "shopify", priceSet: { shopMoney: { amount, currencyCode: "INR" } }, ...extras };
}
const base = { currency: "INR", complete: true, estimated: false, edited: false, cancelledAt: null };

test("Shopify product and shipping tax amounts are recorded once, without rate calculations", () => {
  const recorded = recordShopifyTaxData({ ...base, products: [{ taxLines: [line("CGST", "25.01"), line("SGST", "25.00")] }], shipping: [{ taxLines: [line("CGST", "2.50"), line("SGST", "2.50")] }] });
  assert.deepEqual(recorded.lines.map((tax) => [tax.kind, tax.component, tax.amount]), [["product", "CGST", 2501], ["product", "SGST", 2500], ["shipping", "CGST", 250], ["shipping", "SGST", 250]]);
  assert.equal(recorded.lines.reduce((sum, tax) => sum + tax.amount, 0), 5501);
  assert.equal(recorded.complete, true);
  assert.equal(recorded.source, "shopify");
});

test("generic GST is never split and unknown rate or liability stays unknown", () => {
  const recorded = recordShopifyTaxData({ ...base, products: [{ taxLines: [line("GST", "50.00", { ratePercentage: null, channelLiable: null, source: null }), line("CGST", "2.50", { channelLiable: true })] }], shipping: [] });
  assert.equal(recorded.lines[0].component, null);
  assert.equal(recorded.lines[0].ratePercentage, null);
  assert.equal(recorded.lines[0].channelLiable, null);
  assert.equal(recorded.lines[0].source, null);
  assert.equal(recorded.lines[1].channelLiable, true);
});

test("missing or truncated tax collections cannot be called complete", () => {
  assert.equal(recordShopifyTaxData({ ...base, products: [{}], shipping: [] }).complete, false);
  assert.equal(recordShopifyTaxData({ ...base, complete: false, products: [{ taxLines: [] }], shipping: [] }).complete, false);
  const unknown = recordShopifyTaxData({ currency: "INR", complete: true, products: [], shipping: [] });
  assert.equal(unknown.estimated, true);
  assert.equal(unknown.edited, true);
});

test("tax extraction rejects mixed currency and unsupported amount precision", () => {
  assert.throws(() => recordShopifyTaxData({ ...base, products: [{ taxLines: [line("IGST", "50.00", { priceSet: { shopMoney: { amount: "50.00", currencyCode: "USD" } } })] }], shipping: [] }), /different currency/);
  assert.throws(() => recordShopifyTaxData({ ...base, products: [{ taxLines: [line("IGST", "50.001")] }], shipping: [] }), /unsupported money amount/);
});

test("Shopify cancellation timestamp is retained independently of payment status", () => {
  const cancelledAt = "2026-11-15T07:15:00Z";
  const recorded = recordShopifyTaxData({ ...base, cancelledAt, products: [{ taxLines: [] }], shipping: [] });
  assert.equal(recorded.cancelledAt, cancelledAt);
  assert.equal(recorded.estimated, false);
  assert.equal(recorded.complete, true);
  assert.equal(recordShopifyTaxData({ ...base, products: [], shipping: [] }).cancelledAt, null);
});
