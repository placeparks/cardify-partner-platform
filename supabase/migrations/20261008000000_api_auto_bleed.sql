-- Apply BEFORE deploying API auto-bleed. Additive; existing orders keep their current files.
-- Source bytes retain their original hash; prepared bytes get their own hash/path.
begin;
alter table public.partner_validation_jobs
  add column if not exists print_sha256 text,
  add column if not exists print_storage_path text,
  add column if not exists print_version text;
alter table public.partner_artwork
  add column if not exists print_sha256 text,
  add column if not exists print_storage_path text,
  add column if not exists print_version text;
create index if not exists partner_artwork_print_storage_path on public.partner_artwork(print_storage_path);

-- Reserve the output before uploading, so interrupted workers leave discoverable files.
create or replace function public.partner_reserve_print_artwork(p_job uuid,p_lease uuid,p_hash text,p_version text) returns boolean
language plpgsql security definer set search_path=public as $$
declare j partner_validation_jobs; c partner_carts; path text;
begin
  select * into j from partner_validation_jobs where id=p_job;
  select * into c from partner_carts where id=j.cart_id for update;
  select * into j from partner_validation_jobs where id=p_job for update;
  if c.id is null or c.status<>'validating' or c.expires_at<=now() or j.state<>'running' or j.lease_token is distinct from p_lease or j.lease_until<=now() then return false; end if;
  if j.actual_sha256 is null or j.storage_path is null then raise exception 'Source not checked'; end if;
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_version is distinct from 'auto-bleed-2mm-v1' then raise exception 'Invalid print metadata'; end if;
  if j.print_storage_path is not null and (j.print_sha256 is distinct from p_hash or j.print_version is distinct from p_version) then raise exception 'Reserved print output changed'; end if;
  path := 'carts/'||c.id||'/'||p_hash;
  update partner_validation_jobs set print_sha256=p_hash,print_storage_path=path,print_version=p_version where id=p_job;
  update partner_artwork set print_sha256=p_hash,print_storage_path=path,print_version=p_version where validation_job_id=p_job and state='pending';
  return true;
