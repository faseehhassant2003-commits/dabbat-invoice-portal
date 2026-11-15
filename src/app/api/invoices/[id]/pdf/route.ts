import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceDocument } from "@/components/invoice-document";
import { getInvoiceSnapshot } from "@/lib/server/invoices";
import { UnauthorizedError } from "@/lib/server/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const { id } = await context.params;
    const snapshot = await getInvoiceSnapshot(id);
    if (!snapshot) return Response.json({ error: "Invoice not found." }, { status: 404, headers });
    const buffer = await renderToBuffer(InvoiceDocument(snapshot));
    return new Response(new Uint8Array(buffer), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Dabbat-${snapshot.invoice.number.replace(/[^a-zA-Z0-9-]/g, "")}.pdf"` } });
  } catch (error) {
    return Response.json({ error: "The PDF is unavailable. Check your session and try again." }, { status: error instanceof UnauthorizedError ? 401 : 500, headers });
  }
}
