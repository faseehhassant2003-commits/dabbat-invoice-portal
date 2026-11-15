import "server-only";
import nodemailer from "nodemailer";
import { renderToBuffer } from "@react-pdf/renderer";
import { isDemoMode } from "./config";
import { getInvoiceSnapshot } from "./invoices";
import { requireApiSession } from "./auth";
import { sendGmailInvoice } from "./gmail-api";
import { readPrivateStore, updatePrivateStore, type EmailDeliveryRecord } from "./storage";
import { buildInvoiceEmail } from "@/lib/invoice-email";
import { getEmailLogo } from "./email-brand";

export class InvoiceEmailSetupError extends Error {}
export class InvoiceEmailRecipientError extends Error {}
export class InvoiceEmailDeliveryError extends Error {}
export class InvoiceEmailNotFoundError extends Error {}
export class InvoiceEmailUnavailableError extends Error {}
export class InvoiceEmailPendingError extends Error {}

function gmailConfig() {
  const user = process.env.GMAIL_USER?.trim();
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !appPassword) throw new InvoiceEmailSetupError("Gmail delivery is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD on the server.");
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(user) || user.length > 254 || !/^[a-zA-Z0-9]{16}$/.test(appPassword)) {
    throw new InvoiceEmailSetupError("Gmail settings are invalid. Check the sender address and Google App Password.");
  }
  return { user, appPassword };
}

function validRecipient(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}

async function sendSmtp(snapshot: NonNullable<Awaited<ReturnType<typeof getInvoiceSnapshot>>>, recipient: string): Promise<string | undefined> {
  const { user, appPassword } = gmailConfig();
  const { InvoiceDocument } = await import("@/components/invoice-document");
  const pdf = await renderToBuffer(InvoiceDocument(snapshot));
  const invoiceNumber = snapshot.invoice.number.replace(/[^a-zA-Z0-9-]/g, "");
  const content = buildInvoiceEmail(snapshot);
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: appPassword },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    const result = await transporter.sendMail({
      from: { name: "Dabbat", address: user },
      to: recipient,
      replyTo: "support@dabbat.in",
      subject: content.subject,
      text: content.text,
      html: content.html,
      attachments: [
        { filename: "dabbat-logo.png", content: getEmailLogo(), contentType: "image/png", cid: "dabbat-logo@dabbat.in", contentDisposition: "inline" },
        { filename: `Dabbat-${invoiceNumber}.pdf`, content: Buffer.from(pdf), contentType: "application/pdf" },
      ],
    });
    return result.messageId;
  } catch {
    throw new InvoiceEmailDeliveryError("Gmail could not send the invoice. Check the Workspace account and App Password, then try again.");
  } finally {
    transporter.close();
  }
}

export async function getInvoiceEmailDelivery(id: string): Promise<EmailDeliveryRecord | null> {
  if (isDemoMode()) return null;
  await requireApiSession();
  return updatePrivateStore((store) => {
    const record = store.emailDeliveries?.find((item) => item.invoiceId === id) ?? null;
    if (record?.status === "pending" && (record.lockExpiresAt ?? 0) <= Date.now()) {
      record.status = "failed";
      record.updatedAt = Date.now();
      record.lastError = "Delivery status is uncertain. Check the sender mailbox before resending.";
      delete record.activeRequestId;
      delete record.lockExpiresAt;
    }
    return record;
  });
}

