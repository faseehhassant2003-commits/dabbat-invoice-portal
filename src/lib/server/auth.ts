import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getAppOrigin, getAuthConfig } from "./config";
import { equalSecret, isAllowedRequestOrigin, signValue, verifyPassword, verifyValue } from "./security";
import { readPrivateStore, updatePrivateStore } from "./storage";

export const SESSION_COOKIE = "dabbat_session";
export interface PortalSession { id: string; expiresAt: number }
export class UnauthorizedError extends Error { constructor() { super("Please sign in to the portal."); } }

export async function getPortalSession(): Promise<PortalSession | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  try {
    const session = verifyValue<PortalSession>(value, getAuthConfig().sessionSecret);
    if (!session || typeof session.id !== "string" || session.expiresAt <= Date.now()) return null;
    const store = await readPrivateStore();
    return store.sessions.some((record) => record.id === session.id && record.expiresAt === session.expiresAt) ? session : null;
  } catch { return null; }
}

export async function requirePortalSession(): Promise<PortalSession> {
  const session = await getPortalSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireApiSession(): Promise<PortalSession> {
  const session = await getPortalSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export function assertSameOrigin(request: Request): void {
  if (!isAllowedRequestOrigin(request.headers, getAppOrigin())) throw new Error("Request origin is not allowed.");
}

export async function authenticateOwner(email: string, password: string): Promise<PortalSession | null | "throttled"> {
  const config = getAuthConfig();
  // Persisted global account throttle: client-provided proxy IPs cannot bypass it.
  const allowed = await updatePrivateStore((store) => {
    if (store.loginAttempts.resetAt <= Date.now()) store.loginAttempts = { count: 0, resetAt: Date.now() + 15 * 60_000 };
    if (store.loginAttempts.count >= 8) return false;
    store.loginAttempts.count += 1;
    return true;
  });
  if (!allowed) return "throttled";
  const passwordMatches = verifyPassword(password, config.passwordHash);
  if (!equalSecret(email.toLowerCase().trim(), config.email) || !passwordMatches) return null;
  const session = { id: randomBytes(32).toString("hex"), expiresAt: Date.now() + 8 * 60 * 60_000 };
  await updatePrivateStore((store) => { store.sessions.push(session); store.loginAttempts = { count: 0, resetAt: 0 }; });
  return session;
}

export function attachSession(response: NextResponse, session: PortalSession): void {
  const config = getAuthConfig();
  response.cookies.set(SESSION_COOKIE, signValue(session, config.sessionSecret), { httpOnly: true, sameSite: "lax", secure: config.secure, path: "/", expires: new Date(session.expiresAt) });
}

export async function revokeSession(response: NextResponse): Promise<void> {
  const session = await getPortalSession();
  if (session) await updatePrivateStore((store) => { store.sessions = store.sessions.filter((record) => record.id !== session.id); store.oauth = store.oauth.filter((record) => record.sessionId !== session.id); });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: getAuthConfig().secure, path: "/", maxAge: 0 });
}
