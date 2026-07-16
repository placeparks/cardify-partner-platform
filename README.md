# Cardify Partner Platform

Standalone Cardify partnership app for applying, approving partners, and showing the TCGPlaytest print widget code.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Create a separate Supabase project and enable Google auth.
3. Run `supabase/migrations/20260716_create_partnership_platform.sql`.
4. Set `PARTNERSHIP_ADMIN_EMAILS` to the emails allowed to approve partners.
5. Configure Gmail service-account env vars if approval/decline emails should send immediately:
   - `GMAIL_SERVICE_ACCOUNT_JSON`: the full service account JSON as a single env string.
   - `GMAIL_IMPERSONATED_EMAIL`: the Workspace mailbox the service account is allowed to send as.
   - `GMAIL_SENDER_EMAIL`: the address shown in the email From header.

The app also supports `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` as a fallback OAuth method.

Approved partners see the widget snippet in `/dashboard`, and the same snippet is included in the approval email.
