
-- AutoDama private owner withdrawals, planned owner drawing and investor cash totals
-- Requires existing owner_private table. Apply only when the matching client is ready.
begin;

do $guard$
begin
  if exists(
     select 1 from public.autodama_states s,
       lateral jsonb_array_elements(coalesce(s.data->'transactions','[]'::jsonb)) t
     where t->>'type'='withdrawal'
  ) or exists(
     select 1 from public.autodama_history h,
       lateral jsonb_array_elements(coalesce(h.data->'transactions','[]'::jsonb)) t
     where t->>'type'='withdrawal'
  ) then
     raise exception 'Existují historické osobní výběry. Migraci zastavte a bezpečně je nejprve oddělte.';
  end if;
end;
$guard$;

alter table public.autodama_owner_private
 add column if not exists private_revision bigint not null default 0;

-- Existing plannedWithdrawal is already backed up in the owner-only profile.
-- Make it a constant non-sensitive placeholder in shared current and history.
update public.autodama_states s
 set data=jsonb_set(s.data,'{settings,plannedWithdrawal}','0'::jsonb,true)
 where s.data is not null;
update public.autodama_history h
 set data=jsonb_set(h.data,'{settings,plannedWithdrawal}','0'::jsonb,true)
 where h.data is not null;

CREATE OR REPLACE FUNCTION public.autodama_save_state(p_workspace uuid, p_expected_revision bigint, p_data jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_old public.autodama_states%ROWTYPE; v_revision bigint; v_document jsonb; v_key text;
BEGIN
 IF NOT autodama_private.has_access(p_workspace,ARRAY['owner','editor']) THEN
  RAISE EXCEPTION 'Nemáte oprávnění k úpravám této evidence.' USING ERRCODE='42501';
 END IF;
 -- Personal withdrawals are never accepted in the shared JSON snapshot.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(
   CASE WHEN jsonb_typeof(p_data->'transactions')='array' THEN p_data->'transactions' ELSE '[]'::jsonb END) t
   WHERE t->>'type'='withdrawal') THEN
   RAISE EXCEPTION 'Osobní výběry uložte v aktualizované AutoDama. Do společné evidence nepatří.' USING ERRCODE='42501';
 END IF;
 -- Keep a non-sensitive placeholder for compatibility with older clients.
 p_data:=jsonb_set(p_data,'{settings,plannedWithdrawal}','0'::jsonb,true);
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR p_data->>'version' IS DISTINCT FROM '2'
    OR jsonb_typeof(p_data->'meta') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_data->'settings') IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Neplatný formát evidence.' USING ERRCODE='22023';
 END IF;
 IF octet_length(p_data::text)>10485760 THEN RAISE EXCEPTION 'Evidence bez příloh přesahuje 10 MB.' USING ERRCODE='22023'; END IF;
 FOREACH v_key IN ARRAY ARRAY['vehicles','costs','accounts','transactions','vatPeriods','obligations','policies','documents'] LOOP
  IF jsonb_typeof(p_data->v_key) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Chybí pole %.',v_key USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_data->v_key) x WHERE jsonb_typeof(x)<>'object' OR jsonb_typeof(x->'id') IS DISTINCT FROM 'string' OR length(x->>'id') NOT BETWEEN 1 AND 200)
     OR (SELECT count(*) FROM jsonb_array_elements(p_data->v_key))<>(SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_data->v_key) x) THEN
   RAISE EXCEPTION 'Neplatné nebo duplicitní ID v poli %.',v_key USING ERRCODE='22023';
  END IF;
 END LOOP;
 FOR v_document IN SELECT value FROM jsonb_array_elements(p_data->'documents') LOOP
  IF v_document ? 'data'
   OR jsonb_typeof(v_document->'storagePath') IS DISTINCT FROM 'string'
   OR v_document->>'storagePath' !~ ('^'||p_workspace::text||'/[0-9a-f]{64}/[a-zA-Z0-9_-]+\.(pdf|jpg|png)$')
   OR v_document->>'sha256' IS NULL OR v_document->>'sha256' !~ '^[0-9a-f]{64}$'
   OR split_part(v_document->>'storagePath','/',2)<>v_document->>'sha256' THEN
   RAISE EXCEPTION 'Neplatná nebo cizí příloha.' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='autodama-documents' AND o.name=v_document->>'storagePath') THEN
   RAISE EXCEPTION 'Příloha nebyla bezpečně nahrána.' USING ERRCODE='22023';
  END IF;
 END LOOP;
 SELECT * INTO v_old FROM public.autodama_states WHERE workspace_id=p_workspace FOR UPDATE;
 IF NOT FOUND OR p_expected_revision IS NULL OR p_expected_revision<>v_old.revision THEN
  RAISE EXCEPTION 'Evidenci mezitím změnil kolega. Načtěte aktuální verzi a změnu zopakujte.' USING ERRCODE='40001';
 END IF;
 v_revision=v_old.revision+1;
 IF v_old.data IS NOT NULL THEN
  INSERT INTO public.autodama_history(workspace_id,revision,data,saved_by)
  VALUES(p_workspace,v_old.revision,v_old.data,v_old.updated_by);
 END IF;
 UPDATE public.autodama_states SET revision=v_revision,
  data=jsonb_set(p_data,'{meta,revision}',to_jsonb(v_revision),true),updated_at=now(),updated_by=auth.uid()
 WHERE workspace_id=p_workspace;
 DELETE FROM public.autodama_history WHERE workspace_id=p_workspace AND revision NOT IN
  (SELECT revision FROM public.autodama_history WHERE workspace_id=p_workspace ORDER BY revision DESC LIMIT 20);
 RETURN v_revision;
