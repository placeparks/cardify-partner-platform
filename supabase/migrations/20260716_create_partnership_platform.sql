create extension if not exists "pgcrypto";

create table if not exists public.partnership_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  business_name text not null,
  website_url text not null,
  audience text,
  proposed_percentage numeric(5,2) not null default 2 check (proposed_percentage >= 0 and proposed_percentage <= 30),
  approved_percentage numeric(5,2) check (approved_percentage >= 0 and approved_percentage <= 30),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  widget_partner_key text unique,
  admin_notes text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_affiliate_orders (
  id uuid primary key default gen_random_uuid(),
  partner_request_id uuid not null references public.partnership_requests(id) on delete cascade,
  partner_key text not null,
  tcgplaytest_order_id text,
  stripe_payment_intent_id text,
  retail_total_cents integer not null default 0,
  partner_share_cents integer not null default 0,
  status text not null default 'pending',
  customer_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_partnership_requests_status on public.partnership_requests(status);
create index if not exists idx_partner_affiliate_orders_partner_request_id on public.partner_affiliate_orders(partner_request_id);
create index if not exists idx_partner_affiliate_orders_partner_key on public.partner_affiliate_orders(partner_key);

alter table public.partnership_requests enable row level security;
alter table public.partner_affiliate_orders enable row level security;

drop policy if exists "Partners can read own request" on public.partnership_requests;
create policy "Partners can read own request"
  on public.partnership_requests for select
  using (auth.uid() = user_id);

drop policy if exists "Partners can insert own request" on public.partnership_requests;
create policy "Partners can insert own request"
  on public.partnership_requests for insert
  with check (auth.uid() = user_id);

drop policy if exists "Partners can update own pending request" on public.partnership_requests;
create policy "Partners can update own pending request"
  on public.partnership_requests for update
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id);

drop policy if exists "Partners can read own affiliate orders" on public.partner_affiliate_orders;
create policy "Partners can read own affiliate orders"
  on public.partner_affiliate_orders for select
  using (
    exists (
      select 1 from public.partnership_requests pr
      where pr.id = partner_affiliate_orders.partner_request_id
      and pr.user_id = auth.uid()
    )
  );

-- Admin APIs use SUPABASE_SERVICE_KEY, which bypasses RLS for approval and reporting.
