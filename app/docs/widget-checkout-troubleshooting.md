# Embedded checkout: finding the rejection reason

## Partner checks

1. Save the exact HTTPS origin of the page launching checkout under **Dashboard → Widget websites**. `https://example.com` and `https://www.example.com` are different origins. The registered website's origin is also allowed.
2. Use a new, validated **live** cart with status `open`. A test cart's checkout simulator does not exercise the live embed route.
3. Use the current widget and `TCGPlaytest.checkout(cart)`. The helper constructs `/embed/partner-checkout/<private-token>?parent_origin=<exact-origin>`. Do not iframe the plain `checkout_url`: `/partner-checkout/<token>` intentionally sends `X-Frame-Options: DENY`.
4. Stripe payment leaves the frame and opens at the top level. Ordinary widget checkout does not require Stripe Connect. Connect is a separate retail-price/earnings integration.

The embed route allows only the validated parent origin. Never fix a blocked frame by adding a wildcard or removing cart/partner checks. For an intentional full-page flow, the widget supports `data-checkout-display="redirect"`; this does not bypass cart validation.

## Find the matching logs

### Confirmed missing branding column

The supplied production schema check identified `partnership_requests.checkout_branding` as missing. Live checkout explicitly selects this column in its initial cart/partner query; the test checkout does not require that column. This mismatch makes the live query fail and the main site deny the frame even when artwork is stored and the cart is open.

Apply the partner repository's `supabase/migrations/20261021000000_checkout_branding.sql` in the **partner database**. It adds the JSONB column with an empty-object default, preserves existing values on rerun and requests a PostgREST schema-cache refresh. Existing partners use default TCGPlaytest branding until they save customization. Retry the existing unexpired checkout after the migration succeeds. This schema repair does not require a new API key, a weaker frame policy, or an app redeploy. The separate logging code still needs deployment.

If the five-second lock timeout expires, the transaction rolls back; retry at a quieter moment instead of removing the timeout. If checkout still fails after the schema cache refresh, use the correlated diagnostics below rather than assuming all failures share this cause.

Deploy the partner handler first, then the main-site middleware/helper. No new environment variable, API-key rotation or SQL migration is required for these diagnostics.

In browser DevTools → Network, select the failing **embed document**, then read the **response** header `X-TCGP-Checkout-Request-Id`. This random UUID is safe to share with support along with the time and website origin. Do not share the private checkout URL, a full HAR, request bodies, cookies or Authorization headers.

In Vercel → the **main website project → Logs**, search for that UUID or `checkout_embed_denied`. Read `reason`. When `reason` is `partner_checkout_rejected`, also read `upstream_reason` and `upstream_status`.

In Vercel → the **partner platform project → Logs**, search the same UUID or `partner_checkout_rejected`. Its `reason` identifies the cart/configuration check that failed. It can include internal cart/partner record IDs, but never the checkout capability token, customer email, artwork URL or internal secret. Keep project logs restricted to operators. Successful validation does not produce a rejection event.

Use **all log levels**, not only `level:error`: invalid carts/origins are warnings; server/configuration/lookup failures are errors. Database failures also include `database_error_code` (a SQLSTATE/PostgREST code, when provided) and `database_status` (upstream HTTP status, when provided). Raw database messages, details, hints and HTML are deliberately omitted. For example, `42703` indicates an undefined column, `42P01` an undefined table, `42501` insufficient privilege, and `57014` a cancelled query. Investigate the database stage named by `reason`; a 520/504 status can instead indicate an upstream service failure. Missing codes are not proof of a schema problem.

Example (synthetic):

```json
{"event":"checkout_embed_denied","request_id":"6dc62dc8-40b4-4a9a-a627-e1cc165217b1","reason":"partner_checkout_rejected","parent_origin":"https://store.example","partner_origin":"https://partner.example","upstream_status":409,"upstream_reason":"cart_expired"}
```

The private internal checkout response additionally returns `X-TCGP-Checkout-Reason` to the main server. The public embed response only exposes the request ID and a generic error, not the internal rejection details. Only known reason codes are copied to the main log.

## Main-site reasons

