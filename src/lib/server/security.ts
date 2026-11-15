import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** Pure helpers: never read secrets or customer data at module scope. */
export function equalSecret(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Require the configured origin whenever the browser provides one. Some
 * privacy-preserving browser navigations serialize a same-origin form's
 * Origin header as `null`; Fetch Metadata still identifies those requests as
 * same-origin and cannot be set by cross-site browser JavaScript.
 */
export function isAllowedRequestOrigin(headers: Headers, expectedOrigin: string): boolean {
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) return false;
  const origin = headers.get("origin");
  if (origin === expectedOrigin) return true;
  return (!origin || origin === "null") && fetchSite === "same-origin";
}

export function isShopDomain(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value) && value.length <= 253;
}

export function signValue(value: object, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function verifyValue<T>(signed: string, secret: string): T | null {
  if (signed.length > 4096) return null;
  const [payload, signature, extra] = signed.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (!equalSecret(signature, expected)) return null;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T; }
  catch { return null; }
}

/** Shopify callback HMAC uses decoded parameters, sorted lexicographically. */
export function validCallbackHmac(params: URLSearchParams, secret: string): boolean {
  const entries = [...params.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return false;
  const received = params.get("hmac") ?? "";
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const message = entries.filter(([key]) => key !== "hmac")
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join("&");
  const expected = createHmac("sha256", secret).update(message).digest("hex");
  return equalSecret(received.toLowerCase(), expected);
}

export function validShopifyWebhookHmac(body: string | Uint8Array, received: string, secret: string): boolean {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(received)) return false;
  const expected = createHmac("sha256", secret).update(body).digest("base64");
  return equalSecret(received, expected);
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, salt, key, extra] = encoded.split(":");
  if (algorithm !== "scrypt" || extra || !/^[0-9a-f]{32}$/.test(salt ?? "") || !/^[0-9a-f]{128}$/.test(key ?? "")) return false;
  if (!password || password.length > 1024) return false;
  return equalSecret(scryptSync(password, salt, 64).toString("hex"), key);
}

export function encryptJson(value: unknown, keyHex: string): string {
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error("Invalid encryption key.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") });
}

export function decryptJson<T>(encoded: string, keyHex: string): T {
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error("Invalid encryption key.");
  const envelope = JSON.parse(encoded) as { version: number; iv: string; tag: string; data: string };
  if (envelope.version !== 1) throw new Error("Unsupported encrypted record.");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]).toString("utf8")) as T;
}
