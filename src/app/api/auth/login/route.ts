import { NextResponse } from "next/server";
import { assertSameOrigin, attachSession, authenticateOwner } from "@/lib/server/auth";
import { getAppOrigin } from "@/lib/server/config";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try { assertSameOrigin(request); }
  catch { return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 }); }
  try {
    if (!(request.headers.get("content-type") ?? "").startsWith("application/x-www-form-urlencoded")) return NextResponse.json({ error: "Use the portal sign-in form." }, { status: 415 });
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "A sign-in form is required." }, { status: 400 });
    let length = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 16_384) { await reader.cancel(); return NextResponse.json({ error: "The sign-in form is too large." }, { status: 413 }); }
      chunks.push(part.value);
    }
    const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    const email = form.get("email");
    const password = form.get("password");
    if (typeof email !== "string" || typeof password !== "string" || email.length > 320 || password.length > 1024) return NextResponse.redirect(new URL("/login?error=credentials", getAppOrigin()), 303);
    const session = await authenticateOwner(email, password);
    if (!session) return NextResponse.redirect(new URL("/login?error=credentials", getAppOrigin()), 303);
    if (session === "throttled") return NextResponse.redirect(new URL("/login?error=throttled", getAppOrigin()), 303);
    const response = NextResponse.redirect(new URL("/", getAppOrigin()), 303);
    response.headers.set("Cache-Control", "no-store");
    attachSession(response, session);
    return response;
  } catch { return NextResponse.json({ error: "Portal authentication is not configured. Review the server environment variables." }, { status: 503 }); }
}
