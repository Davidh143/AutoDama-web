
-- Optional strict per-workspace MFA: cannot be enabled until every current member verified TOTP.
-- New members must complete the browser TOTP enrollment before accessing company data.
alter table public.autodama_workspaces
 add column if not exists require_mfa boolean not null default false;

create or replace function autodama_private.has_access(
  p_workspace uuid,p_roles text[] default array['owner','editor','viewer']
)
returns boolean language sql stable security definer set search_path to ''
as $strict$
 select auth.uid() is not null
   and autodama_private.mfa_ready_for_session()
   and exists (
    select 1 from public.autodama_members m
    join public.autodama_workspaces w on w.id=m.workspace_id
    where m.workspace_id=p_workspace and m.user_id=auth.uid()
      and m.role=any(p_roles)
      and (not w.require_mfa or (auth.jwt()->>'aal')='aal2')
   );
$strict$;

create or replace function public.autodama_mfa_status(p_workspace uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $status$
declare
 result jsonb;
begin
 if not autodama_private.has_access(p_workspace,array['owner']) then
   raise exception 'Stav MFA může zobrazit pouze vlastník.' using errcode='42501';
 end if;
 select jsonb_build_object(
   'enabled',w.require_mfa,
   'members',count(m.user_id),
   'verified',count(m.user_id) filter(where exists(
     select 1 from auth.mfa_factors f
     where f.user_id=m.user_id and f.status='verified' and f.factor_type='totp'
   ))
 ) into result
 from public.autodama_workspaces w
 left join public.autodama_members m on m.workspace_id=w.id
 where w.id=p_workspace
 group by w.id,w.require_mfa;
 return result;
end;
$status$;

create or replace function public.autodama_enable_mfa(p_workspace uuid)
returns boolean language plpgsql security definer set search_path to ''
as $enable$
begin
 if (auth.jwt()->>'aal') is distinct from 'aal2'
   or not autodama_private.has_access(p_workspace,array['owner']) then
   raise exception 'Povinné MFA může zapnout pouze vlastník s ověřeným Authenticatorem.' using errcode='42501';
 end if;
 if exists(select 1 from public.autodama_members m where m.workspace_id=p_workspace
   and not exists (
     select 1 from auth.mfa_factors f
     where f.user_id=m.user_id and f.status='verified' and f.factor_type='totp'
   )) then
   raise exception 'Nejdříve musí Authenticator nastavit všichni současní členové firmy.' using errcode='22023';
 end if;
 update public.autodama_workspaces set require_mfa=true where id=p_workspace;
 if not found then raise exception 'Firma neexistuje.' using errcode='22023'; end if;
 return true;
end;
$enable$;

revoke all on function public.autodama_mfa_status(uuid) from public,anon;
revoke all on function public.autodama_enable_mfa(uuid) from public,anon;
grant execute on function public.autodama_mfa_status(uuid) to authenticated;
grant execute on function public.autodama_enable_mfa(uuid) to authenticated;
