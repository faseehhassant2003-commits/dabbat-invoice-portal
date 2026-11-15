"use client";
import { useState } from "react";
import { Check, ExternalLink, Loader2, Mail, ShieldCheck } from "lucide-react";

type Props = {
  demo: boolean;
  configured: boolean;
  connected: boolean;
  testPassed: boolean;
  redirectUri: string;
  authorizationResult: "connected" | "error" | null;
};

export function GoogleMailSettings({ demo, configured, connected, testPassed: initialTestPassed, redirectUri, authorizationResult }: Props) {
  const [testPassed, setTestPassed] = useState(initialTestPassed);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const authorizationNotice = authorizationResult === "connected" && connected
    ? "Google Workspace Gmail connected. No email was sent."
    : "";
  const authorizationError = authorizationResult === "error"
    ? "Google Workspace authorization did not complete. Check the OAuth credentials, exact redirect URI, and Gmail send permission, then try again."
    : authorizationResult === "connected" && !connected
      ? "Google authorization returned, but Gmail is not connected. Reconnect Google Workspace and approve Gmail send access."
      : "";

  async function testConnection() {
    if (testing || demo || !connected) return;
    if (!window.confirm("Send a clearly marked sample invoice PDF only to official@dabbat.in? No customer email will be sent.")) return;
    setTesting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/google/test", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The Gmail API test failed.");
      setTestPassed(true);
      setNotice("Sample invoice sent to official@dabbat.in. No customer email was sent.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The Gmail API test failed.");
    } finally {
      setTesting(false);
    }
  }

  return <section className="panel settings-card">
    <div className="card-title"><Mail size={18}/><h2>Email invoices</h2><span className={`status-badge ${testPassed ? "paid" : "pending"}`}><span/>{testPassed ? "Gmail API tested" : connected ? "Connected · untested" : "Not connected"}</span></div>
    <p className="settings-description">Invoice PDFs are sent from the verified support@dabbat.in alias to the email saved on the Shopify order. OAuth requests only Gmail send permission.</p>
    <dl className="settings-list">
      <div><dt>Google account</dt><dd>Authorize as official@dabbat.in</dd></div>
      <div><dt>Send-as alias</dt><dd>support@dabbat.in</dd></div>
      <div><dt>Authorized redirect URI</dt><dd><code>{redirectUri}</code></dd></div>
    </dl>
    <p className="settings-footnote">In Google Workspace, verify support@dabbat.in as a send-as alias on official@dabbat.in before connecting. Google’s login hint does not force the account: check the account shown during consent. {testPassed ? "The Gmail API test passed; manual invoice emails can now use OAuth. Automatic sending remains off." : "Run the internal test before enabling Gmail API invoice sends."}</p>
    <form action="/api/google/connect" method="post"><button className="button primary" disabled={demo || !configured}><ExternalLink size={16}/>{connected ? "Reconnect Google Workspace" : "Connect Google Workspace"}</button></form>
    {!configured && !demo && <p className="action-caption">Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to the server environment first.</p>}
    {demo && <p className="action-caption">Google email is disabled in sample mode.</p>}
    <button className="button secondary" onClick={testConnection} disabled={demo || !connected || testing}>
      {testing ? <Loader2 size={16} className="spin"/> : testPassed ? <Check size={16}/> : <ShieldCheck size={16}/>}
      {testing ? "Sending internal test…" : testPassed ? "Run test again" : "Send internal test"}
    </button>
    {(notice || authorizationNotice) && <p className="success-text" role="status">{notice || authorizationNotice}</p>}
    {(error || authorizationError) && <p className="form-error" role="alert">{error || authorizationError}</p>}
  </section>;
}
