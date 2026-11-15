"use client";
import { useState } from "react";

export function AutomaticInvoiceSettings({ initialEnabled, unavailableReason }: { initialEnabled: boolean; unavailableReason: string | null }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function toggle() {
    if (saving) return;
    if (!enabled && !window.confirm("Enable automatic invoice generation and email delivery for future eligible orders? COD invoices are sent when placed; prepaid invoices are sent after payment is confirmed.")) return;
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/settings/automatic-invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !enabled }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save automatic invoice settings.");
      setEnabled(result.enabled);
      setMessage(result.enabled ? "Automatic generation and email delivery enabled for future eligible orders." : "Automatic generation and email delivery turned off. Existing invoices are kept.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to save settings."); }
    finally { setSaving(false); }
  }

  return <section className="panel settings-card">
    <div className="card-title"><h2>Automatic invoices</h2><span className={`status-badge ${enabled ? "paid" : "pending"}`}>{enabled ? "On" : "Off"}</span></div>
    <p className="settings-description">Generate an invoice PDF and email it to the customer automatically. COD orders are handled when placed; prepaid orders wait for confirmed payment. Existing invoices and successful emails are reused to prevent duplicates.</p>
    <p className="settings-footnote">Applies to future eligible Shopify order events. Earlier orders are not sent in bulk. Orders without a customer email or complete invoice details require manual review. Shopify order notifications must be connected to this portal.</p>
    {unavailableReason?.includes("notifications") && <p className="action-caption">Configure orders/create and orders/paid webhooks in your Shopify app to use this portal’s permanent address followed by /api/shopify/webhooks.</p>}
    <button type="button" role="switch" aria-checked={enabled} aria-label="Automatic invoice generation and email delivery" className={`button ${enabled ? "secondary" : "primary"}`} disabled={saving || (!enabled && Boolean(unavailableReason))} onClick={toggle}>{saving ? "Saving…" : enabled ? "Turn off automatic invoices" : "Turn on automatic invoices"}</button>
    {unavailableReason && <p className="action-caption">{unavailableReason}</p>}
    {message && <p className="success-text" role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
