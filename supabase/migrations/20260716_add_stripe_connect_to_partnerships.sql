alter table public.partnership_requests
  add column if not exists stripe_account_id text,
  add column if not exists stripe_onboarding_complete boolean not null default false,
  add column if not exists widget_email_sent_at timestamptz;

create index if not exists idx_partnership_requests_stripe_account_id
  on public.partnership_requests(stripe_account_id);
