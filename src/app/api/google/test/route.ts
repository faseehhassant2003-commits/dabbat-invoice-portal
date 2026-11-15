import { NextResponse } from "next/server";
import { assertSameOrigin, requireApiSession, UnauthorizedError } from "@/lib/server/auth";
import { sendGmailApiTest } from "@/lib/server/gmail-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireApiSession();
    await sendGmailApiTest();
    return NextResponse.json({ sent: true, recipient: "official@dabbat.in" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Sign in to test Google Workspace Gmail." }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "The internal Gmail API test failed." }, { status: 503 });
  }
}