END;
$function$;


-- Only the owner can submit a state containing private withdrawals.
-- The two writes happen atomically in one PostgreSQL transaction.
create or replace function public.autodama_save_state_private(
 p_workspace uuid,
 p_expected_revision bigint,
 p_data jsonb,
 p_private_revision bigint
)
returns bigint language plpgsql security definer set search_path to ''
as $private$
declare
 v_owner uuid;
 v_saved_revision bigint;
 v_profile_revision bigint;
 v_personal jsonb;
 v_public_transactions jsonb;
 v_public_data jsonb;
 v_planned numeric;
begin
 if not autodama_private.has_access(p_workspace,array['owner']) then
  raise exception 'Osobní výběry může upravovat pouze vlastník.' using errcode='42501';
 end if;
 select w.owner_id into v_owner from public.autodama_workspaces w where w.id=p_workspace;
 if v_owner is distinct from auth.uid() then
  raise exception 'Není účet vlastníka.' using errcode='42501';
 end if;
 select p.private_revision into v_profile_revision from public.autodama_owner_private p
 where p.workspace_id=p_workspace and p.owner_id=auth.uid() for update;
 if not found or p_private_revision is distinct from v_profile_revision then
  raise exception 'Soukromé údaje byly mezitím aktualizované. Načtěte je znovu.' using errcode='40001';
 end if;
 if jsonb_typeof(p_data->'transactions') is distinct from 'array'
    or jsonb_typeof(p_data->'settings') is distinct from 'object' then
  raise exception 'Chybí transakce nebo nastavení.' using errcode='22023';
 end if;
 v_personal:=coalesce((
    select jsonb_agg(t) from jsonb_array_elements(p_data->'transactions') t
    where t->>'type'='withdrawal'),'[]'::jsonb);
 v_public_transactions:=coalesce((
    select jsonb_agg(t) from jsonb_array_elements(p_data->'transactions') t
    where t->>'type' is distinct from 'withdrawal'),'[]'::jsonb);

 if exists (
  select 1 from jsonb_array_elements(v_personal) t
  where jsonb_typeof(t->'id') is distinct from 'string'
     or jsonb_typeof(t->'amount') is distinct from 'number'
     or jsonb_typeof(t->'date') is distinct from 'string'
     or jsonb_typeof(t->'accountId') is distinct from 'string'
     or coalesce((t->>'amount')::numeric,0) <=0
     or (t->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
 ) then raise exception 'Neplatná soukromá transakce.' using errcode='22023'; end if;
 if exists(
  select 1 from jsonb_array_elements(coalesce(p_data->'documents','[]'::jsonb)) d
  join jsonb_array_elements(v_personal) t on d->>'targetType'='transaction' and d->>'targetId'=t->>'id'
 ) then raise exception 'Doklady osobních výběrů nelze uložit mezi společné přílohy.' using errcode='22023'; end if;

 v_planned:=coalesce((p_data->'settings'->>'plannedWithdrawal')::numeric,0);
 if v_planned<0 or v_planned>100000000 then
  raise exception 'Neplatný plán osobních výběrů.' using errcode='22023';
 end if;
 v_public_data:=jsonb_set(p_data,'{transactions}',v_public_transactions,true);
 v_saved_revision:=public.autodama_save_state(p_workspace,p_expected_revision,v_public_data);
 update public.autodama_owner_private
 set withdrawals=v_personal,planned_withdrawal=v_planned,private_revision=private_revision+1,updated_at=now()
 where workspace_id=p_workspace and owner_id=auth.uid();
 return v_saved_revision;
end;
$private$;

revoke all on function public.autodama_save_state_private(uuid,bigint,jsonb,bigint) from public, anon;
grant execute on function public.autodama_save_state_private(uuid,bigint,jsonb,bigint) to authenticated;

-- Calculates the *current* complete balances on the server without ever returning
-- private transaction dates, counts or individual amounts to the investor.
-- It is NOT an historical time series to prevent querying totals by arbitrary dates.
create or replace function public.autodama_current_balances(p_workspace uuid)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $balances$
declare
 v_data jsonb;
 v_private jsonb;
 v_account jsonb;
 v_transaction jsonb;
 v_today date := (now() at time zone 'Europe/Prague')::date;
 v_opening date;
 v_account_id text;
 v_amount numeric;
 v_balance numeric;
 v_current jsonb := '{}'::jsonb;
 v_type text;
 v_test boolean;
begin
 if not autodama_private.has_access(p_workspace,array['owner','editor','viewer']) then
   raise exception 'Nemáte oprávnění k bilanci.' using errcode='42501';
 end if;
 select s.data,p.withdrawals into v_data,v_private
 from public.autodama_states s
 left join public.autodama_owner_private p on p.workspace_id=s.workspace_id
 where s.workspace_id=p_workspace;
 if v_data is null then return '{}'::jsonb; end if;

 for v_account in select value from jsonb_array_elements(coalesce(v_data->'accounts','[]'::jsonb)) loop
  v_account_id:=v_account->>'id';
  v_opening:=(v_account->>'openingDate')::date;
  v_balance:=case when v_opening<=v_today then coalesce((v_account->>'opening')::numeric,0) else 0 end;
  for v_transaction in select value from jsonb_array_elements(coalesce(v_data->'transactions','[]'::jsonb)) loop
    if (v_transaction->>'date')::date<v_opening or (v_transaction->>'date')::date>v_today then continue; end if;
    v_test:=coalesce((v_transaction->>'test')::boolean,false)
      or exists(select 1 from jsonb_array_elements(coalesce(v_data->'vehicles','[]'::jsonb)) x
            where x->>'id'=v_transaction->>'vehicleId' and x->>'test'='true');
    if v_test then continue; end if;
    v_type:=v_transaction->>'type';
    v_amount:=coalesce((v_transaction->>'amount')::numeric,0);
    if v_type='transfer' then
      if v_transaction->>'accountId'=v_account_id then v_balance:=v_balance-v_amount; end if;
      if v_transaction->>'toAccountId'=v_account_id then
        v_balance:=v_balance+coalesce((v_transaction->>'receivedAmount')::numeric,0);
      end if;
    elsif v_transaction->>'accountId'=v_account_id then
      if v_type='other' then
        v_balance:=v_balance+(case when v_transaction->>'direction'='in' then v_amount else -v_amount end);
      elsif v_type=any(array['sale','vatRefund','deposit','loanIn','insuranceRefund']) then
        v_balance:=v_balance+v_amount;
      else
        v_balance:=v_balance-v_amount;
      end if;
    end if;
  end loop;
  for v_transaction in select value from jsonb_array_elements(coalesce(v_private,'[]'::jsonb)) loop
    if v_transaction->>'accountId'=v_account_id
       and (v_transaction->>'date')::date between v_opening and v_today
       and coalesce((v_transaction->>'test')::boolean,false)=false then
      v_balance:=v_balance-coalesce((v_transaction->>'amount')::numeric,0);
    end if;
  end loop;
  v_current:=jsonb_set(v_current,array[v_account_id],to_jsonb(round(v_balance,2)),true);
 end loop;
 return v_current;
end;
$balances$;
revoke all on function public.autodama_current_balances(uuid) from public, anon;
grant execute on function public.autodama_current_balances(uuid) to authenticated;
commit;
