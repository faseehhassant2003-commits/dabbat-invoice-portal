import { randomBytes } from "node:crypto";
import type { InvoiceSnapshot } from "./invoice-core";
import { date, money, paymentLabels } from "./format";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
const headerText = (value: string) => value.replace(/[\r\n\u0000-\u001f\u007f]/g, " ").trim();

export function buildInvoiceEmail(snapshot: InvoiceSnapshot, sample = false) {
  const { invoice, order } = snapshot;
  const customer = headerText(order.customer) || "there";
  const total = money(invoice.total, invoice.currency);
  const status = paymentLabels[invoice.paymentStatus];
  const cod = invoice.paymentStatus === "pending" && /cash on delivery|\bcod\b/i.test(order.paymentMethod);
  const paymentNote = invoice.paymentStatus === "paid"
    ? "Payment was recorded as paid when this invoice was issued."
    : cod ? "This is a cash-on-delivery order. Payment was pending when this invoice was issued; please pay when your order arrives."
    : `Payment status when this invoice was issued: ${status.toLowerCase()}. This invoice does not confirm payment.`;
  const subject = sample ? "Dabbat email preview — SAMPLE invoice" : `Your Dabbat invoice for order ${headerText(invoice.orderNumber)}`;
  const sampleNote = "SAMPLE — NOT A TAX INVOICE. This is an internal email test with fictional order details. No customer has been emailed.";
  const intro = sample ? "Here is a preview of the Dabbat invoice email with a sample PDF attached." : "Thank you for your order. Your invoice is attached.";
  const details = [["Order", invoice.orderNumber], ["Invoice", invoice.number], ["Date", date(invoice.createdAt, true)], ["Total", total]];
  const help = "Questions? Contact support@dabbat.in.";
  const lines = [sample ? sampleNote : "", `Hi ${customer},`, intro, details.map(([label, value]) => `${label}: ${value}`).join("\n"), paymentNote, help, "Thank you,\nTeam Dabbat"].filter(Boolean);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px 16px;background:#ffffff;color:#233747;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6"><div style="max-width:560px;margin:0 auto"><a href="https://dabbat.in"><img src="cid:dabbat-logo@dabbat.in" width="150" alt="Dabbat" style="display:block;width:150px;max-width:100%;height:auto;border:0;margin-bottom:28px"></a>${sample ? `<p style="padding:12px;background:#fff4d8;color:#775400;font-weight:bold">${escapeHtml(sampleNote)}</p>` : ""}<p>Hi ${escapeHtml(customer)},</p><p>${escapeHtml(intro)}</p><p>${details.map(([label, value]) => `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}`).join("<br>")}</p><p>${escapeHtml(paymentNote)}</p><p>Questions? Contact <a href="mailto:support@dabbat.in" style="color:#033763">support@dabbat.in</a>.</p><p>Thank you,<br>Team Dabbat</p></div></body></html>`;
  return { subject, text: lines.join("\n\n"), html };
}

export function buildInvoiceMime(to: string, from: string, content: { subject: string; text: string; html: string }, filename: string, pdf: Buffer, logo: Buffer): string {
  const mixed = `dabbat_${randomBytes(18).toString("hex")}`;
  const related = `dabbat_related_${randomBytes(18).toString("hex")}`;
  const alternative = `dabbat_alt_${randomBytes(18).toString("hex")}`;
  const encode = (value: string | Buffer) => Buffer.from(value).toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
  const mime = [`From: "Dabbat" <${from}>`, `Reply-To: support@dabbat.in`, `To: ${to}`, `Subject: =?UTF-8?B?${Buffer.from(headerText(content.subject)).toString("base64")}?=`, "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${mixed}"`, "", `--${mixed}`, `Content-Type: multipart/related; boundary="${related}"`, "", `--${related}`, `Content-Type: multipart/alternative; boundary="${alternative}"`, "", `--${alternative}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", encode(content.text), `--${alternative}`, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", encode(content.html), `--${alternative}--`, "", `--${related}`, 'Content-Type: image/png; name="dabbat-logo.png"', "Content-Transfer-Encoding: base64", "Content-ID: <dabbat-logo@dabbat.in>", 'Content-Disposition: inline; filename="dabbat-logo.png"', "", encode(logo), `--${related}--`, "", `--${mixed}`, `Content-Type: application/pdf; name="${filename}"`, `Content-Disposition: attachment; filename="${filename}"`, "Content-Transfer-Encoding: base64", "", encode(pdf), `--${mixed}--`, ""].join("\r\n");
  return Buffer.from(mime).toString("base64url");
}
