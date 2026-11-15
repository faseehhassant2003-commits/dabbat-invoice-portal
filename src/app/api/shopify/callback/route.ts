import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/server/config";
import { clearOAuthCookie, completeShopifyAuthorization } from "@/lib/server/oauth";
import { getOAuthFailureCategory } from "@/lib/server/oauth-errors";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await completeShopifyAuthorization(request);
    const response = NextResponse.redirect(new URL("/settings?connection=success", getAppOrigin()), 303);
    clearOAuthCookie(response);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    // Log fixed categories only; unknown failures can contain upstream secrets.
    console.warn("[shopify-oauth] Callback rejected:", getOAuthFailureCategory(error));
    // Never reflect query parameters, tokens, upstream errors or secrets.
    const response = NextResponse.json({ error: "Shopify authorization could not be verified. Sign in and restart the connection from Settings." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    try { clearOAuthCookie(response); } catch { /* Invalid config must still fail closed. */ }
    return response;
  }
}
