-- READ ONLY. Run in the PARTNER platform Supabase SQL editor, not commerce.
-- Run one numbered section at a time. No tokens, API keys, webhook secrets,
-- checkout URLs, artwork URLs or customer addresses are returned.
-- These checks show current state, not necessarily the state at a past failure.

-- 1. Are the columns selected by live checkout present?
-- Any MISSING row can explain "Database operation failed" in this endpoint.
with expected(table_name, column_name) as (values
  ('partner_carts','checkout_token_hash'),
  ('partnership_requests','status'),
  ('partnership_requests','api_blocked_at'),
  ('partnership_requests','checkout_branding'),
  ('partnership_requests','website_url'),
  ('partnership_requests','widget_allowed_origins'),
  ('partner_artwork','cart_id'),
  ('partner_artwork','item_index'),
  ('partner_artwork','side'),
  ('partner_artwork','quantity'),
  ('partner_artwork','state'),
  ('partner_artwork','expected_sha256'),
  ('partner_artwork','actual_sha256'),
  ('partner_artwork','storage_path'),
  ('partner_artwork','print_sha256'),
  ('partner_content_blocks','sha256')
)
select e.table_name, e.column_name,
       case when c.column_name is null then 'MISSING' else 'present' end as schema_check
from expected e
left join information_schema.columns c
  on c.table_schema='public' and c.table_name=e.table_name and c.column_name=e.column_name
order by schema_check, e.table_name, e.column_name;

-- 2. Identify partners and compare their test/live carts in the supplied log window.
-- Adjust the two explicit UTC timestamps if reproducing at a different time.
select p.id as partner_id, p.business_name, p.website_url, p.status as partner_status,
       to_jsonb(p)->'widget_allowed_origins' as widget_allowed_origins,
       to_jsonb(p)->>'api_blocked_at' as partner_blocked_at,
       count(c.id) filter (where c.mode='test') as test_carts,
       count(c.id) filter (where c.mode='live') as live_carts,
       count(c.id) filter (where c.mode='live' and c.status='open') as live_open,
       count(c.id) filter (where c.mode='live' and c.status='converted') as live_converted,
       max(c.created_at) as latest_cart_created_at
from public.partnership_requests p
left join public.partner_carts c on c.partner_id=p.id
  and c.created_at >= timestamptz '2026-10-20 18:50:00+00'
  and c.created_at < timestamptz '2026-10-21 06:52:00+00'
group by p.id
order by latest_cart_created_at desc nulls last;

-- 3. Inspect recent live carts and stored artwork for those partners.
-- Shows state only: do not paste complete partner_carts/artwork rows.
select c.id as cart_id, p.business_name, c.partner_id, c.created_at,
       c.status, c.expires_at, c.expires_at <= now() as expired_now,
       c.card_count, c.order_id, to_jsonb(c)->>'settlement' as settlement,
       count(a.id) as artwork_files,
       count(a.id) filter (where a.state='stored' and a.storage_path is not null) as stored_files,
       count(a.id) filter (where a.state='blocked') as blocked_files,
       array_agg(distinct a.state) filter (where a.id is not null) as artwork_states
from public.partner_carts c
join public.partnership_requests p on p.id=c.partner_id
left join public.partner_artwork a on a.cart_id=c.id
where c.mode='live'
  and c.created_at >= timestamptz '2026-10-20 18:50:00+00'
  and c.created_at < timestamptz '2026-10-21 06:52:00+00'
group by c.id,p.business_name
order by c.created_at desc
limit 100;

-- 4. Webhook activity. Undelivered alone does not prove a failed attempt:
-- no configured webhook, a pending queue or an unavailable worker can cause it.
-- Current code does not store each attempt's HTTP response/error explanation.
select e.id as event_id, p.business_name, e.partner_id, e.mode,
       e.event_type, e.created_at, e.attempts, e.delivered_at, e.next_attempt_at,
       exists(select 1 from public.partner_webhook_settings s
              where s.partner_id=e.partner_id and s.mode=e.mode) as webhook_configured
from public.partner_webhook_events e
join public.partnership_requests p on p.id=e.partner_id
where e.created_at >= timestamptz '2026-10-20 18:50:00+00'
  and e.created_at < timestamptz '2026-10-21 06:52:00+00'
order by e.created_at desc
limit 100;

-- A test cart validates artwork and uses the checkout simulator on the partner app.
-- Live embed validation additionally reads the joined partner fields and
-- artwork/content-block columns in section 1. Passing test mode therefore
-- does not demonstrate that this live-only query works.
-- If schema is complete and carts look valid, reproduce after deploying
-- diagnostics and match request_id in BOTH Vercel projects, using all log levels.
-- SQL editor success does not by itself verify PostgREST schema cache,
-- the application service-role credentials, or hosting/network availability.
