import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceDocument } from "@/components/invoice-document";
import { sampleInvoices, sampleOrders } from "@/lib/sample-data";
import type { InvoiceSnapshot } from "@/lib/invoice-core";
import { gmailApiErrorMessage } from "@/lib/gmail-api-error";
import { getSeller } from "./seller";
import { getGmailAccessToken, GMAIL_FROM_ALIAS, GMAIL_OAUTH_ACCOUNT, markGoogleMailTestPassed } from "./google-oauth";
import { buildInvoiceEmail, buildInvoiceMime } from "@/lib/invoice-email";
import { getEmailLogo } from "./email-brand";

export class GmailApiDeliveryError extends Error {}

async function sendMessage(to: string, content: ReturnType<typeof buildInvoiceEmail>, filename: string, pdf: Buffer): Promise<string | null> {
  const raw = buildInvoiceMime(to, GMAIL_FROM_ALIAS, content, filename, pdf, getEmailLogo());
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
  if (!response.ok) throw new GmailApiDeliveryError(await gmailApiErrorMessage(response));
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
  return sendMessage(recipient, buildInvoiceEmail(snapshot), filename, pdf);
}

export async function sendGmailApiTest(): Promise<void> {
  const invoice = sampleInvoices[0];
  const order = sampleOrders.find((sample) => sample.id === invoice.orderId);
  if (!order) throw new Error("The sample invoice for the Gmail API test is unavailable.");
  const snapshot: InvoiceSnapshot = { invoice, order, seller: getSeller() };
  const pdf = Buffer.from(await renderToBuffer(InvoiceDocument(snapshot)));
  await sendMessage(GMAIL_OAUTH_ACCOUNT, buildInvoiceEmail(snapshot, true), pdfFilename(invoice.number), pdf);
  await markGoogleMailTestPassed();
}
