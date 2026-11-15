import { NextResponse } from "next/server";
import { assertSameOrigin, UnauthorizedError } from "@/lib/server/auth";
import {
  emailSavedInvoice,
  InvoiceEmailDeliveryError,
  InvoiceEmailNotFoundError,
  InvoiceEmailPendingError,
  InvoiceEmailRecipientError,
  InvoiceEmailSetupError,
  InvoiceEmailUnavailableError,
  getInvoiceEmailDelivery,
} from "@/lib/server/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "This request is not allowed." }, { status: 403, headers });
  }

  try {
    const { id } = await context.params;
    const requestId = request.headers.get("idempotency-key") ?? "";
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) return NextResponse.json({ error: "Refresh the page and try again." }, { status: 400, headers });
    let body: { resend?: unknown };
    try { body = await request.json() as { resend?: unknown }; }
    catch { return NextResponse.json({ error: "Refresh the page and try again." }, { status: 400, headers }); }
    const result = await emailSavedInvoice(id, requestId, body.resend === true);
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Sign in to email invoices." }, { status: 401, headers });
    if (error instanceof InvoiceEmailPendingError) return NextResponse.json({ error: error.message }, { status: 409, headers });
    if (error instanceof InvoiceEmailNotFoundError) return NextResponse.json({ error: error.message }, { status: 404, headers });
    if (error instanceof InvoiceEmailRecipientError) return NextResponse.json({ error: error.message }, { status: 422, headers });
    if (error instanceof InvoiceEmailUnavailableError) return NextResponse.json({ error: error.message }, { status: 403, headers });
    if (error instanceof InvoiceEmailSetupError) return NextResponse.json({ error: error.message }, { status: 503, headers });
    if (error instanceof InvoiceEmailDeliveryError) return NextResponse.json({ error: error.message }, { status: 502, headers });
    return NextResponse.json({ error: "The invoice could not be emailed. Check the portal and try again." }, { status: 500, headers });
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const delivery = await getInvoiceEmailDelivery(id);
    return NextResponse.json({ delivery }, { headers });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Sign in to view email status." }, { status: 401, headers });
    return NextResponse.json({ error: "Email status is currently unavailable." }, { status: 500, headers });
  }
}
