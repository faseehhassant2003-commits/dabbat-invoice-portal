import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, scryptSync } from "node:crypto";
import { decryptJson, encryptJson, isAllowedRequestOrigin, isShopDomain, signValue, validCallbackHmac, validShopifyWebhookHmac, verifyPassword, verifyValue } from "../src/lib/server/security";

test("mutation origin guard accepts tunneled same-origin forms and rejects cross-site requests", () => {
  const expected = "https://portal.example.com";
  assert.equal(isAllowedRequestOrigin(new Headers({ origin: expected }), expected), true);
  assert.equal(isAllowedRequestOrigin(new Headers({ origin: expected, "sec-fetch-site": "same-origin" }), expected), true);
  assert.equal(isAllowedRequestOrigin(new Headers({ origin: "null", "sec-fetch-site": "same-origin" }), expected), true);
  assert.equal(isAllowedRequestOrigin(new Headers({ "sec-fetch-site": "same-origin" }), expected), true);
  assert.equal(isAllowedRequestOrigin(new Headers({ origin: "https://attacker.example", "sec-fetch-site": "cross-site" }), expected), false);
  assert.equal(isAllowedRequestOrigin(new Headers({ origin: "null", "sec-fetch-site": "cross-site" }), expected), false);
  assert.equal(isAllowedRequestOrigin(new Headers({ origin: "null", "sec-fetch-site": "none" }), expected), false);
  assert.equal(isAllowedRequestOrigin(new Headers(), expected), false);
});

test("shop allowlist rejects storefront domains, credentials, paths and suffix attacks", () => {
  assert.equal(isShopDomain("dabbat-store.myshopify.com"), true);
  for (const domain of ["dabbat.in", "dabbat.myshopify.com.evil.com", "https://dabbat.myshopify.com", "foo@dabbat.myshopify.com", "dabbat.myshopify.com/admin", "-dabbat.myshopify.com", "dabbat.myshopify.com:443"]) assert.equal(isShopDomain(domain), false, domain);
});
test("callback HMAC validates reordered decoded params and rejects tampering or duplicate keys", () => {
  const secret = "test-secret";
  const params = new URLSearchParams("shop=dabbat.myshopify.com&state=nonce&timestamp=1794672000&code=authorization-code");
  const message = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
  params.set("hmac", createHmac("sha256", secret).update(message).digest("hex"));
  assert.equal(validCallbackHmac(params, secret), true);
  const modified = new URLSearchParams(params); modified.set("code", "stolen-code");
  assert.equal(validCallbackHmac(modified, secret), false);
  params.append("shop", "attacker.myshopify.com");
  assert.equal(validCallbackHmac(params, secret), false);
});
test("Shopify webhook HMAC validates the exact raw body", () => {
  const secret = "webhook-secret";
  const body = '{"id":123,"email":"customer@example.com"}';
  const hmac = createHmac("sha256", secret).update(body).digest("base64");
  assert.equal(validShopifyWebhookHmac(body, hmac, secret), true);
  assert.equal(validShopifyWebhookHmac(`${body} `, hmac, secret), false);
  assert.equal(validShopifyWebhookHmac(body, "invalid", secret), false);
});
test("signed session/state values reject modification and wrong secrets", () => {
  const value = { id: "nonce", expiresAt: 123456 };
  const encoded = signValue(value, "correct-secret");
  assert.deepEqual(verifyValue(encoded, "correct-secret"), value);
  assert.equal(verifyValue(encoded, "wrong-secret"), null);
  assert.equal(verifyValue(`${encoded}x`, "correct-secret"), null);
  assert.equal(verifyValue("malformed", "correct-secret"), null);
});
test("AES-GCM stores no plaintext tokens and rejects tampering or key rotation", () => {
  const key = randomBytes(32).toString("hex");
  const value = { accessToken: "sensitive-shop-token", address: "private-customer-address" };
  const encoded = encryptJson(value, key);
  assert.equal(encoded.includes(value.accessToken), false);
  assert.equal(encoded.includes(value.address), false);
  assert.deepEqual(decryptJson(encoded, key), value);
  assert.throws(() => decryptJson(encoded, randomBytes(32).toString("hex")));
  const envelope = JSON.parse(encoded); envelope.tag = randomBytes(16).toString("base64");
  assert.throws(() => decryptJson(JSON.stringify(envelope), key));
});
test("owner password hash checks scrypt output and rejects bad formats", () => {
  const salt = randomBytes(16).toString("hex");
  const password = "correct horse battery staple";
  const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  assert.equal(verifyPassword(password, hash), true);
  assert.equal(verifyPassword("wrong password", hash), false);
  assert.equal(verifyPassword(password, "plaintext-password"), false);
});
