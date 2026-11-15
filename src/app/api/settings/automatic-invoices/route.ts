import { NextResponse } from "next/server";
import { assertSameOrigin, requireApiSession, UnauthorizedError } from "@/lib/server/auth";
import { getAutomaticInvoiceSettings, saveAutomaticInvoiceSettings } from "@/lib/server/automatic-invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try { await requireApiSession(); return NextResponse.json(await getAutomaticInvoiceSettings(), { headers }); }
  catch (error) { return NextResponse.json({ error: "Sign in to view automatic invoice settings." }, { status: error instanceof UnauthorizedError ? 401 : 500, headers }); }
}

export async function POST(request: Request) {
  try { await requireApiSession(); }
  catch { return NextResponse.json({ error: "Sign in to change automatic invoice settings." }, { status: 401, headers }); }
  try { assertSameOrigin(request); }
  catch { return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403, headers }); }
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Send settings as JSON." }, { status: 415, headers });
  let enabled: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > 1024) { await reader.cancel(); return NextResponse.json({ error: "Settings request is too large." }, { status: 413, headers }); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    enabled = (JSON.parse(Buffer.concat(chunks).toString("utf8")) as { enabled?: unknown })?.enabled;
  } catch { return NextResponse.json({ error: "Choose whether automatic invoices are enabled." }, { status: 400, headers }); }
  if (typeof enabled !== "boolean") return NextResponse.json({ error: "Enabled must be true or false." }, { status: 400, headers });
  try { return NextResponse.json(await saveAutomaticInvoiceSettings(enabled), { headers }); }
  catch { return NextResponse.json({ error: "Unable to save. Check Shopify order notifications, customer access, and the Gmail internal test, then try again." }, { status: 409, headers }); }
}
