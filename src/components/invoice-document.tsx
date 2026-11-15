import path from "node:path";
import { readFileSync } from "node:fs";
import { Document, Font, Image, Page, StyleSheet, Text, View, type TextProps } from "@react-pdf/renderer";
import type { InvoiceRecord, Order, PaymentStatus, Seller } from "@/lib/types";
import { pdfFontForCharacter } from "@/lib/pdf-fonts";
import { summarizeGstLines } from "@/lib/gst";

type InvoiceDocumentProps = { invoice: InvoiceRecord; order: Order; seller: Seller };

Font.register({ family: "Noto Sans", fonts: [{ src: path.join(process.cwd(), "public/fonts/NotoSans-Regular.ttf"), fontWeight: 400 }, { src: path.join(process.cwd(), "public/fonts/NotoSans-Bold.ttf"), fontWeight: 700 }] });
Font.register({ family: "Noto Devanagari", fonts: [{ src: path.join(process.cwd(), "public/fonts/NotoSansDevanagari-Regular.ttf"), fontWeight: 400 }, { src: path.join(process.cwd(), "public/fonts/NotoSansDevanagari-Bold.ttf"), fontWeight: 700 }] });

function Value({ value, style }: { value: string; style?: TextProps["style"] }) {
  const runs: { family: string; text: string }[] = [];
  for (const character of value) {
    const family = /[\u200c\u200d]/.test(character) && runs.length ? runs.at(-1)!.family : pdfFontForCharacter(character);
    const previous = runs.at(-1);
    if (previous?.family === family) previous.text += character;
    else runs.push({ family, text: character });
  }
  return <Text style={style}>{runs.map((run, index) => <Text key={index} style={{ fontFamily: run.family }}>{run.text}</Text>)}</Text>;
}

const navy = "#033763";
const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 52, paddingHorizontal: 36, fontFamily: "Noto Sans", fontSize: 8.5, color: "#23364a", lineHeight: 1.3 },
  sample: { backgroundColor: "#edf4f8", borderRadius: 3, color: navy, paddingVertical: 5, paddingHorizontal: 10, fontSize: 7, letterSpacing: 1.1, marginBottom: 16, textAlign: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  logo: { width: 126, height: 31, objectFit: "contain", objectPosition: "left" },
  brandNote: { color: "#75828c", fontSize: 7.5, marginTop: 8, letterSpacing: 1.2 },
  invoiceTitle: { fontSize: 24, fontWeight: 700, color: navy, textAlign: "right", letterSpacing: -0.4 },
  invoiceNumber: { fontSize: 9, color: "#566574", textAlign: "right", marginTop: 4 },
  divider: { height: 2, backgroundColor: navy, marginBottom: 18 },
  details: { flexDirection: "row", gap: 24, marginBottom: 18 },
  detailColumn: { flex: 1, minWidth: 0 },
  label: { fontWeight: 700, color: "#75828c", fontSize: 7, letterSpacing: 1.4, marginBottom: 7 },
  name: { fontSize: 10, fontWeight: 700, color: navy, marginBottom: 3 },
  muted: { color: "#75828c" },
  line: { marginBottom: 2 },
  meta: { backgroundColor: "#f6f8fa", padding: 10, flexDirection: "row", gap: 15, marginBottom: 18, borderRadius: 3 },
  metaCell: { flex: 1 },
  metaLabel: { fontSize: 7, color: "#75828c", marginBottom: 4 },
  metaValue: { fontSize: 9, fontWeight: 700, color: navy },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#d8e2ea", paddingBottom: 8, color: "#75828c", fontSize: 7, fontWeight: 700, letterSpacing: 0.8 },
  row: { flexDirection: "row", paddingVertical: 9, borderBottomWidth: 0.5, borderBottomColor: "#e4eaf0" },
  product: { width: "46%", paddingRight: 14 },
  qty: { width: "10%", textAlign: "center" },
  price: { width: "22%", textAlign: "right", paddingRight: 10 },
  amount: { width: "22%", textAlign: "right" },
  productName: { fontWeight: 700, color: navy, marginBottom: 3 },
  productVariant: { color: "#75828c", fontSize: 8 },
  sku: { color: "#75828c", fontSize: 7, marginTop: 3 },
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 16 },
  totals: { width: 252 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5, gap: 14 },
  totalLabel: { flex: 1, color: "#566574" },
  totalValue: { textAlign: "right", color: "#23364a" },
  grandTotal: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.5, borderTopColor: navy, paddingTop: 10, marginTop: 4, gap: 12 },
  grandLabel: { fontSize: 11, fontWeight: 700, color: navy },
  grandValue: { fontSize: 14, fontWeight: 700, color: navy, textAlign: "right" },
  status: { marginTop: 18, padding: 10, backgroundColor: "#f6f8fa", borderLeftWidth: 2, borderLeftColor: navy },
  statusLabel: { fontSize: 9, fontWeight: 700, color: navy, marginBottom: 3 },
  statusText: { color: "#566574", fontSize: 8 },
  note: { marginTop: 10, color: "#75828c", fontSize: 7.5 },
  thanks: { marginTop: 18, fontWeight: 700, color: navy, fontSize: 10 },
  footer: { position: "absolute", bottom: 22, left: 36, right: 36, borderTopWidth: 0.5, borderTopColor: "#d8e2ea", paddingTop: 8, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#75828c" },
});

