"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, ReceiptText, Save } from "lucide-react";
import type { GstSettings } from "@/lib/types";
import { GstSettingsValidationError, validateGstSettings } from "@/lib/gst";

export function GstSettingsForm({ initialSettings, demo }: { initialSettings: GstSettings; demo: boolean }) {
  const [draft, setDraft] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const router = useRouter();

  function change<K extends keyof GstSettings>(key: K, value: GstSettings[K]) {
    setDraft(current => ({ ...current, [key]: value }));
    setError("");
    setSaved("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setSaved("");
    let settings: GstSettings;
    try { settings = validateGstSettings(draft.enabled ? draft : { enabled: false }); }
    catch (failure) {
      setError(failure instanceof GstSettingsValidationError ? failure.message : "Check the registration details and try again.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/settings/gst", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings.enabled ? settings : { enabled: false }),
      });
      const result = await response.json() as { settings?: GstSettings; error?: string };
      if (!response.ok || !result.settings) {
        setError(typeof result.error === "string" ? result.error : "Invoice settings could not be saved. Please try again.");
        return;
      }
      setDraft(result.settings);
      setSaved(demo ? "Sample invoice settings saved." : "Invoice settings saved for future invoices.");
      router.refresh();
    } catch { setError("Invoice settings could not be saved. Check your connection and try again."); }
    finally { setSaving(false); }
  }

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <section className="panel settings-card gst-settings" aria-labelledby="gst-settings-title">
    <div className="card-title"><ReceiptText size={18} /><h2 id="gst-settings-title">GST registration</h2><span className={`status-badge ${draft.enabled ? "paid" : "pending"}`}><span />{draft.enabled ? "On" : "Off"}</span></div>
    {demo && <p className="gst-sample-notice">Sample workspace: use fictional registration details. Changes apply only to sample invoices.</p>}
    <form onSubmit={save}>
      <div className="gst-toggle-row">
        <div><label htmlFor="gst-enabled">GST registered</label><p>{draft.enabled ? "Use your confirmed registration for eligible new invoices." : "Dabbat is not GST registered. Keep this off until registration is confirmed."}</p></div>
        <label className="gst-switch"><input id="gst-enabled" name="enabled" type="checkbox" role="switch" checked={draft.enabled} disabled={saving} aria-controls="gst-registration-fields" onChange={event => change("enabled", event.target.checked)} /><span aria-hidden="true" /></label>
      </div>
      {draft.enabled && <fieldset id="gst-registration-fields" className="gst-fields" disabled={saving}>
        <legend className="sr-only">Confirmed GST registration details</legend>
        <label className="gst-field"><span>GSTIN</span><input name="gstin" required value={draft.gstin} maxLength={15} minLength={15} autoComplete="off" spellCheck={false} placeholder="Enter your registered GSTIN" onChange={event => change("gstin", event.target.value.toUpperCase())} aria-describedby="gstin-help" /><small id="gstin-help">Use the 15-character GSTIN on your certificate. Format checks do not verify your registration with the GST portal.</small></label>
        <label className="gst-field"><span>Registered legal business name</span><input name="legalName" required value={draft.legalName} maxLength={160} autoComplete="organization" placeholder="Name on your registration certificate" onChange={event => change("legalName", event.target.value)} /></label>
        <div className="gst-field-pair">
          <label className="gst-field"><span>GST state code</span><input name="stateCode" required value={draft.stateCode} inputMode="numeric" pattern="[0-9]{2}" minLength={2} maxLength={2} autoComplete="off" placeholder="Two-digit code" onChange={event => change("stateCode", event.target.value)} aria-describedby="gst-state-help" /><small id="gst-state-help">Must match the first two digits of your GSTIN.</small></label>
          <label className="gst-field"><span>Effective registration date</span><input name="registrationDate" required type="date" value={draft.registrationDate} max={today} onChange={event => change("registrationDate", event.target.value)} /></label>
        </div>
        <label className="gst-confirmation"><input name="shopifyTaxesReviewed" type="checkbox" required checked={draft.shopifyTaxesReviewed} onChange={event => change("shopifyTaxesReviewed", event.target.checked)} /><span>I confirm Dabbat has a valid regular GST registration and I have reviewed Shopify’s tax settings.</span></label>
        <p className="gst-tax-note">Invoice tax amounts and rates come from the Shopify order. Review the store’s tax settings before saving. Existing invoices keep their original details.</p>
      </fieldset>}
      <button className="button primary" type="submit" disabled={saving}>{saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}{saving ? "Saving settings…" : demo ? "Save sample settings" : "Save invoice settings"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="gst-save-status" role="status" aria-live="polite">{saved && <><Check size={13} />{saved}</>}</p>
    </form>
    <style jsx>{`
      .gst-sample-notice{font-size:10px;line-height:1.8;padding:11px 13px;border:1px solid #e1eaf2;background:#f0f5f9;color:#607d94;border-radius:7px;margin-bottom:19px}
      .gst-toggle-row{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:23px}
      .gst-toggle-row>div>label{font-size:12px;font-weight:600;color:#3c5b73;cursor:pointer}
      .gst-toggle-row p{font-size:10px;line-height:1.8;color:#8297a8;margin-top:6px;max-width:290px}
      .gst-switch{position:relative;display:block;flex-shrink:0;width:38px;height:22px;margin-top:2px;cursor:pointer}
      .gst-switch input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer}
      .gst-switch>span{display:block;width:38px;height:22px;background:#d5e0e8;border:1px solid #ccd9e3;border-radius:20px;pointer-events:none}
      .gst-switch>span:after{content:"";position:absolute;left:3px;top:3px;width:16px;height:16px;background:white;border-radius:50%;box-shadow:0 1px 2px #03376320;transition:transform .15s}
      .gst-switch input:checked+span{background:#033763;border-color:#033763}
      .gst-switch input:checked+span:after{transform:translateX(16px)}
      .gst-switch input:focus-visible+span{outline:3px solid #80b4de;outline-offset:4px}
      .gst-switch input:disabled+span{opacity:.5}
      .gst-fields{padding:0;margin:0 0 22px;border:0;min-width:0;display:grid;gap:18px}
      .gst-field{display:flex;flex-direction:column;gap:8px;min-width:0;font-size:10px;color:#6d879b;font-weight:500}
      .gst-field input{width:100%;min-width:0;border:1px solid #dce5ed;border-radius:6px;padding:11px 12px;background:white;color:#3d5a71;font-size:11px;line-height:1.5;font-weight:400}
      .gst-field input::placeholder{color:#a2b0bb}
      .gst-field input:focus-visible{outline:2px solid #80b4de;outline-offset:2px}
      .gst-field small{font-size:9px;line-height:1.7;font-weight:400;color:#95a6b3}
      .gst-field-pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:15px}
      .gst-confirmation{display:flex;align-items:flex-start;gap:9px;cursor:pointer;font-size:10px;line-height:1.8;color:#698499;font-weight:400}
      .gst-confirmation input{width:15px;height:15px;flex-shrink:0;margin-top:2px;accent-color:#033763}
      .gst-tax-note{font-size:9px;line-height:1.9;color:#95a6b3;background:#f6f9fb;border:1px solid #e9eff4;padding:12px;border-radius:6px}
      .gst-save-status{display:flex;align-items:center;justify-content:center;gap:6px;min-height:17px;font-size:10px;line-height:1.7;color:#53866d;margin-top:10px}
      @media(max-width:540px){.gst-field-pair{grid-template-columns:1fr;gap:18px}.gst-field input{font-size:16px}.gst-toggle-row p{font-size:10px}.gst-field{font-size:11px}}
      @media(prefers-reduced-motion:reduce){.gst-switch>span:after{transition:none}}
    `}</style>
  </section>;
}
