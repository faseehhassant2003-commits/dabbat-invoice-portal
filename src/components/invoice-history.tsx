"use client";
import Link from "next/link";
import { useState } from "react";
import { Download, FileText, Search, X } from "lucide-react";
import type { InvoiceRecord } from "@/lib/types";
import { date, money } from "@/lib/format";
import { EmptyState, PaymentBadge } from "./ui";

export function InvoiceHistory({ invoices }: { invoices: InvoiceRecord[] }) {
  const [query, setQuery] = useState("");
  const visible = invoices.filter(i => `${i.number} ${i.orderNumber}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <section className="panel">
    <div className="panel-heading">
      <div><h2>Saved invoices <span className="count-badge">{invoices.length}</span></h2><p>Original snapshots, ready to download again.</p></div>
      <div className="search-form"><Search size={17}/><input aria-label="Search invoices" placeholder="Find invoice or order…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button className="icon-button" onClick={() => setQuery("")} aria-label="Clear invoice search"><X size={14}/></button>}</div>
    </div>
    {visible.length ? <div className="table-scroll"><table className="orders-table invoice-table">
      <thead><tr><th>Invoice</th><th>Order / Customer</th><th>Created</th><th>Payment</th><th className="align-right">Total</th><th><span className="sr-only">Download</span></th></tr></thead>
      <tbody>{visible.map(invoice => <tr key={invoice.id}>
        <td><div className="invoice-number-cell"><span className="file-icon"><FileText size={19}/></span><div><strong>{invoice.number}</strong><span className="cell-secondary">{invoice.source === "sample" ? "Sample PDF · A4" : "PDF document · A4"}</span></div></div></td>
        <td><Link className="order-number" href={`/orders/${encodeURIComponent(invoice.orderId)}`}>{invoice.orderNumber}</Link><span className="cell-secondary">{invoice.customer}</span></td>
        <td className="date-cell">{date(invoice.createdAt, true)}</td>
        <td><PaymentBadge status={invoice.paymentStatus}/></td>
        <td className="align-right amount-cell">{money(invoice.total, invoice.currency)}</td>
        <td><a className="download-icon" href={`/api/invoices/${encodeURIComponent(invoice.id)}/pdf`} aria-label={`Download invoice ${invoice.number}`}><Download size={17}/></a></td>
      </tr>)}</tbody>
    </table></div> : <EmptyState invoice title={query ? "No matching invoices" : "Your invoice collection starts here"} description={query ? "Try another invoice or order number." : "Open an order and generate your first branded PDF invoice."}/>}
    <div className="panel-foot"><span>Invoices keep the details recorded when they were created.</span><Link href="/orders" className="text-link">Browse orders</Link></div>
  </section>;
}
