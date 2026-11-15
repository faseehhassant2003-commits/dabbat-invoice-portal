import type { GstComponent, GstSettings, Order, RecordedTaxLine } from "./types";

export class GstSettingsValidationError extends Error {}
export class GstInvoiceError extends Error {}

export function defaultGstSettings(): GstSettings {
  return { enabled: false, gstin: "", legalName: "", stateCode: "", registrationDate: "", shopifyTaxesReviewed: false };
}

export function indiaDate(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new GstInvoiceError("The order date is invalid. Review this order before invoicing.");
  return new Date(value.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function validateGstSettings(input: unknown, now = new Date()): GstSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new GstSettingsValidationError("Choose whether GST should be enabled.");
  const value = input as Record<string, unknown>;
  if (typeof value.enabled !== "boolean") throw new GstSettingsValidationError("Choose whether GST should be enabled.");
  // Hidden fields cannot leave a previous registration active when GST is off.
  if (!value.enabled) return defaultGstSettings();
  const gstin = typeof value.gstin === "string" ? value.gstin.trim().toUpperCase() : "";
  const legalName = typeof value.legalName === "string" ? value.legalName.trim() : "";
  const stateCode = typeof value.stateCode === "string" ? value.stateCode.trim() : "";
  const registrationDate = typeof value.registrationDate === "string" ? value.registrationDate : "";
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) throw new GstSettingsValidationError("Enter your actual 15-character GSTIN in the correct format.");
  if (legalName.length < 2 || legalName.length > 160 || /[\u0000-\u001f]/.test(legalName)) throw new GstSettingsValidationError("Enter the registered legal business name (2–160 characters).");
  if (!/^(0[1-9]|[12][0-9]|3[0-8])$/.test(stateCode) || !gstin.startsWith(stateCode)) throw new GstSettingsValidationError("The registration state code must match the first two digits of your GSTIN.");
  const parsed = new Date(`${registrationDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(registrationDate) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== registrationDate || registrationDate > indiaDate(now)) throw new GstSettingsValidationError("Enter a valid registration effective date that is not in the future.");
  if (value.shopifyTaxesReviewed !== true) throw new GstSettingsValidationError("Confirm your registration and reviewed Shopify tax setup before enabling GST.");
  return { enabled: true, gstin, legalName, stateCode, registrationDate, shopifyTaxesReviewed: true };
}

/** Only recognize an explicit Shopify component; never split a generic GST line. */
export function gstComponent(title: string): GstComponent | null {
  const match = title.trim().toUpperCase().match(/^(CGST|SGST|IGST|UTGST)(?:$|[\s(\d])/);
  return match ? match[1] as GstComponent : null;
}

/** Aggregate recorded amounts for display. No rate is applied to a taxable base. */
export function summarizeGstLines(lines: RecordedTaxLine[]): RecordedTaxLine[] {
  const groups = new Map<string, RecordedTaxLine>();
  for (const line of lines) {
    const key = `${line.component}:${line.ratePercentage}`;
    const group = groups.get(key);
    if (group) group.amount += line.amount;
    else groups.set(key, { ...line });
  }
  return [...groups.values()].sort((a, b) => (a.component ?? "").localeCompare(b.component ?? "") || (a.ratePercentage ?? 0) - (b.ratePercentage ?? 0));
}

export function assertGstInvoice(order: Order, settings: GstSettings, now = new Date()): void {
  if (!settings.enabled) {
    if (order.tax !== 0 || order.taxData?.lines.some(line => line.amount !== 0)) throw new GstInvoiceError("GST is disabled but this order contains recorded tax. Review the order and GST setup before issuing a new invoice.");
    return;
  }
  validateGstSettings(settings, now);
  if (order.currency !== "INR") throw new GstInvoiceError("GST invoices currently support INR orders only.");
  if (order.source === "sample" && order.tax !== 0) throw new GstInvoiceError("Sample orders cannot provide verified Shopify GST amounts. No GST was calculated or fabricated.");
  if (indiaDate(new Date(order.createdAt)) < settings.registrationDate) throw new GstInvoiceError("This order predates your GST registration. Review it separately; the current GST registration cannot be applied to it.");
  if (["refunded", "partially_refunded", "voided"].includes(order.paymentStatus)) throw new GstInvoiceError("This order has a refund or cancellation. Review it separately before issuing a new GST invoice.");
  const data = order.taxData;
  if (data?.cancelledAt) throw new GstInvoiceError("This order was cancelled. Review it separately before issuing a new GST invoice.");
  if (!data || !data.complete || data.estimated || (order.source === "shopify" ? data.source !== "shopify" : data.source !== "sample")) throw new GstInvoiceError("Complete, final Shopify tax data is required. No GST was calculated or guessed.");
  if (!Number.isFinite(new Date(data.collectedAt).getTime()) || data.edited) throw new GstInvoiceError("This order needs review because its tax data is incomplete or the order was edited.");
  let recorded = 0;
  const components = new Map<GstComponent, Map<number, number>>();
  for (const line of data.lines) {
    if (!Number.isSafeInteger(line.amount) || line.amount < 0) throw new GstInvoiceError("Shopify returned unsupported tax amounts. Review this order before invoicing.");
    recorded += line.amount;
    if (!line.component || gstComponent(line.title) !== line.component || line.ratePercentage === null || !Number.isFinite(line.ratePercentage) || line.ratePercentage < 0 || line.ratePercentage > 100) throw new GstInvoiceError("Shopify tax components or rates are ambiguous. Review the order; GST will not be split or calculated automatically.");
    if (line.amount > 0 && (line.ratePercentage === 0 || line.channelLiable !== false)) throw new GstInvoiceError("The recorded tax rate or seller tax liability is unclear. Review Shopify tax details before invoicing.");
    const rates = components.get(line.component) ?? new Map<number, number>();
    rates.set(line.ratePercentage, (rates.get(line.ratePercentage) ?? 0) + line.amount);
    components.set(line.component, rates);
  }
  if (!Number.isSafeInteger(recorded) || recorded !== order.tax) throw new GstInvoiceError("Shopify tax lines do not match the recorded tax total. No GST was calculated or adjusted.");
  if (components.has("IGST") && components.size > 1) throw new GstInvoiceError("Shopify contains mixed interstate and intrastate tax components. Review this order before invoicing.");
  if (components.has("SGST") && components.has("UTGST")) throw new GstInvoiceError("Shopify contains conflicting state tax components. Review this order before invoicing.");
  const central = components.get("CGST");
  const state = components.get("SGST") ?? components.get("UTGST");
  if (Boolean(central) !== Boolean(state)) throw new GstInvoiceError("Shopify contains incomplete central/state GST components. No missing tax will be inferred.");
  if (central && state && (central.size !== state.size || [...central].some(([rate, amount]) => !state.has(rate) || Math.abs(state.get(rate)! - amount) > 1))) throw new GstInvoiceError("Shopify central/state GST rates or amounts do not reconcile. Review the recorded tax details.");
}
