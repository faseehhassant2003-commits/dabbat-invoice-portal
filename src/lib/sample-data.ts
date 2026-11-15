import type { InvoiceRecord, Order, OrderItem, PaymentStatus } from "./types";
const item = (id: string, name: string, variant: string, price: number, quantity = 1, tone = "sand"): OrderItem => ({ id, name, variant, sku: `DB-${id.toUpperCase()}`, unitPrice: price, quantity, total: price * quantity, tone });
function sample(id: string, customer: string, items: OrderItem[], paymentStatus: PaymentStatus, createdAt: string, shipping = 0, discount = 0): Order {
  const subtotal = items.reduce((sum, product) => sum + product.total, 0);
  return { id: `sample-${id}`, number: `#DB${id}`, customer, initials: customer.split(" ").map(s => s[0]).slice(0, 2).join(""), email: "customer@example.com", createdAt, paymentStatus, paymentMethod: paymentStatus === "pending" ? "Cash on delivery" : "Online payment", fulfillment: paymentStatus === "pending" ? "Unfulfilled" : "Fulfilled", currency: "INR", items, billing: { name: customer, lines: ["123 Sample Street", "Mumbai, Maharashtra 400001", "India · Sample address"], email: "customer@example.com" }, subtotal, discount, shipping, tax: 0, total: subtotal - discount + shipping, taxesIncluded: false, source: "sample", note: "Fictional order for preview. Not a tax invoice or proof of payment." };
}
export const sampleOrders: Order[] = [
  sample("1048", "Aarav Sharma", [item("ct-navy-m", "Essential Crew Tee", "Navy / M", 129900, 2, "navy"), item("os-stone-m", "Everyday Oversized Tee", "Stone / M", 149900)], "paid", "2026-11-14T10:42:00+05:30", 0, 30000),
  sample("1047", "Ananya Mehta", [item("os-ivory-s", "Everyday Oversized Tee", "Ivory / S", 149900, 1, "ivory")], "pending", "2026-11-14T09:18:00+05:30", 9900),
  sample("1046", "Rohan Kapoor", [item("hd-navy-l", "Signature Hoodie", "Navy / L", 289900, 1, "navy")], "paid", "2026-11-13T18:24:00+05:30"),
  sample("1045", "Isha Patel", [item("ct-sage-s", "Essential Crew Tee", "Sage / S", 129900, 1, "sage"), item("ct-ivory-s", "Essential Crew Tee", "Ivory / S", 129900, 1, "ivory")], "paid", "2026-11-13T15:36:00+05:30", 0, 20000),
  sample("1044", "Kabir Singh", [item("os-char-l", "Everyday Oversized Tee", "Charcoal / L", 149900, 1, "charcoal")], "pending", "2026-11-13T12:10:00+05:30", 9900),
  sample("1043", "Mira Nair", [item("hd-stone-m", "Signature Hoodie", "Stone / M", 289900)], "paid", "2026-11-12T16:48:00+05:30"),
  sample("1042", "Dev Malhotra", [item("ct-navy-xl", "Essential Crew Tee", "Navy / XL", 129900, 1, "navy")], "refunded", "2026-11-12T10:12:00+05:30", 9900),
  sample("1041", "Sara Khan", [item("os-sage-m", "Everyday Oversized Tee", "Sage / M", 149900, 2, "sage")], "paid", "2026-11-11T13:26:00+05:30", 0, 20000),
];
export const sampleInvoices: InvoiceRecord[] = [sampleOrders[2], sampleOrders[3]].map((order, index) => ({ id: `sample-invoice-${index + 1}`, number: `SAMPLE-2026-${String(index + 1).padStart(4, "0")}`, orderId: order.id, orderNumber: order.number, customer: order.customer, total: order.total, currency: order.currency, createdAt: `2026-11-13T${index === 0 ? "18:30" : "15:40"}:00+05:30`, paymentStatus: order.paymentStatus, source: "sample" }));
