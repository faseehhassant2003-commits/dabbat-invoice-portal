import test from "node:test";
import assert from "node:assert/strict";
import { orderEmailIndicators } from "../src/lib/order-email-status";

test("order email dots reflect delivery records and retain a previous successful send", () => {
  const indicators = orderEmailIndicators(["new", "sent", "pending", "failed", "resent"], [
    { orderId: "sent", status: "sent" },
    { orderId: "pending", status: "pending" },
    { orderId: "failed", status: "failed" },
    { orderId: "resent", status: "failed", sentAt: 100 },
  ]);
  assert.equal(indicators.new.sent, false);
  assert.equal(indicators.sent.sent, true);
  assert.equal(indicators.pending.sent, false);
  assert.match(indicators.pending.description, /not yet confirmed/);
  assert.equal(indicators.failed.sent, false);
  assert.equal(indicators.resent.sent, true);
});
