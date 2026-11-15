import type { PaymentStatus } from "./types";
export function money(value: number, currency = "INR") { return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 2 }).format(value / 100); }
export function date(value: string, full = false) { return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", ...(full ? { year: "numeric" as const } : {}), timeZone: "Asia/Kolkata" }).format(new Date(value)); }
export const paymentLabels: Record<PaymentStatus, string> = { paid: "Paid", pending: "Payment pending", partially_paid: "Partially paid", refunded: "Refunded", partially_refunded: "Partially refunded", authorized: "Authorized", voided: "Voided", unknown: "Unknown" };
