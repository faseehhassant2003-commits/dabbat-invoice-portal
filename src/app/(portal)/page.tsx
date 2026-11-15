import Link from "next/link";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Clock3, FileCheck2, FileText, ShoppingBag, Wallet, Settings2, Mail } from "lucide-react";
import { listOrders } from "@/lib/server/orders";
import { listInvoices } from "@/lib/server/invoices";
import { getIntegrationStatus, isDemoMode } from "@/lib/server/config";
import { ConnectionRequired } from "@/components/connection-required";
import { money, date } from "@/lib/format";
import { EmptyState, OrderTable, PageHeading } from "@/components/ui";
import { getOrderEmailIndicators } from "@/lib/server/email";

export default async function Dashboard() {
  const demo = isDemoMode();
  if (!demo) {
    const status = await getIntegrationStatus();
    if (!status.connected || process.env.SHOPIFY_CUSTOMER_DATA_APPROVED !== "true") {
      return <><PageHeading eyebrow="WORKSPACE OVERVIEW" title="Welcome to Dabbat" description="Connect your store to bring orders and invoices together."/><ConnectionRequired customerAccess={status.connected}/></>;
    }
  }
  const [orders, invoices] = await Promise.all([listOrders(), listInvoices()]);
  const recent = orders.slice(0, 5);
  const orderEmails = await getOrderEmailIndicators(recent.map(order => order.id));
  const pending = orders.filter(order => order.paymentStatus === "pending" || order.paymentStatus === "partially_paid").length;
  const currencies = [...new Set(orders.map(order => order.currency))];
  const orderValue = currencies.length > 1 ? "Multiple currencies" : money(orders.reduce((sum, order) => sum + order.total, 0), currencies[0] ?? "INR");
  const paid = orders.filter(order => order.paymentStatus === "paid").length;
  const latest = invoices[0];
  const metrics = [
    { label: "Order value", value: orderValue, icon: Wallet, tone: "blue", detail: "Total value of loaded orders" },
    { label: "Recent orders", value: String(orders.length), icon: ShoppingBag, tone: "blue", detail: `${paid} paid orders` },
    { label: "Invoices created", value: String(invoices.length), icon: FileCheck2, tone: "green", detail: "Saved in your invoice history" },
    { label: "Awaiting payment", value: String(pending), icon: Clock3, tone: "amber", detail: "Pending and partially paid orders" },
  ];
  return <div className="dashboard-overview">
    <PageHeading eyebrow="WORKSPACE OVERVIEW" title="Business, beautifully organised." description="A clear view of your orders, invoices, and what needs attention." action={<Link className="button primary" href="/orders"><FileText size={16}/>Create invoice<ArrowUpRight size={15}/></Link>}/>
    <div className="overview-context"><span><span className="tiny-dot"/>{demo ? "Sample workspace" : "Your store workspace"}</span><span>Based on {orders.length} loaded orders · Not a lifetime sales report</span></div>
    <div className="stats-grid">{metrics.map(({label,value,icon:Icon,tone,detail}) => <div className="stat-card" key={label}><div className="stat-top"><span>{label}</span><div className={`stat-icon ${tone}`}><Icon size={19}/></div></div><div className="stat-number">{value}</div><p>{detail}</p></div>)}</div>
    <div className="dashboard-grid">
      <section className="panel orders-panel"><div className="panel-heading"><div><span className="section-kicker">ORDER ACTIVITY</span><h2>Recent orders <span className="count-badge">{orders.length}</span></h2><p>Your latest orders, ready for the next step.</p></div><Link className="button secondary" href="/orders">View all orders<ArrowRight size={15}/></Link></div>{recent.length ? <OrderTable orders={recent} emailIndicators={orderEmails}/> : <EmptyState title="Your orders will appear here" description="Connect your store to manage orders and create invoices."/>}<div className="panel-foot"><span>Payment and email status at a glance</span><span>Showing {recent.length} of {orders.length}</span></div></section>
      <aside className="dashboard-aside"><section className="panel quick-actions"><div className="panel-heading"><div><span className="section-kicker">YOUR WORKSPACE</span><h2>Quick actions</h2></div><Settings2 size={18}/></div><Link href="/orders" className="quick-action"><span className="action-icon"><FileText size={19}/></span><span><strong>Create an invoice</strong><small>Select an order to get started</small></span><ArrowUpRight size={17}/></Link><Link href="/invoices" className="quick-action"><span className="action-icon"><ArrowDownToLine size={19}/></span><span><strong>Invoice history</strong><small>Find and download saved PDFs</small></span><ArrowUpRight size={17}/></Link><Link href="/settings" className="quick-action"><span className="action-icon"><Mail size={19}/></span><span><strong>Email & integrations</strong><small>Manage your store connections</small></span><ArrowUpRight size={17}/></Link></section>
      <section className="latest-invoice-card"><span className="section-kicker">LATEST INVOICE</span><div className="latest-invoice-icon"><FileCheck2 size={24}/></div><h2>{latest?.number ?? "Ready when you are"}</h2><p>{latest ? `${latest.customer} · ${date(latest.createdAt, true)}` : "Turn your next order into a professional, branded invoice."}</p>{latest && <strong className="latest-invoice-total">{money(latest.total, latest.currency)}</strong>}<Link href={latest ? `/api/invoices/${encodeURIComponent(latest.id)}/pdf` : "/orders"} className="button secondary">{latest ? <ArrowDownToLine size={16}/> : <FileText size={16}/>} {latest ? "Download invoice" : "Find an order"}</Link><span className="latest-caption">Dabbat branded · A4 PDF</span></section></aside>
    </div>
    <div className="workspace-note"><span className="action-icon"><FileCheck2 size={20}/></span><div><strong>Every detail, in one place.</strong><p>Open an order to review its details, create an invoice, and send it to your customer.</p></div><Link href="/orders" className="text-link">Manage orders<ArrowRight size={15}/></Link></div>
  </div>;
}
