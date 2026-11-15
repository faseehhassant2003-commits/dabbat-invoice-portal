import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireApiSession } from "./auth";
import { getShopifyConfig } from "./config";
import { equalSecret, signValue, validCallbackHmac, verifyValue } from "./security";
import { readPrivateStore, ShopifyToken, updatePrivateStore, withStorageLock } from "./storage";

const OAUTH_COOKIE = "dabbat_oauth_state";
type OAuthState = { state: string; sessionId: string; expiresAt: number };
type TokenResponse = { access_token?: unknown; refresh_token?: unknown; scope?: unknown; expires_in?: unknown; refresh_token_expires_in?: unknown };

// Reauthorization and refresh must never race to replace Shopify's rotating
// token pair. A disk lock also covers separate Next route bundles/workers.
let tokenOperationQueue: Promise<unknown> = Promise.resolve();
function withTokenOperation<T>(operation: () => Promise<T>): Promise<T> {
  const task = tokenOperationQueue.then(() => withStorageLock("shopify-token", operation));
  tokenOperationQueue = task.catch(() => undefined);
  return task;
}

export async function startShopifyAuthorization(): Promise<NextResponse> {
  const config = getShopifyConfig();
  const session = await requireApiSession();
  const state = { state: randomBytes(32).toString("hex"), sessionId: session.id, expiresAt: Date.now() + 10 * 60_000 };
  await updatePrivateStore((store) => {
    store.oauth = store.oauth.filter((record) => record.sessionId !== session.id);
    store.oauth.push(state);
  });
  const url = new URL(`https://${config.shop}/admin/oauth/authorize`);
  url.search = new URLSearchParams({ client_id: config.clientId, scope: config.scopes.join(","), redirect_uri: config.redirectUri, state: state.state }).toString();
  // No grant_options[]=per-user: this explicitly uses the offline code grant.
  const response = NextResponse.redirect(url, 303);
  response.cookies.set(OAUTH_COOKIE, signValue(state, config.sessionSecret), { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/api/shopify/callback", maxAge: 600 });
  return response;
}

function parseTokenResponse(raw: TokenResponse, shop: string, previous?: ShopifyToken): ShopifyToken {
  const scope = typeof raw.scope === "string" ? raw.scope : previous?.scope;
  const granted = new Set((scope ?? "").split(",").map((s) => s.trim()));
  const config = getShopifyConfig();
  if (!scope || config.scopes.some((s) => !granted.has(s) && !granted.has(s.replace(/^read_/, "write_")))) throw new Error("Shopify did not grant the required permissions. Reconnect the app.");
  const seconds = Number(raw.expires_in);
  if (typeof raw.access_token !== "string" || !raw.access_token || !Number.isFinite(seconds) || seconds <= 0) throw new Error("Shopify returned an invalid expiring access token.");
  const refreshToken = typeof raw.refresh_token === "string" ? raw.refresh_token : previous?.refreshToken;
  if (!refreshToken) throw new Error("Shopify did not return an offline refresh token. Reconnect the app.");
  const refreshSeconds = Number(raw.refresh_token_expires_in);
  return { shop, accessToken: raw.access_token, scope, expiresAt: Date.now() + seconds * 1000, refreshToken, refreshExpiresAt: Number.isFinite(refreshSeconds) && refreshSeconds > 0 ? Date.now() + refreshSeconds * 1000 : previous?.refreshExpiresAt ?? null };
}

async function tokenRequest(parameters: Record<string, string>): Promise<Response> {
  const config = getShopifyConfig();
  try {
    return await fetch(`https://${config.shop}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...parameters }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) });
  } catch { throw new Error("Could not reach Shopify. Please try connecting again."); }
}

export async function completeShopifyAuthorization(request: Request): Promise<void> {
  const config = getShopifyConfig();
  const session = await requireApiSession();
  const params = new URL(request.url).searchParams;
  const value = (await cookies()).get(OAUTH_COOKIE)?.value ?? "";
  const state = verifyValue<OAuthState>(value, config.sessionSecret);
  const timestamp = Number(params.get("timestamp"));
  if (!state || state.sessionId !== session.id || state.expiresAt <= Date.now() || !equalSecret(state.state, params.get("state") ?? "")) throw new Error("OAuth state was invalid or expired. Start the connection again.");
  if (params.get("shop") !== config.shop) throw new Error("Shopify callback shop did not match the configured store.");
  if (!validCallbackHmac(params, config.clientSecret)) throw new Error("Shopify callback HMAC verification failed.");
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp * 1000) > 5 * 60_000) throw new Error("Shopify callback timestamp was invalid or expired.");
  const code = params.get("code");
  if (!code || code.length > 2048) throw new Error("Shopify did not provide a valid authorization code.");
  // Atomic consumption makes state single-use even if a callback is replayed.
  const consumed = await updatePrivateStore((store) => {
    const found = store.oauth.some((record) => record.state === state.state && record.sessionId === session.id && record.expiresAt > Date.now());
    store.oauth = store.oauth.filter((record) => record.state !== state.state);
    return found;
  });
  if (!consumed) throw new Error("This authorization has already been used or expired.");
  await withTokenOperation(async () => {
    const response = await tokenRequest({ code, expiring: "1" });
    if (!response.ok) throw new Error("Shopify authorization was unsuccessful. Please reconnect.");
    const token = parseTokenResponse(await response.json() as TokenResponse, config.shop);
    await updatePrivateStore((store) => { store.shopify = token; });
  });
}

export function clearOAuthCookie(response: NextResponse): void {
  response.cookies.set(OAUTH_COOKIE, "", { httpOnly: true, secure: getShopifyConfig().secure, sameSite: "lax", path: "/api/shopify/callback", maxAge: 0 });
}

let refreshInFlight: Promise<ShopifyToken> | null = null;
async function refreshToken(token: ShopifyToken): Promise<ShopifyToken> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = withTokenOperation(async () => {
    // A prior request may have refreshed between this caller's read and the lock.
    const current = (await readPrivateStore()).shopify;
    if (!current || current.shop !== token.shop) throw new Error("Shopify authorization changed. Reconnect from Settings.");
    if (current.accessToken !== token.accessToken) return current;
    if (!token.refreshToken || (token.refreshExpiresAt && token.refreshExpiresAt <= Date.now())) throw new Error("Shopify authorization expired. Reconnect from Settings.");
    const response = await tokenRequest({ grant_type: "refresh_token", refresh_token: token.refreshToken });
    if (!response.ok) {
      if ([400, 401, 403].includes(response.status)) await updatePrivateStore((store) => {
        if (store.shopify?.accessToken === token.accessToken) delete store.shopify;
      });
      throw new Error("Shopify token refresh failed. Reconnect from Settings if this continues.");
    }
    const refreshed = parseTokenResponse(await response.json() as TokenResponse, token.shop, token);
    await updatePrivateStore((store) => { store.shopify = refreshed; });
    return refreshed;
  });
  try { return await refreshInFlight; }
  finally { refreshInFlight = null; }
}

/** Server-only, read-only Admin API access. Never called in demo. */
async function shopifyGraphqlInternal<T>(query: string, variables: Record<string, unknown>, authenticated: boolean): Promise<T> {
  const config = getShopifyConfig();
  if (authenticated) await requireApiSession();
  else if (!config.customerDataApproved) throw new Error("Customer data access is not enabled for background invoice processing.");
  if (!/^\s*(query\b|\{)/.test(query) || /\bmutation\b/.test(query)) throw new Error("Only read-only Shopify queries are supported.");
  let token = (await readPrivateStore()).shopify;
  if (!token || token.shop !== config.shop) throw new Error("Connect your Shopify store in Settings first.");
  if (token.expiresAt && token.expiresAt <= Date.now() + 120_000) token = await refreshToken(token);
  const send = async (accessToken: string) => {
    try {
      return await fetch(`https://${config.shop}/admin/api/${config.apiVersion}/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken }, body: JSON.stringify({ query, variables }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) });
    } catch { throw new Error("Shopify is temporarily unreachable. Please try again."); }
  };
  let response = await send(token.accessToken);
  if (response.status === 401) { token = await refreshToken(token); response = await send(token.accessToken); }
  if (response.status === 429) throw new Error("Shopify is busy. Please wait a moment and try again.");
  if (!response.ok) throw new Error("Shopify could not complete the request. Check the connection and permissions in Settings.");
  const servedVersion = response.headers.get("x-shopify-api-version");
  if (servedVersion && servedVersion !== config.apiVersion) throw new Error("Shopify served a different API version. Review the integration before continuing.");
  const result = await response.json() as { data?: T; errors?: { extensions?: { code?: string } }[] };
  if (result.errors?.length || !result.data) throw new Error("Shopify could not return this data. Check app scopes and protected customer data approval.");
  return result.data;
}

export async function shopifyGraphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  return shopifyGraphqlInternal<T>(query, variables, true);
}

export async function shopifyGraphqlForWebhook<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  return shopifyGraphqlInternal<T>(query, variables, false);
}