| Reason | What to check |
| --- | --- |
| `invalid_checkout_token` | A malformed embed path; use the current widget with the original cart response. |
| `missing_parent_origin`, `invalid_parent_origin` | Use the helper; it sends the exact HTTPS `window.location.origin`, with no path, query or credentials. |
| `partner_platform_missing`, `partner_platform_invalid` | Set the main site's `PARTNER_PLATFORM_ORIGIN` to the correct final HTTPS partner deployment. |
| `internal_secret_missing`, `internal_secret_invalid` | Main-site `PARTNER_INTERNAL_SECRET` must exist, be at least 32 characters, and match the partner deployment. |
| `partner_lookup_redirect` | The internal endpoint returned 3xx. Use the final host; internal credentials are deliberately not forwarded through redirects. |
| `partner_lookup_timeout` | The partner checkout lookup or body read exceeded its 15-second deadline. Check upstream runtime/database availability. |
| `partner_lookup_network_error` | The main server could not complete the partner request. Check hostname, TLS, networking and upstream availability. Raw network errors are omitted to avoid logging secrets. |
| `partner_lookup_invalid_json`, `partner_lookup_invalid_response` | The upstream returned an unexpected successful response. Check deployment protection, rewrites, WAF and the configured hostname. |
| `partner_checkout_rejected` | Read the HTTP status and known `upstream_reason`; use the partner table below. If no reason exists, inspect the partner deployment/hosting logs. |
| `no_allowed_origins` | The cart response supplied no usable HTTPS registered website or widget origin. Check partner settings. |
| `parent_origin_not_allowed` | Compare `parent_origin` with `allowed_origins` in this event; save the exact intended HTTPS origin. |

## Partner-platform reasons

| Reason | What to check |
| --- | --- |
| `internal_secret_missing`, `internal_secret_invalid`, `internal_auth_failed` | Partner `PARTNER_INTERNAL_SECRET` is missing, too short, or does not match the authenticated caller. |
| `invalid_request`, `invalid_checkout_token` | Invalid JSON/request/token format. Deploy matching app versions and use the widget's returned URL. |
| `cart_lookup_failed` | Partner database query/schema/connection failed. Check deployed migrations and Supabase service configuration. |
| `cart_not_found` | Token does not identify a cart in this partner database. Check staging/production origin pairing and create a fresh cart. |
| `cart_not_live` | A test cart was sent to the live checkout endpoint. Test simulation and live checkout are separate. |
| `prepaid_cart` | This cart uses the direct prepaid API workflow, not customer checkout. |
| `partner_missing`, `partner_blocked`, `partner_not_approved` | The partner record is absent, blocked, or not approved. An administrator must review its state. |
| `cart_expiry_invalid`, `cart_expired`, `cart_not_open` | Expiry is invalid/past, or the cart is not open (for example validating or already converted). Poll validation or create a new cart as appropriate. |
| `artwork_lookup_failed`, `content_block_lookup_failed` | Database access failed while checking artwork/content blocks. |
| `content_blocked` | Artwork was blocked; do not bypass the content restriction. |
| `artwork_missing`, `artwork_not_ready` | No artwork exists, or an item is not stored with a storage path. Check validation/worker state. |
| `rights_acceptance_required` | A supplied checkout acceptance was invalid. The customer must confirm the current rights terms. |
| `acceptance_save_failed` | Saving the supplied acceptance failed. Check the database function and schema. |
| `checkout_response_failed` | Validation reached response construction but failed before returning the cart. Check application runtime logs and deployed code. |

## Deployment checks and limits

- Main: `PARTNER_PLATFORM_ORIGIN` points to the matching partner app's final HTTPS origin.
- Partner: `TCGPLAYTEST_CHECKOUT_ORIGIN` points back to the matching main-site origin.
- Both: `PARTNER_INTERNAL_SECRET` is the same server-only value; redeploy after environment changes. Do not print it while comparing settings.
- On an allowed embed response, expect `Content-Security-Policy: frame-ancestors <exact-parent-origin>`, no `X-Frame-Options`, and `Cache-Control: private, no-store`. A rejected embed returns HTTP 403 and `frame-ancestors 'none'`.
- This logging covers requests that reach this application. A CDN/WAF response before middleware, the partner site's own `frame-src` policy, or an additional disallowed ancestor in a nested frame can block the browser without producing an application rejection. Check Network/Console and hosting security logs if the response reference is absent or the application allowed the request. Keep checkout on the partner's top-level page rather than inside another framed editor.
- This source update cannot identify the earlier partner's exact failure without its request/logs, and does not verify hosted environment variables, applied database migrations or WAF rules.

The regression suite `scripts/widget-checkout-diagnostics.test.mjs` in the combined development workspace exercises real handlers with mocked database/network services. It checks distinct failure reasons, correlation, allowed-frame behavior and log redaction without placing orders or charging payments.

For the supplied October 20–21 error window, the partner repository also includes `docs/diagnose-live-checkout.sql`. Run its read-only sections in the partner Supabase SQL editor to inspect required columns, compare partners' test/live carts and view webhook delivery counts. Adjust timestamps for a new incident. `partner_webhook_events` records events/retry counts/delivery time, not each delivery attempt's HTTP response or the embed rejection reason; missing webhook activity does not by itself diagnose an iframe problem.