export async function emailSavedInvoice(
  id: string,
  requestId: string,
  resend = false,
  trustedWebhook = false,
  providerOverride?: "smtp" | "gmail-api",
): Promise<{ recipient: string; status: "sent" | "pending"; duplicate: boolean }> {
  if (isDemoMode()) throw new InvoiceEmailUnavailableError("Email sending is disabled for sample invoices.");

  const snapshot = await getInvoiceSnapshot(id, trustedWebhook);
  if (!snapshot || snapshot.invoice.source !== "shopify") throw new InvoiceEmailNotFoundError("Invoice not found.");
  const recipient = snapshot.order.email || snapshot.order.billing?.email;
  if (!validRecipient(recipient)) throw new InvoiceEmailRecipientError("This invoice has no valid customer email address in its saved order details.");

  const store = await readPrivateStore();
  const provider = providerOverride ?? process.env.INVOICE_EMAIL_PROVIDER?.trim() ?? "gmail-api";
  if (provider !== "smtp" && provider !== "gmail-api") throw new InvoiceEmailSetupError("INVOICE_EMAIL_PROVIDER must be smtp or gmail-api.");

  const claimed = await updatePrivateStore((current) => {
    const records = current.emailDeliveries ?? [];
    const index = records.findIndex((record) => record.invoiceId === id);
    const existing = index >= 0 ? records[index] : null;
    if (existing?.requestIds.includes(requestId)) return { record: existing, send: false };
    if (existing?.status === "pending" && (existing.lockExpiresAt ?? 0) > Date.now()) return { record: existing, send: false, pending: true };
    if (existing?.status === "sent" && !resend) return { record: existing, send: false };
    if (existing?.status === "failed" && !resend) return { record: existing, send: false };
    const record: EmailDeliveryRecord = {
      ...(existing ?? { invoiceId: id, orderId: snapshot.invoice.orderId, recipient, requestIds: [], attempts: 0 }),
      recipient,
      status: "pending",
      provider,
      updatedAt: Date.now(),
      activeRequestId: requestId,
      lockExpiresAt: Date.now() + 60_000,
      requestIds: [...(existing?.requestIds ?? []), requestId].slice(-20),
      attempts: (existing?.attempts ?? 0) + 1,
      lastError: undefined,
    };
    if (index >= 0) records[index] = record;
    else records.push(record);
    current.emailDeliveries = records.slice(-5000);
    return { record, send: true };
  });
  if (!claimed.send) {
    if ("pending" in claimed && claimed.pending) throw new InvoiceEmailPendingError("An invoice email is already being sent. Refresh this page before trying again.");
    if (claimed.record.status === "sent") return { recipient: claimed.record.recipient, status: "sent", duplicate: true };
    if (claimed.record.status === "failed") throw new InvoiceEmailDeliveryError("The previous attempt failed or has uncertain delivery. Use Resend invoice after checking the sender mailbox.");
    return { recipient: claimed.record.recipient, status: "pending", duplicate: true };
  }

  try {
    if (provider === "gmail-api" && !store.googleMail?.testedAt) throw new InvoiceEmailSetupError("Complete the internal Gmail API test in Settings before sending customer invoices.");
    if (provider === "smtp") gmailConfig();
    const messageId = provider === "gmail-api"
      ? await sendGmailInvoice(snapshot, recipient)
      : await sendSmtp(snapshot, recipient);
    await updatePrivateStore((current) => {
      const record = current.emailDeliveries?.find((item) => item.invoiceId === id);
      if (!record || record.activeRequestId !== requestId) throw new Error("Invoice email delivery claim was lost.");
      record.status = "sent";
      record.updatedAt = Date.now();
      record.sentAt = Date.now();
      if (messageId) record.messageId = messageId;
      else delete record.messageId;
      delete record.lastError;
      delete record.activeRequestId;
      delete record.lockExpiresAt;
    });
    return { recipient, status: "sent", duplicate: false };
  } catch (error) {
    await updatePrivateStore((current) => {
      const record = current.emailDeliveries?.find((item) => item.invoiceId === id);
      if (!record || record.activeRequestId !== requestId) return;
      record.status = "failed";
      record.updatedAt = Date.now();
      record.lastError = "Delivery did not complete. Check the sender mailbox before resending.";
      delete record.activeRequestId;
      delete record.lockExpiresAt;
    });
    if (error instanceof InvoiceEmailDeliveryError || error instanceof InvoiceEmailSetupError) throw error;
    throw new InvoiceEmailDeliveryError(error instanceof Error ? error.message : "The invoice could not be emailed. Check the sender mailbox before resending.");
  }
}
