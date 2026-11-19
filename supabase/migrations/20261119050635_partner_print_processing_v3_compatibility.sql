-- Deployed to production as migration 20261119050635.
-- The v3 worker must be accepted before it begins reserving print output.
-- Retain v1 compatibility for older workers and release rollbacks.
CREATE OR REPLACE FUNCTION public.partner_reserve_print_artwork(p_job uuid, p_lease uuid, p_hash text, p_version text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare j partner_validation_jobs; c partner_carts; path text;
begin
  select * into j from partner_validation_jobs where id=p_job;
  select * into c from partner_carts where id=j.cart_id for update;
  select * into j from partner_validation_jobs where id=p_job for update;
  if c.id is null or c.status<>'validating' or c.expires_at<=now() or j.state<>'running' or j.lease_token is distinct from p_lease or j.lease_until<=now() then return false; end if;
  if j.actual_sha256 is null or j.storage_path is null then raise exception 'Source not checked'; end if;
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or (p_version is null or p_version not in ('auto-bleed-2mm-v1', 'auto-bleed-2mm-v3')) then raise exception 'Invalid print metadata'; end if;
  if j.print_storage_path is not null and (j.print_sha256 is distinct from p_hash or j.print_version is distinct from p_version) then raise exception 'Reserved print output changed'; end if;
  path := 'carts/'||c.id||'/'||p_hash;
  update partner_validation_jobs set print_sha256=p_hash,print_storage_path=path,print_version=p_version where id=p_job;
  update partner_artwork set print_sha256=p_hash,print_storage_path=path,print_version=p_version where validation_job_id=p_job and state='pending';
  return true;
end $function$;
REVOKE ALL ON FUNCTION public.partner_reserve_print_artwork(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_reserve_print_artwork(uuid,uuid,text,text) TO service_role;
