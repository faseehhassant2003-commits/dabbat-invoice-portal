import test from "node:test";
import assert from "node:assert/strict";
import {
  claimWebhookEvent,
  googleRefreshFailureInvalidatesConnection,
  type WebhookEventState,
} from "../src/lib/integration-reliability";

test("failed Shopify webhooks can be claimed again without duplicating their record", () => {
  const events: WebhookEventState[] = [{
    id: "webhook-123",
    topic: "orders/paid",
    orderId: "100",
    receivedAt: 1,
    status: "failed",
  }];

  assert.equal(claimWebhookEvent(events, {
    id: "webhook-123",
    topic: "orders/paid",
    orderId: "100",
    receivedAt: 2,
  }), "retry");
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    id: "webhook-123",
    topic: "orders/paid",
    orderId: "100",
    receivedAt: 2,
    status: "processing",
  });
});

test("active and completed Shopify webhook records remain idempotent", () => {
  for (const status of ["processing", "processed", "ignored"] as const) {
    const events: WebhookEventState[] = [{
      id: "webhook-123",
      topic: "orders/create",
      orderId: "100",
      receivedAt: 1,
      status,
    }];
    assert.equal(claimWebhookEvent(events, {
      id: "webhook-123",
      topic: "orders/create",
      orderId: "100",
      receivedAt: 2,
    }), null);
    assert.equal(events[0].receivedAt, 1);
  }
});

test("temporary Google token failures preserve the saved connection", () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    assert.equal(googleRefreshFailureInvalidatesConnection(status), false, String(status));
  }
  for (const status of [400, 401, 403]) {
    assert.equal(googleRefreshFailureInvalidatesConnection(status), true, String(status));
  }
});
