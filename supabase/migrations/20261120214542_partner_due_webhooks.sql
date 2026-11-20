-- Read-only queue selection. Missing receivers keep their events and retry
-- budgets; configuring the matching mode makes them eligible automatically.
create or replace function public.partner_due_webhooks(p_limit integer default 10)
returns table (
  id text, partner_id uuid, mode text, payload jsonb, attempts integer,
  next_attempt_at timestamptz, url text, secret_ciphertext text
)
language sql stable security invoker
set search_path = ''
as $$
  select e.id, e.partner_id, e.mode, e.payload, e.attempts,
         e.next_attempt_at, s.url, s.secret_ciphertext
  from public.partner_webhook_events e
  join public.partner_webhook_settings s
    on s.partner_id = e.partner_id and s.mode = e.mode
  where e.delivered_at is null and e.attempts < 12
    and e.next_attempt_at <= now()
  order by e.next_attempt_at, e.id
  limit greatest(0, least(coalesce(p_limit, 10), 10));
$$;
revoke all on function public.partner_due_webhooks(integer) from public, anon, authenticated;
grant execute on function public.partner_due_webhooks(integer) to service_role;
