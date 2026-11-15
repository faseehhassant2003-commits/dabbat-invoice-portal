import "server-only";
import { randomBytes } from "node:crypto";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceDocument } from "@/components/invoice-document";
import { sampleInvoices, sampleOrders } from "@/lib/sample-data";
import type { InvoiceSnapshot } from "@/lib/invoice-core";
import { getSeller } from "./seller";
import { getGmailAccessToken, GMAIL_FROM_ALIAS, GMAIL_OAUTH_ACCOUNT, markGoogleMailTestPassed } from "./google-oauth";

export class GmailApiDeliveryError extends Error {}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function makeRawMessage(to: string, subject: string, text: string, filename: string, pdf: Buffer): string {
  const boundary = `dabbat_${randomBytes(18).toString("hex")}`;
  const encodedSubject = Buffer.from(subject, "utf8").toString("base64");
  const textBody = wrapBase64(Buffer.from(text, "utf8").toString("base64"));
  const attachment = wrapBase64(pdf.toString("base64"));
  const mime = [
    `From: "Dabbat" <${GMAIL_FROM_ALIAS}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    textBody,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    `Content-Disposition: attachment; filename="${filename}"`,
    "Content-Transfer-Encoding: base64",
    "",
    attachment,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

async function sendMessage(to: string, subject: string, text: string, filename: string, pdf: Buffer): Promise<string | null> {
  const raw = makeRawMessage(to, subject, text, filename, pdf);
  let response: Response;
  try {
    response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await getGmailAccessToken()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ raw }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new GmailApiDeliveryError("Gmail API could not send the message. Check the connection and try again.");
  }
  if (!response.ok) throw new GmailApiDeliveryError("Gmail API rejected the message. Check the Gmail connection and verified sender alias.");
  try {
    const result = await response.json() as { id?: unknown };
    return typeof result.id === "string" ? result.id : null;
  } catch {
    return null;
  }
}

function pdfFilename(invoiceNumber: string): string {
  return `Dabbat-${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, "")}.pdf`;
}

export async function sendGmailInvoice(snapshot: InvoiceSnapshot, recipient: string): Promise<string | null> {
  const filename = pdfFilename(snapshot.invoice.number);
  const pdf = Buffer.from(await renderToBuffer(InvoiceDocument(snapshot)));
  const text = `Hello ${snapshot.order.customer},\n\nPlease find your invoice ${snapshot.invoice.number} for order ${snapshot.order.number} attached.\n\nThank you,\nDabbat`;
  return sendMessage(recipient, `Your Dabbat invoice ${snapshot.invoice.number}`, text, filename, pdf);
}

export async function sendGmailApiTest(): Promise<void> {
  const invoice = sampleInvoices[0];
  const order = sampleOrders.find((sample) => sample.id === invoice.orderId);
  if (!order) throw new Error("The sample invoice for the Gmail API test is unavailable.");
  const snapshot: InvoiceSnapshot = { invoice, order, seller: getSeller() };
  const pdf = Buffer.from(await renderToBuffer(InvoiceDocument(snapshot)));
  const text = "This is a Gmail API connection test from the Dabbat Invoice Portal. The attached document is fictional sample data and is not a tax invoice.";
  await sendMessage(
    GMAIL_OAUTH_ACCOUNT,
    "Dabbat Gmail API test (sample invoice attached)",
    text,
    pdfFilename(invoice.number),
    pdf,
  );
  await markGoogleMailTestPassed();
}
