import test from "node:test";
import assert from "node:assert/strict";
import { getOAuthFailureCategory } from "../src/lib/server/oauth-errors";

test("known callback failures retain useful fixed diagnostic categories", () => {
  assert.equal(getOAuthFailureCategory(new Error("Shopify callback shop did not match the configured store.")), "SHOP_MISMATCH");
  assert.equal(getOAuthFailureCategory(new Error("Shopify callback HMAC verification failed.")), "HMAC_INVALID");
  assert.equal(getOAuthFailureCategory(new Error("OAuth state was invalid or expired. Start the connection again.")), "STATE_INVALID_OR_EXPIRED");
});

test("upstream errors containing token-like payloads cannot reach logged categories", () => {
  const sensitive = "shpat_SYNTHETIC_TEST_TOKEN_DO_NOT_LOG";
  const failures = [
    new SyntaxError(`Unexpected token in upstream response: {"access_token":"${sensitive}"}`),
    new Error(`Shopify callback HMAC verification failed.\n${sensitive}`),
    new Error(`https://callback.example.test/?code=${sensitive}&hmac=${sensitive}`),
    new Error("__proto__"),
    sensitive,
    { message: sensitive },
    null,
  ];
  for (const error of failures) {
    const category = getOAuthFailureCategory(error);
    assert.equal(category, "UNEXPECTED");
    const logArguments = JSON.stringify(["[shopify-oauth] Callback rejected:", category]);
    assert.equal(logArguments.includes(sensitive), false);
    assert.match(category, /^[A-Z_]+$/);
  }
});

test("unknown failure classification never evaluates custom message getters", () => {
  let getterCalled = false;
  const failure = new Error();
  Object.defineProperty(failure, "message", { get() { getterCalled = true; throw new Error("must not be evaluated"); } });
  assert.equal(getOAuthFailureCategory(failure), "UNEXPECTED");
  assert.equal(getterCalled, false);
});
