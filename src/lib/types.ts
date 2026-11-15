export type PaymentStatus = "paid" | "pending" | "partially_paid" | "refunded" | "partially_refunded" | "authorized" | "voided" | "unknown";
export type BillingAddress = { name: string; lines: string[]; email?: string };
export type OrderItem = { id: string; name: string; variant: string; sku: string; quantity: number; unitPrice: number; total: number; tone?: string };
export type GstComponent = "CGST" | "SGST" | "IGST" | "UTGST";
export type GstSettings = { enabled: boolean; gstin: string; legalName: string; stateCode: string; registrationDate: string; shopifyTaxesReviewed: boolean };
export type RecordedTaxLine = { title: string; ratePercentage: number | null; amount: number; component: GstComponent | null; channelLiable: boolean | null; kind: "product" | "shipping"; source?: string | null };
export type RecordedTaxData = { source: "shopify" | "sample"; complete: boolean; estimated: boolean; collectedAt: string; lines: RecordedTaxLine[]; edited?: boolean; cancelledAt?: string | null };
// Money is integer minor units (paise for INR), never floating point rupees.
export type Order = {
  id: string; number: string; createdAt: string; customer: string; email?: string;
  initials: string; paymentStatus: PaymentStatus; paymentMethod: string;
  fulfillment: string; currency: string; items: OrderItem[]; itemsComplete?: boolean; billing: BillingAddress | null;
  subtotal: number; discount: number; shipping: number; tax: number; total: number;
  taxesIncluded: boolean; source: "sample" | "shopify"; note?: string; taxData?: RecordedTaxData;
};
export type InvoiceRecord = { id: string; number: string; orderId: string; orderNumber: string; customer: string; total: number; currency: string; createdAt: string; paymentStatus: PaymentStatus; source: "sample" | "shopify" };
export type Seller = { name: string; email: string; website: string; address: string[]; taxRegistration?: string; gst?: GstSettings };
