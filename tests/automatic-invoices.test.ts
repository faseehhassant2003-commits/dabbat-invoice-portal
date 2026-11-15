import test from "node:test";
import assert from "node:assert/strict";
import { automaticInvoiceReadiness, automaticInvoicesEnabled } from "../src/lib/automatic-invoices";

test("persisted off overrides legacy automatic sending and new installs default off", () => {
  assert.equal(automaticInvoicesEnabled(undefined), false);
  assert.equal(automaticInvoicesEnabled(undefined, "true"), true);
  assert.equal(automaticInvoicesEnabled(false, "true"), false);
  assert.equal(automaticInvoicesEnabled(true, "false"), true);
});

test("automatic invoices require Shopify customer access and tested Gmail", () => {
  const ready = { shopifyConnected: true, customerDataApproved: true, gmailConnected: true, gmailTestPassed: true };
  assert.equal(automaticInvoiceReadiness(ready), null);
  for (const key of Object.keys(ready) as (keyof typeof ready)[]) assert.ok(automaticInvoiceReadiness({ ...ready, [key]: false }));
});
