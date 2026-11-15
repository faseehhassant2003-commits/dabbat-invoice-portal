import assert from "node:assert/strict";
import test from "node:test";
import { gmailApiErrorMessage } from "../src/lib/gmail-api-error";

test("reports the Gmail API status and message", async () => {
  const response = new Response(JSON.stringify({ error: { message: "Invalid from header" } }), { status: 400 });
  assert.equal(await gmailApiErrorMessage(response), "Gmail API rejected the message (HTTP 400): Invalid from header");
});

test("sanitizes and bounds Gmail API error details", async () => {
  const response = new Response(JSON.stringify({ error: { message: `bad\n${"x".repeat(300)}` } }), { status: 403 });
  const message = await gmailApiErrorMessage(response);
  assert.equal(message.includes("\n"), false);
  const detail = message.slice(message.indexOf(": ") + 2);
  assert.equal(detail.length, 240);
  assert.equal(detail.startsWith("bad "), true);
});

test("reports the HTTP status when Gmail returns a non-JSON error", async () => {
  const response = new Response("unavailable", { status: 502 });
  assert.equal(await gmailApiErrorMessage(response), "Gmail API rejected the message (HTTP 502).");
});
