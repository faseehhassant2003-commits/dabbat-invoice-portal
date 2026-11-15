export interface WebhookEventState {
  id: string;
  topic: string;
  orderId: string;
  receivedAt: number;
  status: "processing" | "processed" | "ignored" | "failed";
}

/** Claim a new event or retry an event whose previous processing attempt failed. */
export function claimWebhookEvent(
  events: WebhookEventState[],
  event: Omit<WebhookEventState, "status">,
): "claimed" | "retry" | null {
  const existing = events.find((item) => item.id === event.id);
  if (existing) {
    if (existing.status !== "failed") return null;
    existing.topic = event.topic;
    existing.orderId = event.orderId;
    existing.receivedAt = event.receivedAt;
    existing.status = "processing";
    return "retry";
  }
  events.push({ ...event, status: "processing" });
  return "claimed";
}

/** Google 4xx token responses require reconnection; throttling and 5xx failures do not. */
export function googleRefreshFailureInvalidatesConnection(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
}
