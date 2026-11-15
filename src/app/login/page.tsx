import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/server/auth";
import { isDemoMode } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getPortalSession()) redirect("/");
  const demo = isDemoMode();
  const { error } = await searchParams;
  const message = error === "throttled" ? "Too many sign-in attempts. Please wait 15 minutes and try again." : error ? "The email or password was incorrect. Please try again." : null;
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "36px 20px", background: "#f6f8fa" }}>
    <div style={{ width: "100%", maxWidth: 430 }}>
      <Link href="/" aria-label="Dabbat Invoice Portal"><Image src="/brand/dabbat-wordmark.png" alt="dabbat" width={154} height={39} priority /></Link>
      <div style={{ background: "white", border: "1px solid #e3e9ef", borderRadius: 16, padding: "36px 28px", marginTop: 28, boxShadow: "0 8px 40px #03376306" }}>
        <div style={{ width: 44, height: 44, background: "#edf3f8", borderRadius: 12, display: "grid", placeItems: "center", color: "#033763", marginBottom: 24 }}><LockKeyhole size={21} /></div>
        <p className="eyebrow">DABBAT INVOICE PORTAL</p>
        <h1 style={{ fontSize: 29, lineHeight: 1.2, margin: "10px 0 12px" }}>Welcome back.</h1>
        <p style={{ color: "#718096", fontSize: 14, lineHeight: 1.7, marginBottom: 26 }}>Sign in to your private workspace to manage store orders and invoices.</p>
        {demo ? <><p style={{ padding: 16, borderRadius: 8, background: "#f0f5fa", fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>You’re in sample mode. Explore the complete interface with fictional orders. Owner sign-in becomes available after the server environment is configured.</p><Link className="button primary" href="/">Explore sample workspace <ArrowRight size={16} /></Link></> : <form action="/api/auth/login" method="post" style={{ display: "grid", gap: 18 }}>
          {message && <p role="alert" style={{ color: "#9d3030", background: "#fff1f1", padding: 12, borderRadius: 8, fontSize: 13 }}>{message}</p>}
          <label style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 600 }}>Email address<input required type="email" name="email" autoComplete="username" maxLength={320} placeholder="support@dabbat.in" style={{ border: "1px solid #dce3eb", padding: "12px 14px", borderRadius: 8, fontWeight: 400, width: "100%" }} /></label>
          <label style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 600 }}>Password<input required type="password" name="password" autoComplete="current-password" maxLength={1024} placeholder="Enter your password" style={{ border: "1px solid #dce3eb", padding: "12px 14px", borderRadius: 8, fontWeight: 400, width: "100%" }} /></label>
          <button className="button primary" style={{ justifyContent: "center", marginTop: 6 }} type="submit">Sign in <ArrowRight size={16} /></button>
        </form>}
        <p style={{ color: "#7b8796", display: "flex", alignItems: "center", gap: 7, marginTop: 24, fontSize: 12 }}><ShieldCheck size={15} /> Private access for the Dabbat team</p>
      </div>
      <a style={{ display: "inline-flex", gap: 8, alignItems: "center", color: "#718096", fontSize: 13, marginTop: 24 }} href="https://dabbat.in"><ArrowLeft size={14} /> Back to dabbat.in</a>
    </div>
  </main>;
}
