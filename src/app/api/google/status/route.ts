import { NextResponse } from "next/server";
import { UnauthorizedError } from "@/lib/server/auth";
import { getGoogleMailStatus } from "@/lib/server/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getGoogleMailStatus(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Sign in to view Google connection status." }, { status: 401 });
    return NextResponse.json({ error: "Google connection status is unavailable." }, { status: 500 });
  }
}
