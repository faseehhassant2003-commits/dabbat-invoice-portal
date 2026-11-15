# Dabbat Invoice Portal

A private external invoice workspace for Dabbat, built with Next.js App Router, TypeScript, Tailwind CSS, Shopify GraphQL Admin API `2026-10`, and `@react-pdf/renderer`. The first phase runs entirely with explicitly labeled fictional orders. It never reads the connected Shopify account or changes the store, theme, Razorpay, or Shiprocket.

## Preview locally

Use Node.js 22 or newer (Node 24 recommended).

```powershell
cd 'D:\dabbat\dabbat invoice generator'
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open **http://127.0.0.1:3000**. The supplied local environment already enables sample mode. Keep `APP_URL` equal to the origin you open; use `127.0.0.1` consistently. If you use another port, update `APP_URL` too. Stop the server with Ctrl+C. For a production build locally, use `npm run build` then `npm start`; sample mode accepts the configured loopback origin.

Try Overview → Orders → search `1047` → open the unpaid COD order → Generate PDF invoice → Download invoice. Visit Invoice history to download it again. Generated sample invoices persist across reloads/restarts in `data/sample/`; two seed sample invoices are included. All sample documents say **SAMPLE — NOT A TAX INVOICE**. Email sending is disabled for sample invoices.

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

## Secure Shopify setup, next phase

Set values privately in `.env.local` or your hosting secret manager. Restart Next.js after changing them. None of these use `NEXT_PUBLIC_`.

| Variable | Purpose |
| --- | --- |
| `PORTAL_MODE` | `demo` by default. Set `live` only after completing secure setup. |
| `APP_URL` | Exact portal origin; HTTPS required in production/live use. OAuth callback is `{APP_URL}/api/shopify/callback`. |
| `ADMIN_EMAIL` | Portal owner login, normally `support@dabbat.in`. |
| `ADMIN_PASSWORD_HASH` | Generate with `npm run password:hash`; do not store the plain password. |
| `SESSION_SECRET` | Independent cryptographically random secret, at least 64 characters. |
| `TOKEN_ENCRYPTION_KEY` | Independent 32-byte random encryption key encoded as 64 hexadecimal characters. |
| `SHOPIFY_CLIENT_ID` | Client ID of the existing Dabbat invoice app. |
| `SHOPIFY_CLIENT_SECRET` | That app’s Client secret. |
| `SHOPIFY_SHOP_DOMAIN` | The store’s permanent `your-store.myshopify.com` domain, **not** `dabbat.in`. |
| `SHOPIFY_API_VERSION` | `2026-10`, the version validated for this implementation. |
| `SHOPIFY_SCOPES` | Exactly `read_orders,read_products`. |
| `SHOPIFY_CUSTOMER_DATA_APPROVED` | Keep `false` until the app has the required protected customer data access. `true` is a local gate, not Shopify approval. |
| `DATA_DIR` | Private durable storage directory, default `data`. Outside `public/`; never commit it or serve it over HTTP. |
| `SELLER_NAME`, `SELLER_EMAIL` | Real seller name/email. Defaults: Dabbat and support@dabbat.in. |
| `SELLER_ADDRESS` | Required actual business address; separate lines with `|`. |
| `GMAIL_USER` | Google Workspace inbox used as the invoice sender. |
| `GMAIL_APP_PASSWORD` | App Password for that inbox. Keep it server-side; never use the normal account password. |
| GST registration | Disabled by default. Configure it in Settings after registration; no GSTIN is required now. |

### Gmail API invoice delivery

The portal requests only the `https://www.googleapis.com/auth/gmail.send` scope. In Google Cloud, add this exact Authorized redirect URI for the current app URL:

```text
https://welding-nutritional-penn-intense.trycloudflare.com/api/google/callback
```

The hostname above is the current development tunnel and may change. The redirect URI must always equal `{APP_URL}/api/google/callback`; update Google Cloud whenever `APP_URL` changes. For a permanent deployment, configure its stable HTTPS origin instead.

