import { NextResponse } from "next/server";
import { assertSameOrigin, UnauthorizedError } from "@/lib/server/auth";
import { startGoogleAuthorization } from "@/lib/server/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return await startGoogleAuthorization();
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Sign in before connecting Google Workspace." }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google connection could not be started." }, { status: 503 });
  }
}
