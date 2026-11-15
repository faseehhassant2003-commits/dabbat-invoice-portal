"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Loader2, Mail } from "lucide-react";

export function InvoiceActions({ orderId, existingId, recipientEmail, delivery: initialDelivery, demo, disabled = false }: {
  orderId: string;
  existingId?: string;
  recipientEmail?: string;
  delivery?: { status: "pending" | "sent" | "failed" } | null;
  demo: boolean;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState(initialDelivery?.status ?? null);
  const [invoiceId, setInvoiceId] = useState(existingId);
  const router = useRouter();

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The invoice could not be created. Please try again.");
      setInvoiceId(result.invoice.id);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function emailInvoice() {
    if (!invoiceId || !recipientEmail || sending || demo) return;
    const resend = deliveryStatus === "sent" || deliveryStatus === "failed";
    if (!window.confirm(`${resend ? "Resend" : "Send"} this invoice PDF to ${recipientEmail}?`)) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ resend }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The invoice could not be emailed. Please try again.");
      setDeliveryStatus(result.status);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Please try again.");
      setDeliveryStatus("failed");
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  const emailStatus = deliveryStatus === "sent"
    ? `Sent · invoice emailed to ${recipientEmail}.`
    : deliveryStatus === "pending"
      ? "Pending · invoice email is being sent."
      : deliveryStatus === "failed"
        ? "Failed · check the sender mailbox before resending."
        : demo
          ? "Email sending is available for live invoices."
          : recipientEmail
            ? `Send to ${recipientEmail}.`
            : "No customer email is saved with this order.";

  return <div className="invoice-actions">
    {invoiceId ? <>
      <a href={`/api/invoices/${encodeURIComponent(invoiceId)}/pdf`} className="button primary"><Download size={16}/>Download invoice</a>
      <button className="button secondary" onClick={emailInvoice} disabled={sending || deliveryStatus === "pending" || demo || !recipientEmail}>
        {sending ? <Loader2 size={16} className="spin"/> : <Mail size={16}/>}
        {sending || deliveryStatus === "pending" ? "Sending invoice…" : deliveryStatus === "sent" || deliveryStatus === "failed" ? "Resend invoice" : "Email invoice"}
      </button>
      <p className={deliveryStatus === "sent" ? "success-text" : deliveryStatus === "failed" ? "form-error" : "action-caption"} role={deliveryStatus ? "status" : undefined}>
        {emailStatus}
      </p>
    </> : <>
      <button className="button primary" onClick={generate} disabled={loading || disabled}>
        {loading ? <Loader2 size={16} className="spin"/> : <FileText size={16}/>}
        {loading ? "Creating invoice…" : "Generate PDF invoice"}
      </button>
      <button className="button secondary" disabled title="Create the invoice before emailing it"><Mail size={16}/>Email invoice</button>
      <p className="action-caption">Create the invoice before sending it to the customer.</p>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
