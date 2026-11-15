"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Check, ChevronDown, FileText, LayoutDashboard, LogOut, Menu, Settings, ShoppingBag, X, FlaskConical } from "lucide-react";
const nav = [{ href: "/", label: "Overview", icon: LayoutDashboard }, { href: "/orders", label: "Orders", icon: ShoppingBag }, { href: "/invoices", label: "Invoice history", icon: FileText }, { href: "/settings", label: "Settings", icon: Settings }];
export function PortalShell({ children, demo }: { children: React.ReactNode; demo: boolean }) {
  const pathname = usePathname(); const [open, setOpen] = useState(false);
  return <div className="portal"><aside className={`sidebar ${open ? "is-open" : ""}`}>
    <Link href="/" className="brand" aria-label="Dabbat home"><Image src="/brand/dabbat-wordmark.png" width={134} height={34} alt="dabbat" priority /><span>INVOICE PORTAL</span></Link>
    <button className="mobile-close icon-button" aria-label="Close navigation" onClick={() => setOpen(false)}><X size={20}/></button>
    <div className="store-switch"><div className="store-monogram">d.</div><div><strong>Dabbat</strong><span>dabbat.in</span></div><ChevronDown size={15}/></div>
    <p className="nav-label">WORKSPACE</p><nav>{nav.map(({href,label,icon:Icon}) => <Link onClick={()=>setOpen(false)} key={href} href={href} className={`nav-link ${(href === "/" ? pathname === href : pathname.startsWith(href)) ? "active" : ""}`}><Icon size={18}/><span>{label}</span></Link>)}</nav>
    <div className="sidebar-bottom"><div className="connection-card"><span className={`connection-dot ${demo ? "sample" : ""}`}/><div><strong>{demo ? "Sample workspace" : "Private workspace"}</strong><span>{demo ? "Shopify is not connected" : "Server-side store access"}</span></div></div><a href="mailto:support@dabbat.in" className="help-link">Need a hand? <ArrowUpRight size={14}/></a><div className="owner"><div className="avatar navy">D</div><div><strong>Dabbat team</strong><span>Store administrator</span></div>{!demo && <form action="/api/auth/logout" method="post"><button className="icon-button" aria-label="Sign out"><LogOut size={16}/></button></form>}</div></div>
  </aside>{open && <button className="sidebar-scrim" onClick={()=>setOpen(false)} aria-label="Close menu"/>}
  <div className="main-wrap"><header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={()=>setOpen(true)}><Menu size={21}/></button><span>Workspace</span><span className="slash">/</span><strong>{pathname.startsWith("/orders/") ? "Order details" : nav.find(x=>x.href===pathname)?.label ?? "Overview"}</strong></div><div className="topbar-right"><a href="https://dabbat.in" target="_blank" rel="noreferrer" className="store-link">Visit store <ArrowUpRight size={14}/></a><span className="topbar-divider"/><span className={`mode-pill ${demo ? "" : "live"}`}>{demo ? <FlaskConical size={12}/> : <Check size={12}/>} {demo ? "Sample mode" : "Private portal"}</span><div className="avatar small">D</div></div></header>
  {demo && <div className="sample-banner"><FlaskConical size={15}/><p><strong>You’re exploring sample data.</strong> Orders and invoices are fictional. Your live store is untouched.</p><Link href="/settings">Set up Shopify <ArrowUpRight size={13}/></Link></div>}
  <main className="main-content">{children}</main><footer className="page-footer"><span>© {new Date().getFullYear()} Dabbat. Made for the details.</span><span><span className="tiny-dot"/> {demo ? "Preview workspace" : "Private workspace"}<span className="footer-sep">·</span>support@dabbat.in</span></footer></div></div>;
}
