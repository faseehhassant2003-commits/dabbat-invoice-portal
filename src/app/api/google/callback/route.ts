import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/server/config";
import { clearGoogleOAuthCookie, completeGoogleAuthorization } from "@/lib/server/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const destination = new URL("/settings", getAppOrigin());
  try {
    await completeGoogleAuthorization(request);
    destination.searchParams.set("google", "connected");
  } catch {
    destination.searchParams.set("google", "error");
  }
  const response = NextResponse.redirect(destination, 303);
  clearGoogleOAuthCookie(response);
  return response;
}