const paymentLabels: Record<PaymentStatus, string> = {
  paid: "Paid",
  pending: "Payment pending",
  partially_paid: "Partially paid",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
  authorized: "Authorized - payment not captured",
  voided: "Voided",
  unknown: "Payment status unavailable",
};

function amount(value: number, currency: string) {
  return `${currency} ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100)}`;
}

function issueDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

/** Render on the server from the saved invoice snapshot, never from browser data. */
export function InvoiceDocument({ invoice, order, seller }: InvoiceDocumentProps) {
  const sample = invoice.source === "sample";
  const legacy = seller.gst === undefined;
  const gstEnabled = seller.gst?.enabled === true;
  const gstLines = gstEnabled ? summarizeGstLines(order.taxData?.lines || []) : [];
  return (
    <Document title={`${sample ? "Sample " : ""}Invoice ${invoice.number}`} author={seller.name} subject={`Invoice for order ${order.number}`} creator="Dabbat Invoice Portal" language="en-IN">
      <Page size="A4" style={styles.page}>
        {sample && <Text style={styles.sample}>SAMPLE INVOICE / NOT A TAX INVOICE</Text>}
        <View style={styles.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- React PDF Image has no alt prop. */}
            <Image src={readFileSync(path.join(process.cwd(), "public", "brand", "dabbat-wordmark.png"))} style={styles.logo} />
            <Text style={styles.brandNote}>DABBAT INVOICE PORTAL</Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{invoice.number}</Text>
          </View>
        </View>
        <View style={styles.divider} />

        <View style={styles.details} wrap={false}>
          <View style={styles.detailColumn}>
            <Text style={styles.label}>FROM</Text>
            <Value style={styles.name} value={gstEnabled ? seller.gst!.legalName : seller.name} />
            {gstEnabled && seller.gst!.legalName !== seller.name && <Value style={styles.line} value={seller.name} />}
            {seller.address.length ? seller.address.map((line, index) => <Value key={index} style={styles.line} value={line} />) : <Text style={styles.muted}>Seller address not configured</Text>}
            <Value style={styles.line} value={seller.email} />
            <Value style={styles.line} value={seller.website} />
            {legacy && seller.taxRegistration && <Value style={styles.line} value={`Tax registration: ${seller.taxRegistration}`} />}
            {gstEnabled && <Value style={styles.line} value={`GSTIN: ${seller.gst!.gstin}`} />}
          </View>
          <View style={styles.detailColumn}>
            <Text style={styles.label}>BILL TO</Text>
            {order.billing ? <>
              <Value style={styles.name} value={order.billing.name} />
              {order.billing.lines.map((line, index) => <Value key={index} style={styles.line} value={line} />)}
              {order.billing.email && <Value style={styles.line} value={order.billing.email} />}
            </> : <Text style={styles.muted}>Billing details unavailable</Text>}
          </View>
        </View>

        <View style={styles.meta} wrap={false}>
          <View style={styles.metaCell}><Text style={styles.metaLabel}>ORDER NUMBER</Text><Value style={styles.metaValue} value={order.number} /></View>
          <View style={styles.metaCell}><Text style={styles.metaLabel}>ORDER DATE</Text><Text style={styles.metaValue}>{issueDate(order.createdAt)}</Text></View>
          <View style={styles.metaCell}><Text style={styles.metaLabel}>INVOICE DATE</Text><Text style={styles.metaValue}>{issueDate(invoice.createdAt)}</Text></View>
        </View>

        <View style={styles.tableHeader} wrap={false}>
          <Text style={styles.product}>PRODUCT</Text><Text style={styles.qty}>QTY</Text><Text style={styles.price}>UNIT PRICE</Text><Text style={styles.amount}>AMOUNT</Text>
        </View>
        {order.items.map((item) => <View key={item.id} style={styles.row} wrap={false}>
          <View style={styles.product}>
            <Value style={styles.productName} value={item.name} />
            {item.variant && <Value style={styles.productVariant} value={item.variant} />}
            {item.sku && <Value style={styles.sku} value={`SKU: ${item.sku}`} />}
          </View>
          <Text style={styles.qty}>{item.quantity}</Text>
          <Text style={styles.price}>{amount(item.unitPrice, order.currency)}</Text>
          <Text style={styles.amount}>{amount(item.total, order.currency)}</Text>
        </View>)}

        <View style={styles.totalsWrap} wrap={false}>
          <View style={styles.totals}>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal before discounts</Text><Text style={styles.totalValue}>{amount(order.subtotal, order.currency)}</Text></View>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Discounts</Text><Text style={styles.totalValue}>{order.discount ? "- " : ""}{amount(order.discount, order.currency)}</Text></View>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>{legacy ? "Shipping" : "Shipping after discounts"}</Text><Text style={styles.totalValue}>{amount(order.shipping, order.currency)}</Text></View>
            {legacy && <View style={styles.totalRow}><Text style={styles.totalLabel}>{order.taxesIncluded ? "Tax (included in prices)" : "Tax"}</Text><Text style={styles.totalValue}>{amount(order.tax, order.currency)}</Text></View>}
            {gstLines.map((line) => <View key={`${line.component}:${line.ratePercentage}`} style={styles.totalRow}>
              <Text style={styles.totalLabel}>{line.component} {line.ratePercentage}%{order.taxesIncluded ? " (included)" : ""}</Text>
              <Text style={styles.totalValue}>{amount(line.amount, order.currency)}</Text>
            </View>)}
            <View style={styles.grandTotal}><Text style={styles.grandLabel}>Total</Text><Text style={styles.grandValue}>{amount(order.total, order.currency)}</Text></View>
          </View>
        </View>
        {!legacy && (!gstEnabled || order.tax === 0) && <Text style={styles.note}>GST not charged.</Text>}

        <View style={styles.status} wrap={false}>
          <Text style={styles.statusLabel}>{paymentLabels[order.paymentStatus]}</Text>
          <Value style={styles.statusText} value={`Payment method: ${order.paymentMethod || "Unavailable"}`} />
          <Text style={styles.statusText}>Payment status captured on {issueDate(invoice.createdAt)}.</Text>
          {order.paymentStatus === "pending" && <Text style={styles.statusText}>Payment has not been recorded as received.</Text>}
          {order.paymentStatus === "authorized" && <Text style={styles.statusText}>Payment has been authorized and is awaiting capture.</Text>}
        </View>
        <Value style={styles.note} value={order.note || "This invoice records order values and payment status at the time of issue. Keep this document for your records."} />
        <Text style={styles.thanks}>Thank you for choosing Dabbat.</Text>
        <View style={styles.footer} fixed>
          <Value value={`${seller.website} / ${seller.email}`} />
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export default InvoiceDocument;
