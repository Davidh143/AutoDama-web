-- AutoDama: FINÁLNÍ ZAPNUTÍ SERVEROVÉHO MFA (AAL2)
-- ⚠ NEPOUŠTĚT NYNÍ: aktuálně žádný ze 2 účtů nemá ověřený MFA faktor.
-- Po spuštění tento skript znemožní přístup k firemním datům všem
-- relacím bez ověřeného Authenticatoru (AAL2), včetně starého HTML souboru.
-- Nejprve: záloha, ověřený nový klient, naskenování QR a ověřený AAL2 token;
-- po té společně transakci aplikovat a otestovat.
-- Vychází ze skutečného read-only auditu AutoDama 2026-11-06.

begin;

-- 1) Jediné místo řízení členství včetně kontrol MFA.
-- Všechny privilegované RPC mimo create_workspace již používají has_access().
create or replace function autodama_private.has_access(
  p_workspace uuid,
  p_roles text[] default array['owner','editor','viewer']
)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select
    auth.uid() is not null
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.autodama_members m
      where m.workspace_id = p_workspace
        and m.user_id = auth.uid()
        and m.role = any(p_roles)
    );
$function$;

-- 2) SECURITY DEFINER RPC pro založení nové firmy neprochází has_access;
-- musí proto ověřovat AAL2 samo.
create or replace function public.autodama_create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
begin
  if auth.uid() is null or (select auth.jwt()->>'aal') is distinct from 'aal2' then
    raise exception 'Před založením firmy ověřte Authenticator.' using errcode='42501';
  end if;
  if length(btrim(p_name)) not between 1 and 100 then
    raise exception 'Neplatný název firmy.' using errcode='22023';
  end if;
  insert into public.autodama_workspaces(name,owner_id)
  values(btrim(p_name),auth.uid()) returning id into v_id;
  insert into public.autodama_members(workspace_id,user_id,role)
  values(v_id,auth.uid(),'owner');
  insert into public.autodama_states(workspace_id,updated_by)
  values(v_id,auth.uid());
  return v_id;
end;
$function$;

-- 3) Restriktivní pravidla jsou defense in depth.
-- Původní pravidla zajišťující členství zůstávají beze změny.
create policy autodama_mfa_read_workspaces
on public.autodama_workspaces as restrictive for select to authenticated
using ((select auth.jwt()->>'aal') = 'aal2');

create policy autodama_mfa_read_members
on public.autodama_members as restrictive for select to authenticated
using ((select auth.jwt()->>'aal') = 'aal2');

create policy autodama_mfa_read_states
on public.autodama_states as restrictive for select to authenticated
using ((select auth.jwt()->>'aal') = 'aal2');

create policy autodama_mfa_read_history
on public.autodama_history as restrictive for select to authenticated
using ((select auth.jwt()->>'aal') = 'aal2');

-- 4) Storage ochrana pouze pro soukromý bucket AutoDama.
create policy autodama_mfa_storage_read
on storage.objects as restrictive for select to authenticated
using (
  bucket_id <> 'autodama-documents'
  or (select auth.jwt()->>'aal') = 'aal2'
);

create policy autodama_mfa_storage_insert
on storage.objects as restrictive for insert to authenticated
with check (
  bucket_id <> 'autodama-documents'
  or (select auth.jwt()->>'aal') = 'aal2'
);

commit;

-- Před aktivací se musí provést ověřený rollback plán,
-- otestovat čtecí a zapisovací požadavky AAL1 (zamítnuty)
-- a AAL2 vlastníka, editora a čtenáře (oprávnění zachována).
