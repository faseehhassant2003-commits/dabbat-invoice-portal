import "server-only";
import path from "node:path";
import { isShopDomain } from "./security";

export function isDemoMode(): boolean {
  const mode = process.env.PORTAL_MODE ?? "demo";
  if (mode !== "demo" && mode !== "live") throw new Error("PORTAL_MODE must be demo or live.");
  return mode === "demo";
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function getAppOrigin(): string {
  // Synthetic local previews work without credentials; live mode requires an
  // explicit trusted origin so Host headers can never choose callback targets.
  const url = new URL(process.env.APP_URL?.trim() || (isDemoMode() ? "http://127.0.0.1:3000" : required("APP_URL")));
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("APP_URL must be an origin.");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local && (isDemoMode() || process.env.NODE_ENV !== "production"))) throw new Error("APP_URL requires HTTPS outside local development.");
  return url.origin;
}

export function getAuthConfig() {
  const sessionSecret = required("SESSION_SECRET");
  const encryptionKey = required("TOKEN_ENCRYPTION_KEY");
  const passwordHash = required("ADMIN_PASSWORD_HASH");
  if (sessionSecret.length < 64) throw new Error("SESSION_SECRET requires at least 64 characters.");
  if (!/^[0-9a-f]{64}$/i.test(encryptionKey)) throw new Error("TOKEN_ENCRYPTION_KEY requires 32 random bytes in hex.");
  if (!/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/.test(passwordHash)) throw new Error("Generate ADMIN_PASSWORD_HASH with npm run password:hash.");
  return { origin: getAppOrigin(), sessionSecret, encryptionKey, passwordHash, email: required("ADMIN_EMAIL").toLowerCase(), secure: new URL(getAppOrigin()).protocol === "https:", dataDir: path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR ?? "data") };
}

export function getShopifyConfig() {
  if (isDemoMode()) throw new Error("Shopify is disabled in sample mode.");
  const auth = getAuthConfig();
  const shop = required("SHOPIFY_SHOP_DOMAIN").toLowerCase();
  if (!isShopDomain(shop)) throw new Error("SHOPIFY_SHOP_DOMAIN must be the canonical *.myshopify.com domain.");
  const apiVersion = process.env.SHOPIFY_API_VERSION ?? "2026-10";
  if (apiVersion !== "2026-10") throw new Error("This integration is validated for Shopify API 2026-10.");
  const scopes = (process.env.SHOPIFY_SCOPES ?? "read_orders,read_products").split(",").map((scope) => scope.trim());
  if (scopes.length !== 2 || !scopes.includes("read_orders") || !scopes.includes("read_products")) throw new Error("Only read_orders,read_products are supported.");
  return { ...auth, shop, apiVersion, scopes, clientId: required("SHOPIFY_CLIENT_ID"), clientSecret: required("SHOPIFY_CLIENT_SECRET"), customerDataApproved: process.env.SHOPIFY_CUSTOMER_DATA_APPROVED === "true", redirectUri: `${auth.origin}/api/shopify/callback` };
}

export async function getIntegrationStatus() {
  const mode = isDemoMode() ? "demo" as const : "live" as const;
  if (mode === "demo") return { mode, configured: false, connected: false, shop: null };
  // RSC pages can render alongside their layout. Guard the loader itself.
  const { requireApiSession } = await import("./auth");
  await requireApiSession();
  try {
    const config = getShopifyConfig();
    const { readPrivateStore } = await import("./storage");
    const store = await readPrivateStore();
    const token = store.shopify;
    const connected = Boolean(token && token.shop === config.shop && (!token.refreshExpiresAt || token.refreshExpiresAt > Date.now()));
    return { mode, configured: true, connected, shop: config.shop };
  } catch { return { mode, configured: false, connected: false, shop: null }; }
}
