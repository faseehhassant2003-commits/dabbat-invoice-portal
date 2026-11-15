import { NextResponse } from "next/server";
import { assertSameOrigin, requireApiSession, UnauthorizedError } from "@/lib/server/auth";
import { startShopifyAuthorization } from "@/lib/server/oauth";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await requireApiSession();
    assertSameOrigin(request);
    return await startShopifyAuthorization();
  } catch (error) {
    return NextResponse.json({ error: error instanceof UnauthorizedError ? "Please sign in to the portal." : "Could not start Shopify authorization. Check the server configuration and request origin." }, { status: error instanceof UnauthorizedError ? 401 : 403 });
  }
}