Add these values to `.env.local` for local work, or to the hosting provider’s server-side secret manager. Never use `NEXT_PUBLIC_` or commit real credentials:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth Web Application client ID. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth Web Application client secret. |
| `INVOICE_EMAIL_PROVIDER` | Keep `smtp` until the internal API test succeeds. Then set to `gmail-api` to use OAuth for manual invoices. |
| `GMAIL_AUTO_SEND_ENABLED` | Must remain `false` during testing. Automatic sending is only activated by explicitly setting `true`. |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Existing SMTP fallback credentials; keep intact until Gmail API testing succeeds. These are not used by Gmail API. |

Restart the app after editing local environment values. Sign in, open **Settings → Email invoices → Connect Google Workspace**, and verify the consent screen shows `official@dabbat.in`. The `login_hint` is not an account lock, so choose the correct Workspace account yourself. Before connecting, configure and verify `support@dabbat.in` as a Gmail “Send mail as” alias on that account. The portal sends as the alias and cannot check alias configuration with the send-only scope.

Use **Send internal test** only after connecting. It sends a sample-marked PDF only to `official@dabbat.in`; it does not contact a customer. After it succeeds, you may set `INVOICE_EMAIL_PROVIDER=gmail-api` to switch manual sends. On a live order, **Email invoice** sends the saved PDF to the saved order email after confirmation. The order page shows Pending, Sent, or Failed, blocks duplicate attempts, and offers explicit resend. Gmail cannot guarantee idempotency if a network failure happens after accepting a message; check the sender mailbox before resending a failed/ambiguous delivery.

Shopify automatic sending is off by default. The verified webhook endpoint is `{APP_URL}/api/shopify/webhooks`; subscribe it to `orders/create` and `orders/paid` in the Shopify app configuration. It verifies Shopify’s raw-body HMAC, configured shop, and event ID, then reads the canonical order through the existing read-only Admin API. It sends only a pending COD order on `orders/create` or a paid order on `orders/paid`. After internal testing and webhook verification, set `GMAIL_AUTO_SEND_ENABLED=true` only when you are ready for eligible real orders to email customers. Shopify’s own order confirmation emails are not changed. Webhook event IDs and invoice delivery state are retained in encrypted private storage.

**Deployment limitation:** this integration uses the project’s existing Node.js encrypted-file storage and PDF renderer. It is not yet deployable to Cloudflare Workers. Worker deployment requires replacing filesystem session/token/invoice storage and locks with durable bindings (for example D1/R2/KV as appropriate) and validating PDF/font rendering in the Workers runtime. Gmail API uses HTTPS `fetch`, but that alone does not make the portal Worker-compatible. Until that separate migration, use a persistent Node.js host.

For an interactive local setup that saves your chosen administrator password directly to `.env.local` without displaying it, run:

```powershell
npm run setup:admin
```

Enter a password of at least 14 characters twice. Input is hidden. The helper saves only a scrypt hash and preserves existing store credentials. It will not replace an already configured administrator password.

