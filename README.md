# Cardify Partner Platform

Standalone Cardify partnership app for applying, approving partners, and showing the TCGPlaytest print widget code.

## Setup

1. Create a separate Supabase project and enable Google auth.
2. Run `supabase/migrations/20260716_create_partnership_platform.sql`.
3. If the table already exists, also run `supabase/migrations/20260716_add_stripe_connect_to_partnerships.sql`.
4. Set `PARTNERSHIP_ADMIN_EMAILS` to the emails allowed to approve partners.
5. Configure Stripe Connect:
   - `STRIPE_SECRET_KEY`: the Stripe platform secret key used to create Express connected accounts.
   - `NEXT_PUBLIC_CARDIFY_APP_URL`: the deployed app URL, for example `https://cardify-partner-platform.vercel.app`.
6. Configure the widget origin:
   - `NEXT_PUBLIC_TCGPLAYTEST_WIDGET_ORIGIN`: for testing use `https://testing123-prof.vercel.app`; production can use the final TCGPlaytest domain.
7. Configure Gmail service-account env vars if approval/decline emails should send immediately:
   - `GMAIL_SERVICE_ACCOUNT_JSON`: the full service account JSON as a single env string.
   - `GMAIL_IMPERSONATED_EMAIL`: the Workspace mailbox the service account is allowed to send as.
   - `GMAIL_SENDER_EMAIL`: the address shown in the email From header.

The app also supports `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` as a fallback OAuth method.

Approved partners first complete Stripe Connect onboarding in `/dashboard`. Once Stripe reports the connected account is ready, the dashboard reveals the widget snippet and sends a one-time widget-ready email.

## Direct partner uploads

`POST /v1/uploads` lets a partner upload PNG/JPEG files directly into TCGPlaytest's existing private `partner-artwork` bucket, using only its partner API key. It returns a scoped 2-hour storage PUT URL and an 8-day image reference. After PUT succeeds, the partner uses that reference in the existing cart fields. URL-only integrations and checkout remain compatible.

Deployment requirements: the existing `PARTNER_INTERNAL_SECRET` (at least 32 characters), Supabase service credentials, and the private `partner-artwork` bucket configured with a 20 MiB size limit and only `image/png` / `image/jpeg` MIME types. Existing manufacturing migrations already configure that bucket; this addition needs no SQL migration. Do not make the bucket public or give partners its credentials.

The existing maintenance cron removes expired `partner-uploads/YYYY-MM-DD/` staging objects after 8 days, normally within the following day. Validated `carts/` files continue to use normal expiry, order retention and hold handling. Keep validation and maintenance workers scheduled and authenticated. Deploy the API before clients that call the new endpoint.

Run `node --test scripts/direct-uploads.test.mjs`, then `npm run build`. Public setup, schemas and examples are available at `/docs#uploads`, `/openapi.json` and `/llms.txt`.
