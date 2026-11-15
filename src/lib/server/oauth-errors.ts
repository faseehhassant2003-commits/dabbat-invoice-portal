// Only fixed categories may enter callback logs. Upstream JSON/parser/library
// errors can include response excerpts, credentials, or callback parameters.
const categories = [
  ["Please sign in to the portal.", "OWNER_SESSION_REQUIRED"],
  ["OAuth state was invalid or expired. Start the connection again.", "STATE_INVALID_OR_EXPIRED"],
  ["Shopify callback shop did not match the configured store.", "SHOP_MISMATCH"],
  ["Shopify callback HMAC verification failed.", "HMAC_INVALID"],
  ["Shopify callback timestamp was invalid or expired.", "TIMESTAMP_INVALID_OR_EXPIRED"],
  ["Shopify did not provide a valid authorization code.", "AUTHORIZATION_CODE_INVALID"],
  ["This authorization has already been used or expired.", "STATE_ALREADY_USED_OR_EXPIRED"],
  ["Could not reach Shopify. Please try connecting again.", "TOKEN_ENDPOINT_UNREACHABLE"],
  ["Shopify authorization was unsuccessful. Please reconnect.", "TOKEN_EXCHANGE_REJECTED"],
  ["Shopify did not grant the required permissions. Reconnect the app.", "SCOPES_NOT_GRANTED"],
  ["Shopify returned an invalid expiring access token.", "TOKEN_RESPONSE_INVALID"],
  ["Shopify did not return an offline refresh token. Reconnect the app.", "OFFLINE_REFRESH_TOKEN_MISSING"],
  ["Unable to decrypt private storage. Check the encryption key and disk.", "PRIVATE_STORAGE_UNREADABLE"],
  ["Private portal storage is busy. Please try again.", "PRIVATE_STORAGE_BUSY"],
  ["Shopify is disabled in sample mode.", "SHOPIFY_DISABLED"],
  ["SHOPIFY_SHOP_DOMAIN must be the canonical *.myshopify.com domain.", "SHOP_DOMAIN_CONFIG_INVALID"],
  ["This integration is validated for Shopify API 2026-10.", "API_VERSION_CONFIG_INVALID"],
  ["Only read_orders,read_products are supported.", "SCOPES_CONFIG_INVALID"],
  ["APP_URL must be an origin.", "APP_ORIGIN_CONFIG_INVALID"],
  ["APP_URL requires HTTPS outside local development.", "APP_ORIGIN_CONFIG_INVALID"],
] as const;

export type OAuthFailureCategory = typeof categories[number][1] | "UNEXPECTED";
const categoryByMessage = new Map<string, OAuthFailureCategory>(categories);

export function getOAuthFailureCategory(error: unknown): OAuthFailureCategory {
  try {
    if (!(error instanceof Error)) return "UNEXPECTED";
    // Never invoke an arbitrary message getter or stringify an unknown object.
    const message: unknown = Object.getOwnPropertyDescriptor(error, "message")?.value;
    return typeof message === "string" ? categoryByMessage.get(message) ?? "UNEXPECTED" : "UNEXPECTED";
  } catch { return "UNEXPECTED"; }
}