To generate **two separate** random secrets manually, run this command twice:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm run password:hash
```

1. Confirm that the existing installed app has a Dev Dashboard distribution/install configuration supporting standalone **authorization code grant** and that you have its Client ID and secret. An already installed app does not automatically grant this portal access. Legacy admin-created token-only apps may need a compatible Dev Dashboard app configuration. This portal does not use client credentials grant or a manually pasted Admin API token.
2. Configure the app URL and exact allowed redirect URL `{APP_URL}/api/shopify/callback` in Shopify. Keep this app standalone/nonembedded. For local OAuth use a secure development tunnel, set `APP_URL` to its HTTPS origin, and register that exact callback.
3. Obtain the required protected customer data access for order customer name, email, and billing address. Then set `SHOPIFY_CUSTOMER_DATA_APPROVED=true`. `read_orders` alone does not grant all customer fields. Orders outside Shopify’s default 60-day window need separately approved `read_all_orders`; this phase deliberately requests only the two stated scopes and shows the latest 20 orders/search matches.
4. Add the real seller address. GST stays disabled until explicitly configured in Settings; no registration is invented. This is an order invoice template; any required statutory invoice fields should be supplied for the business before issuing live documents.
5. Set `PORTAL_MODE=live`, restart, sign in at `/login`, then open **Settings → Connect Shopify**. This redirects through Shopify consent and returns to the private portal. Real order reads only begin once live mode, owner authentication, OAuth tokens, and customer data approval are all present.

The portal validates the allowed shop hostname, callback HMAC, timestamp, and single-use OAuth state tied to the owner’s signed session. It requests expiring offline access/refresh tokens and refreshes them server-side. Access tokens, refresh tokens, owner sessions, and live invoice snapshots are encrypted at rest with AES-256-GCM. Sessions use HttpOnly, SameSite cookies (Secure over HTTPS). Mutating routes enforce the configured origin; sign-in is throttled. Shopify calls use `cache: 'no-store'`; private pages/documents return private no-store headers.

## Persistence and invoice behavior

This phase targets **one Node.js server process with durable private disk**, such as a single VM or container. It is not ready for ephemeral or multi-instance serverless hosting. Before that deployment, replace the local encrypted file adapters in `src/lib/server/storage.ts` and `src/lib/server/invoices.ts` with a transactional database, shared rate limiting/session storage, and managed encryption keys. Back up the data and encryption key securely; losing the key prevents reading saved tokens and live history.

Keep `DATA_DIR` outside the web root and restrict OS filesystem ACLs to the server account, particularly on Windows where POSIX mode bits do not enforce those ACLs. Live data is encrypted; demo history contains only fictional data. Invoice writes use an exclusive lock and atomic replacement. If the process is forcibly terminated during a write, stop the server and verify no other process is using the directory before removing a stale `invoices.lock`, `private.lock`, or `shopify-token.lock`. Never delete live history to solve a numbering problem.

Invoices save immutable order/seller/payment snapshots and one stable number per order. Repeat generation returns the original invoice; later refunds or order edits do not rewrite an issued document. Credit notes, cancellations, and statutory tax configuration remain later-phase work. COD pending and authorized/partially paid states are preserved; a PDF never marks them paid. Gross item amounts, discounts, shipping, and Shopify-provided taxes must reconcile to the total; unsupported additional fees or incomplete billing/line-item data block generation. Bundled PDF fonts support Latin and Devanagari text; unsupported glyphs block issue until a suitable font is added. Mixed-currency and non-two-decimal currencies are rejected by this INR-first phase. Search and history remain available separately from invoice generation.

## Reference documentation

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Shopify standalone authorization code flow](https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps)
- [Shopify access tokens and expiry](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens)
- [Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data)
- [Order query, API 2026-10](https://shopify.dev/docs/api/admin-graphql/2026-10/queries/order)

No Shopify consent, credentials, or real order access was used to build or verify phase one.


## Optional GST registration

Dabbat is currently not GST-registered. GST defaults to **off**, and the portal hides GSTIN, state-code, registration-date and GST tax-detail inputs until the owner turns it on in Settings. New non-GST invoices omit GSTIN and tax breakdowns. A positive recorded Shopify tax blocks new non-GST invoice generation rather than silently changing the order total.

After obtaining a confirmed regular registration, the owner can supply the actual GSTIN, registered legal name, matching state code and effective registration date, and confirm that the Shopify tax setup has been reviewed. The portal checks input format, not government registration status. There are no editable tax rates, calculated GST amounts, or Shopify tax-setting mutations. The legacy SELLER_TAX_REGISTRATION variable is ignored for newly generated invoices; existing snapshots continue to retain their recorded details.

When enabled, GST amounts and rates come only from authenticated Shopify product/shipping tax lines. Each line is counted once and must reconcile to Shopify's original totalTaxSet. Estimated, incomplete, edited, refunded, ambiguous or pre-registration orders are blocked for review. Generic GST labels are never split, and unknown/channel-liable seller tax treatment is not inferred. Tax-inclusive totals retain their original treatment. Sample orders never fabricate positive Shopify GST.

Live settings are authenticated, origin-checked and stored inside the encrypted private store; sample settings use a separate sample file. Disabling GST clears the active registration fields. Saved invoice snapshots include the effective registration and recorded tax data and are never rewritten when these settings change.

This is a foundation for optional GST details on the existing order invoice, not an assertion that all statutory GST tax-invoice requirements are satisfied. The document remains titled INVOICE. HSN/SAC, units, place of supply, reverse-charge treatment, special/export/composition supplies and any other applicable particulars require an appropriate business-specific implementation and review before relying on the document as a statutory GST tax invoice. See [CBIC invoice rules](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001), [Shopify TaxLine](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/TaxLine) and [Shopify ShippingLine](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/ShippingLine).
