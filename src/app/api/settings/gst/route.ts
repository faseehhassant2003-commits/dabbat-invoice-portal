import { NextResponse } from "next/server";
import { assertSameOrigin, requireApiSession, UnauthorizedError } from "@/lib/server/auth";
import { isDemoMode } from "@/lib/server/config";
import { getGstSettings, saveGstSettings } from "@/lib/server/gst-settings";
import { GstSettingsValidationError } from "@/lib/gst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

async function requireLiveOwner() {
  if (!isDemoMode()) await requireApiSession();
}

export async function GET() {
  try {
    await requireLiveOwner();
    return NextResponse.json({ settings: await getGstSettings(), demo: isDemoMode() }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof UnauthorizedError ? "Sign in to view invoice settings." : "Invoice settings are unavailable. Please try again." }, { status: error instanceof UnauthorizedError ? 401 : 503, headers });
  }
}

export async function POST(request: Request) {
  try { await requireLiveOwner(); }
  catch (error) {
    return NextResponse.json({ error: error instanceof UnauthorizedError ? "Sign in to update invoice settings." : "Invoice settings are unavailable. Check the portal configuration." }, { status: error instanceof UnauthorizedError ? 401 : 503, headers });
  }
  try { assertSameOrigin(request); }
  catch { return NextResponse.json({ error: "This request is not allowed. Open Settings in the portal and try again." }, { status: 403, headers }); }
  if ((request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") return NextResponse.json({ error: "Send invoice settings as JSON." }, { status: 415, headers });
  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Invoice settings are required." }, { status: 400, headers });
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 8192) { await reader.cancel(); return NextResponse.json({ error: "Invoice settings are too large." }, { status: 413, headers }); }
      chunks.push(part.value);
    }
    let input: unknown;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return NextResponse.json({ error: "Invoice settings must contain valid JSON." }, { status: 400, headers }); }
    const settings = await saveGstSettings(input);
    return NextResponse.json({ settings, demo: isDemoMode() }, { headers });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Sign in to update invoice settings." }, { status: 401, headers });
    if (error instanceof GstSettingsValidationError) return NextResponse.json({ error: error.message }, { status: 400, headers });
    return NextResponse.json({ error: "Invoice settings could not be saved. Please try again." }, { status: 503, headers });
  }
}
