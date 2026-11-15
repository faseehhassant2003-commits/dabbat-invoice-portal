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
  const intro = sample ? "Here is a preview of the Dabbat invoice email with a sample PDF attached." : "Thank you for choosing Dabbat. Your invoice is attached as a PDF for your records.";
  const lines = [sample ? sampleNote : "", `Hi ${customer},`, intro, `Order: ${invoice.orderNumber}\nInvoice: ${invoice.number}\nIssued: ${date(invoice.createdAt, true)}\nOrder total: ${total}\nPayment status at issue: ${status}`, paymentNote, "You can download or save the attached PDF whenever you need it.", "Questions about your invoice? Reply to this email or contact support@dabbat.in and include your order number.", "Thank you,\nTeam Dabbat\nIndividually you.\nhttps://dabbat.in"].filter(Boolean);
  const details = [["Order", invoice.orderNumber], ["Invoice", invoice.number], ["Issued", date(invoice.createdAt, true)], ["Order total", total], ["Payment at issue", status]];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px 12px;background:#f4f6f8;color:#233747;font-family:Arial,Helvetica,sans-serif;line-height:1.7"><div style="display:none;max-height:0;overflow:hidden">${sample ? escapeHtml(sampleNote) : "Your Dabbat invoice PDF is attached. Keep it for your records."}</div><table role="presentation" style="width:100%;max-width:600px;margin:0 auto;border-collapse:collapse;background:#ffffff"><tr><td style="padding:28px 32px;background:#ffffff;color:#033763;border-bottom:1px solid #e6edf2"><a href="https://dabbat.in" style="text-decoration:none"><img src="cid:dabbat-logo@dabbat.in" width="280" alt="Dabbat" style="display:block;width:280px;max-width:100%;height:auto;border:0"></a><div style="margin-top:12px;font-size:11px;letter-spacing:2px">INDIVIDUALLY YOU.</div></td></tr><tr><td style="padding:32px">${sample ? `<p style="padding:12px;background:#fff4d8;color:#775400;font-weight:bold">${escapeHtml(sampleNote)}</p>` : ""}<p style="margin:0 0 8px;color:#60788d;font-size:12px;letter-spacing:2px">YOUR INVOICE</p><h1 style="margin:0 0 24px;color:#033763;font-size:26px;line-height:1.3">A little detail, all in one place.</h1><p>Hi ${escapeHtml(customer)},</p><p>${escapeHtml(intro)}</p><table role="presentation" style="width:100%;border-collapse:collapse;margin:24px 0;background:#f5f8fa">${details.map(([label, value]) => `<tr><td style="padding:10px 14px;color:#60788d;font-size:13px;border-bottom:1px solid #e6edf2">${escapeHtml(label)}</td><td style="padding:10px 14px;text-align:right;font-size:14px;border-bottom:1px solid #e6edf2;font-weight:bold">${escapeHtml(value)}</td></tr>`).join("")}</table><p style="font-size:14px">${escapeHtml(paymentNote)}</p><p>You can download or save the attached PDF whenever you need it.</p><p style="margin-top:28px">Questions about your invoice? Reply to this email or contact <a href="mailto:support@dabbat.in" style="color:#033763">support@dabbat.in</a> and include your order number.</p><p style="margin-bottom:0">Thank you,<br><strong>Team Dabbat</strong></p></td></tr><tr><td style="padding:20px 32px;background:#eef3f7;font-size:12px;color:#60788d">Dabbat · Individually you.<br><a href="https://dabbat.in" style="color:#033763">Visit dabbat.in</a></td></tr></table></body></html>`;
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
