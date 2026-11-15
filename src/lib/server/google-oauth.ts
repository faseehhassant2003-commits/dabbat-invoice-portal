import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireApiSession } from "./auth";
import { getAppOrigin, getAuthConfig, isDemoMode } from "./config";
import { equalSecret, signValue, verifyValue } from "./security";
import { readPrivateStore, updatePrivateStore, type GoogleMailToken } from "./storage";
import { googleRefreshFailureInvalidatesConnection } from "@/lib/integration-reliability";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_OAUTH_ACCOUNT = "official@dabbat.in";
export const GMAIL_FROM_ALIAS = "support@dabbat.in";
const OAUTH_COOKIE = "dabbat_google_oauth_state";

type GoogleOAuthState = { state: string; sessionId: string; expiresAt: number };
type GoogleTokenResponse = { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown; token_type?: unknown };

export class GoogleOAuthConfigError extends Error {}
export class GoogleOAuthFlowError extends Error {}

function getClientConfig() {
  if (isDemoMode()) throw new GoogleOAuthConfigError("Google email is only available in live mode.");
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new GoogleOAuthConfigError("Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET on the server.");
  return { clientId, clientSecret, redirectUri: `${getAppOrigin()}/api/google/callback` };
}

export async function startGoogleAuthorization(): Promise<NextResponse> {
  const config = getClientConfig();
  const session = await requireApiSession();
  const state = { state: randomBytes(32).toString("hex"), sessionId: session.id, expiresAt: Date.now() + 10 * 60_000 };
  await updatePrivateStore((store) => {
    store.googleOauth = (store.googleOauth ?? []).filter((record) => record.sessionId !== session.id);
    store.googleOauth.push(state);
  });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GMAIL_SEND_SCOPE,
    access_type: "offline",
    prompt: "consent",
    login_hint: GMAIL_OAUTH_ACCOUNT,
    hd: "dabbat.in",
    state: state.state,
  }).toString();

  const response = NextResponse.redirect(url, 303);
  response.cookies.set(OAUTH_COOKIE, signValue(state, getAuthConfig().sessionSecret), {
    httpOnly: true,
    secure: getAuthConfig().secure,
    sameSite: "lax",
    path: "/api/google/callback",
    maxAge: 600,
  });
  return response;
}

async function exchangeCode(code: string): Promise<GoogleMailToken> {
  const config = getClientConfig();
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GoogleOAuthFlowError("Could not reach Google. Try connecting Gmail again.");
  }
  if (!response.ok) throw new GoogleOAuthFlowError("Google rejected the authorization. Connect Gmail again.");
  const raw = await response.json() as GoogleTokenResponse;
  const accessToken = typeof raw.access_token === "string" ? raw.access_token : "";
  const expiresIn = Number(raw.expires_in);
  const scope = typeof raw.scope === "string" ? raw.scope.trim().split(/\s+/) : [];
  const refreshToken = typeof raw.refresh_token === "string" ? raw.refresh_token : "";
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0 || scope.length !== 1 || scope[0] !== GMAIL_SEND_SCOPE || !refreshToken) {
    throw new GoogleOAuthFlowError("Google did not grant the required Gmail send access. Reconnect Gmail and approve only the requested permission.");
  }
  return { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000, scope: GMAIL_SEND_SCOPE, testedAt: null };
}

export async function completeGoogleAuthorization(request: Request): Promise<void> {
  getClientConfig();
  const session = await requireApiSession();
  const params = new URL(request.url).searchParams;
  const signedState = (await cookies()).get(OAUTH_COOKIE)?.value ?? "";
  const state = verifyValue<GoogleOAuthState>(signedState, getAuthConfig().sessionSecret);
  if (!state || state.sessionId !== session.id || state.expiresAt <= Date.now() ||
      !equalSecret(state.state, params.get("state") ?? "")) {
    throw new GoogleOAuthFlowError("Google authorization state was invalid or expired. Start the connection again.");
  }

  const consumed = await updatePrivateStore((store) => {
    const records = store.googleOauth ?? [];
    const found = records.some((record) => record.state === state.state && record.sessionId === session.id && record.expiresAt > Date.now());
    store.googleOauth = records.filter((record) => record.state !== state.state);
    return found;
  });
  if (!consumed) throw new GoogleOAuthFlowError("This Google authorization has already been used or expired.");
  if (params.get("error")) throw new GoogleOAuthFlowError("Google authorization was cancelled or denied.");
  const code = params.get("code");
  if (!code || code.length > 2048) throw new GoogleOAuthFlowError("Google did not provide a valid authorization code.");
  const token = await exchangeCode(code);
  await updatePrivateStore((store) => { store.googleMail = token; });
}

export function clearGoogleOAuthCookie(response: NextResponse): void {
  response.cookies.set(OAUTH_COOKIE, "", {
    httpOnly: true,
    secure: getAuthConfig().secure,
    sameSite: "lax",
    path: "/api/google/callback",
    maxAge: 0,
  });
}

export async function getGoogleMailStatus() {
  await requireApiSession();
  const configured = Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim());
  const googleMail = (await readPrivateStore()).googleMail;
  return {
    configured,
    connected: Boolean(googleMail?.refreshToken),
    testPassed: Boolean(googleMail?.testedAt),
    testedAt: googleMail?.testedAt ?? null,
  };
}

let refreshInFlight: Promise<string> | null = null;

export async function getGmailAccessToken(): Promise<string> {
  const current = (await readPrivateStore()).googleMail;
  if (!current?.refreshToken) throw new GoogleOAuthConfigError("Connect Google Workspace Gmail in Settings first.");
  if (current.accessToken && current.expiresAt > Date.now() + 60_000) return current.accessToken;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const config = getClientConfig();
    let response: Response;
    try {
      response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: current.refreshToken,
          grant_type: "refresh_token",
        }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new GoogleOAuthFlowError("Could not refresh Google authorization. Try again or reconnect Gmail.");
    }
    if (!response.ok) {
      if (googleRefreshFailureInvalidatesConnection(response.status)) {
        await updatePrivateStore((store) => { if (store.googleMail?.refreshToken === current.refreshToken) delete store.googleMail; });
        throw new GoogleOAuthFlowError("Google authorization expired or was revoked. Reconnect Gmail in Settings.");
      }
      throw new GoogleOAuthFlowError("Google could not refresh authorization. Try again later; the saved connection was preserved.");
    }
    const raw = await response.json() as GoogleTokenResponse;
    const accessToken = typeof raw.access_token === "string" ? raw.access_token : "";
    const expiresIn = Number(raw.expires_in);
    if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new GoogleOAuthFlowError("Google returned an invalid access token. Reconnect Gmail.");
    const refreshed = { ...current, accessToken, expiresAt: Date.now() + expiresIn * 1000 };
    await updatePrivateStore((store) => { store.googleMail = refreshed; });
    return accessToken;
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function markGoogleMailTestPassed(): Promise<void> {
  await updatePrivateStore((store) => {
    if (!store.googleMail?.refreshToken) throw new GoogleOAuthConfigError("Connect Google Workspace Gmail before running the test.");
    store.googleMail.testedAt = Date.now();
  });
}
