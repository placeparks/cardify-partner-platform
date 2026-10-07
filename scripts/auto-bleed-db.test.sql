-- Run ONLY in an empty disposable PostgreSQL database, using psql -v ON_ERROR_STOP=1.
-- Minimal copies of the existing tables exercise the actual migration/functions.
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table partnership_requests(id uuid primary key,status text,api_blocked_at timestamptz,api_block_reason text);
create table partner_api_keys(partner_id uuid,revoked_at timestamptz);
create table partner_carts(id text primary key,partner_id uuid,status text,expires_at timestamptz,validation_done integer default 0,validation_total integer default 1,validation_errors jsonb default '[]');
create table partner_validation_jobs(id uuid primary key,cart_id text,state text,lease_token uuid,lease_until timestamptz,actual_sha256 text,storage_path text,content_type text,source_url text,completed_at timestamptz);
create table partner_artwork(id uuid primary key,cart_id text,item_index integer,side text,quantity integer,state text,expected_sha256 text,actual_sha256 text,storage_path text,source_url text,last_error text,received_at timestamptz,processed_at timestamptz,deleted_at timestamptz,delete_after timestamptz,legal_hold boolean default false,validation_job_id uuid);
create table partner_content_blocks(sha256 text primary key,reason text,created_by text);
create table partner_manufacturing_orders(id text,cart_id text,partner_id uuid,status text,updated_at timestamptz);
create table partner_audit_events(entity_type text,entity_id text,action text,actor text,details jsonb);
\ir ../supabase/migrations/20261008000000_api_auto_bleed.sql

do $$
declare pid uuid:=gen_random_uuid(); jid uuid:=gen_random_uuid(); lease uuid:=gen_random_uuid(); aid uuid:=gen_random_uuid(); claimed integer;
begin
  insert into partnership_requests values(pid,'approved',null,null);
  insert into partner_carts(id,partner_id,status,expires_at) values('cart1',pid,'validating',now()+interval '1 day');
  insert into partner_validation_jobs(id,cart_id,state,lease_token,lease_until,actual_sha256,storage_path)
    values(jid,'cart1','running',lease,now()+interval '2 minutes',repeat('a',64),'carts/cart1/'||repeat('a',64));
  insert into partner_artwork(id,cart_id,item_index,side,quantity,state,expected_sha256,actual_sha256,storage_path,validation_job_id,delete_after)
    values(aid,'cart1',0,'front',1,'pending',repeat('a',64),repeat('a',64),'carts/cart1/'||repeat('a',64),jid,now()-interval '1 day');
  if partner_reserve_print_artwork(jid,gen_random_uuid(),repeat('b',64),'auto-bleed-2mm-v1') then raise exception 'Wrong lease was accepted'; end if;
  if not partner_reserve_print_artwork(jid,lease,repeat('b',64),'auto-bleed-2mm-v1') then raise exception 'Valid reservation failed'; end if;
  if not partner_finish_validation(jid,lease,null) then raise exception 'Completion failed'; end if;
  if not exists(select 1 from partner_carts where id='cart1' and status='open') then raise exception 'Prepared cart did not open'; end if;
  if not exists(select 1 from partner_artwork where id=aid and actual_sha256=repeat('a',64) and print_sha256=repeat('b',64) and print_storage_path='carts/cart1/'||repeat('b',64) and processed_at is not null) then raise exception 'Source/print metadata incorrect'; end if;

  -- Output hash notices must block the order just like original hash notices.
  insert into partner_manufacturing_orders(id,cart_id,partner_id,status) values('order1','cart1',pid,'paid');
  perform partner_enforce('sha256',repeat('b',64),'test notice','test');
  if not exists(select 1 from partner_manufacturing_orders where id='order1' and status='blocked') then raise exception 'Prepared hash did not block production'; end if;

  -- Any hold retains both originals and outputs throughout the cart.
  update partner_carts set status='converted' where id='cart1';
  update partner_artwork set legal_hold=true,delete_after=now()-interval '1 day' where id=aid;
  select count(*) into claimed from partner_claim_cleanup();
  if claimed<>0 then raise exception 'Legal hold was ignored'; end if;
  update partner_artwork set legal_hold=false where id=aid;
  select count(*) into claimed from partner_claim_cleanup();
  if claimed<>1 then raise exception 'Expired artwork was not claimed'; end if;

  -- Client SHA comparisons continue to use the original, not the processed hash.
  delete from partner_content_blocks;
  update partner_carts set status='validating',validation_errors='[]' where id='cart1';
  update partner_validation_jobs set state='running',lease_until=now()+interval '2 minutes' where id=jid;
  update partner_artwork set state='pending',expected_sha256=repeat('c',64),last_error=null where id=aid;
  perform partner_finish_validation(jid,lease,null);
  if not exists(select 1 from partner_artwork where id=aid and last_error='image_hash_mismatch') then raise exception 'Wrong input SHA was accepted'; end if;
  if not exists(select 1 from partner_carts where id='cart1' and status='failed') then raise exception 'Bad input hash did not fail the cart'; end if;
  if has_function_privilege('anon','partner_reserve_print_artwork(uuid,uuid,text,text)','execute') then raise exception 'Anonymous access allowed'; end if;
  raise notice 'PASS: reservation, lease safety, source hash validation, prepared hash enforcement, and held/expired cleanup';
end $$;
