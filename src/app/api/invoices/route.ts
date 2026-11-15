import { NextResponse } from "next/server";
import { assertSameOrigin, UnauthorizedError } from "@/lib/server/auth";
import { createInvoice, listInvoices } from "@/lib/server/invoices";
import { GstInvoiceError, GstSettingsValidationError } from "@/lib/gst";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try { return NextResponse.json({ invoices: await listInvoices() }, { headers }); }
  catch (error) { return NextResponse.json({ error: "Invoice history is unavailable. Sign in and check the portal configuration." }, { status: error instanceof UnauthorizedError ? 401 : 500, headers }); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "Send an invoice request as JSON." }, { status: 415, headers });
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Choose an order to generate an invoice." }, { status: 400, headers });
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 2048) { await reader.cancel(); return NextResponse.json({ error: "Request is too large." }, { status: 413, headers }); }
      chunks.push(part.value);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    const body = JSON.parse(text) as { orderId?: unknown };
    if (typeof body.orderId !== "string" || body.orderId.length > 80 || !/^[a-zA-Z0-9-]+$/.test(body.orderId)) return NextResponse.json({ error: "Choose a valid order." }, { status: 400, headers });
    const invoice = await createInvoice(body.orderId);
    return NextResponse.json({ invoice }, { status: 201, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The invoice could not be generated.";
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Sign in to generate an invoice." }, { status: 401, headers });
    if (error instanceof GstInvoiceError || error instanceof GstSettingsValidationError) return NextResponse.json({ error: message }, { status: 422, headers });
    if (/origin|Cross-site/.test(message)) return NextResponse.json({ error: "This request is not allowed." }, { status: 403, headers });
    // Domain errors here contain no access tokens or customer fields.
    const allowed = /^(Order not found\.|The order contains|This order has|Line items do not match|Order totals include|The discount exceeds|Add the seller|Invoice history is busy|This order exceeds|Could not load every)/.test(message);
    return NextResponse.json({ error: allowed ? message : "The invoice could not be generated. Check your session and connection in Settings." }, { status: 400, headers });
  }
}