end $$;
revoke all on function public.partner_reserve_print_artwork(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.partner_reserve_print_artwork(uuid,uuid,text,text) to service_role;

create or replace function public.partner_finish_validation(p_job uuid,p_lease uuid,p_error text default null) returns boolean
language plpgsql security definer set search_path=public as $$
declare j partner_validation_jobs; c partner_carts; a partner_artwork; failure text; errors jsonb;
begin
  select * into j from partner_validation_jobs where id=p_job;
  select * into c from partner_carts where id=j.cart_id for update;
  select * into j from partner_validation_jobs where id=p_job for update;
  if c.status<>'validating' or c.expires_at<=now() or j.state<>'running' or j.lease_token is distinct from p_lease or j.lease_until<=now() then return false; end if;
  for a in select * from partner_artwork where validation_job_id=p_job order by item_index,side loop
    failure := p_error;
    if failure is null and (j.actual_sha256 is null or j.storage_path is null) then raise exception 'File not checked'; end if;
    if failure is null and j.print_version is not null and (j.print_sha256 is null or j.print_storage_path is null) then raise exception 'Print artwork not prepared'; end if;
    if failure is null and a.expected_sha256 is not null and a.expected_sha256<>j.actual_sha256 then failure:='image_hash_mismatch'; end if;
    if failure is null and exists(select 1 from partner_content_blocks where sha256 in (a.expected_sha256,j.actual_sha256,j.print_sha256)) then failure:='content_blocked'; end if;
    update partner_artwork set state=case when failure is null then 'stored' else 'failed' end,
      last_error=failure,actual_sha256=j.actual_sha256,processed_at=case when failure is null and j.print_version is not null then now() else null end,received_at=case when failure is null then now() else null end,
      source_url=null where id=a.id;
  end loop;
  update partner_validation_jobs set state='done',completed_at=now(),source_url=null,lease_until=null where id=p_job;
  select coalesce(jsonb_agg(jsonb_build_object('item_index',item_index,'side',side,'code',last_error,'message',
    case last_error
    when 'image_unreachable' then 'Image could not be downloaded.'
    when 'image_url_unsafe' then 'Image URL must resolve to a public HTTPS address.'
    when 'image_redirect_limit' then 'Image URL exceeded three redirects.'
    when 'image_timeout' then 'Image download timed out.'
    when 'image_too_large' then 'Image exceeds 20 MiB.'
    when 'image_invalid' then 'Image must be a valid single-frame PNG or JPEG.'
    when 'image_dimensions_invalid' then 'Image is smaller than the required dimensions.'
    when 'image_pixels_exceeded' then 'Image exceeds 40 megapixels.'
    when 'image_hash_mismatch' then 'Image bytes do not match the supplied SHA-256.'
    when 'content_blocked' then 'This artwork cannot be accepted.'
    else 'Validation could not complete. Create a new cart or contact support.' end) order by item_index,side),'[]')
    into errors from partner_artwork where cart_id=c.id and last_error is not null;
  update partner_carts set validation_done=(select count(*) from partner_validation_jobs where cart_id=c.id and state='done'),validation_errors=errors where id=c.id;
  if not exists(select 1 from partner_validation_jobs where cart_id=c.id and state<>'done') then
    update partner_carts set status=case when jsonb_array_length(errors)>0 then 'failed' else 'open' end where id=c.id;
    if jsonb_array_length(errors)>0 then update partner_artwork set delete_after=now() where cart_id=c.id; end if;
  end if;
  return true;
end $$;

create or replace function public.partner_enforce(p_target text,p_id text,p_reason text,p_actor text) returns void language plpgsql security definer set search_path=public as $$
begin
  if length(trim(p_reason)) < 3 then raise exception 'Reason required'; end if;
  if p_target='partner' then
    update partnership_requests set api_blocked_at=now(),api_block_reason=p_reason where id=p_id::uuid;
    update partner_api_keys set revoked_at=now() where partner_id=p_id::uuid and revoked_at is null;
    update partner_carts set status='blocked' where partner_id=p_id::uuid and status in ('validating','open','converted');
    update partner_manufacturing_orders set status='blocked',updated_at=now() where partner_id=p_id::uuid and status in ('paid','in_production');
    update partner_artwork set state='blocked',delete_after=now()+interval '30 days' where cart_id in(select id from partner_carts where partner_id=p_id::uuid) and state not in ('deleted','deleting');
  elsif p_target='key' then
    update partner_api_keys set revoked_at=now() where id=p_id::uuid;
  elsif p_target='cart' then
    update partner_carts set status='blocked' where id=p_id;
    update partner_manufacturing_orders set status='blocked',updated_at=now() where cart_id=p_id and status in ('paid','in_production');
    update partner_artwork set state='blocked',delete_after=now()+interval '30 days' where cart_id=p_id and state not in ('deleted','deleting');
  elsif p_target='sha256' then
    insert into partner_content_blocks(sha256,reason,created_by) values(p_id,p_reason,p_actor) on conflict(sha256) do nothing;
    update partner_artwork set state='blocked',delete_after=now()+interval '30 days' where (expected_sha256=p_id or actual_sha256=p_id or print_sha256=p_id) and state not in ('deleted','deleting');
    update partner_carts set status='blocked' where id in (select cart_id from partner_artwork where state='blocked') and status in ('validating','open','converted');
    update partner_manufacturing_orders set status='blocked',updated_at=now() where cart_id in (select cart_id from partner_artwork where state='blocked') and status in ('paid','in_production');
  else raise exception 'Unsupported target'; end if;
  update partner_validation_jobs set source_url=null where cart_id in(select id from partner_carts where status='blocked');
  insert into partner_audit_events(entity_type,entity_id,action,actor,details) values(p_target,p_id,'blocked',p_actor,jsonb_build_object('reason',p_reason));
end $$;

-- Source and print files share cart-scoped retention. A hold on any artwork keeps
-- the whole cart's files, including any source/print objects shared by its items.
create or replace function public.partner_claim_cleanup() returns setof partner_artwork
language sql security definer set search_path=public as $$
  with candidates as (
    select a.id from partner_artwork a join partner_carts c on c.id=a.cart_id
    where a.delete_after<=now() and a.deleted_at is null and not a.legal_hold
      and c.status in ('expired','failed','cancelled','blocked','converted')
      and not exists(select 1 from partner_validation_jobs j where j.cart_id=a.cart_id and j.lease_until>now())
      and not exists(select 1 from partner_artwork other where other.cart_id=a.cart_id and other.deleted_at is null
        and (other.legal_hold or other.delete_after is null or other.delete_after>now()))
    order by a.delete_after limit 50 for update of a skip locked
  )
  update partner_artwork set state='deleting' where id in(select id from candidates) returning *;
$$;
commit;
