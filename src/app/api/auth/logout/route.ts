import { NextResponse } from "next/server";
import { assertSameOrigin, revokeSession } from "@/lib/server/auth";
import { getAppOrigin } from "@/lib/server/config";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try { assertSameOrigin(request); }
  catch { return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 }); }
  try {
    const response = NextResponse.redirect(new URL("/login", getAppOrigin()), 303);
    await revokeSession(response);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch { return NextResponse.json({ error: "Portal authentication is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
