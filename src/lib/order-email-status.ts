export type OrderEmailIndicator = { sent: boolean; description: string };

export function orderEmailIndicators(orderIds: string[], deliveries: { orderId: string; status: "sent" | "pending" | "failed"; sentAt?: number }[]): Record<string, OrderEmailIndicator> {
  return Object.fromEntries(orderIds.map(orderId => {
    const records = deliveries.filter(record => record.orderId === orderId);
    const sent = records.some(record => record.status === "sent" || Boolean(record.sentAt));
    const description = sent ? "Invoice email sent" : records.some(record => record.status === "pending") ? "Invoice email is being sent; delivery is not yet confirmed" : records.some(record => record.status === "failed") ? "Invoice email failed or delivery is uncertain; check the order details" : "Invoice has not been emailed";
    return [orderId, { sent, description }];
  }));
}
