
-- Only server-generated, owner-readable audit events. Do not store financial field values.
create table if not exists public.autodama_change_audit (
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.autodama_workspaces(id) on delete cascade,
 revision bigint not null,
 actor_id uuid references auth.users(id) on delete set null,
 happened_at timestamptz not null default now(),
 events jsonb not null default '[]'::jsonb,
 constraint autodama_audit_events_array check(jsonb_typeof(events)='array')
);
create index if not exists autodama_change_audit_workspace_idx
 on public.autodama_change_audit(workspace_id,happened_at desc,id desc);
alter table public.autodama_change_audit enable row level security;
revoke all on public.autodama_change_audit from public,anon,authenticated;
grant select on public.autodama_change_audit to authenticated;
drop policy if exists autodama_change_audit_owner_read on public.autodama_change_audit;
create policy autodama_change_audit_owner_read
 on public.autodama_change_audit
 for select to authenticated
 using (autodama_private.has_access(workspace_id,array['owner']) and autodama_private.mfa_ready_for_session());

create or replace function autodama_private.autodama_capture_shared_state_audit()
returns trigger
language plpgsql security definer set search_path=''
as $audit$
declare
 v_collection text;
 v_before jsonb;
 v_after jsonb;
 v_changes jsonb := '[]'::jsonb;
 v_event record;
 v_keys jsonb;
 v_settings jsonb;
begin
 if new.data is not distinct from old.data then return new; end if;
 foreach v_collection in array array[
  'vehicles','costs','accounts','transactions','vatPeriods','obligations','policies','documents','capitalEvents'
 ] loop
  v_before:=case when jsonb_typeof(old.data->v_collection)='array' then old.data->v_collection else '[]'::jsonb end;
  v_after:=case when jsonb_typeof(new.data->v_collection)='array' then new.data->v_collection else '[]'::jsonb end;
  for v_event in
   with before_rows as (select x.value as detail from jsonb_array_elements(v_before) x),
   after_rows as (select x.value as detail from jsonb_array_elements(v_after) x)
   select coalesce(b.detail->>'id',a.detail->>'id') as record_id,
     b.detail as old_detail,a.detail as new_detail
   from before_rows b full join after_rows a on b.detail->>'id'=a.detail->>'id'
   where b.detail is distinct from a.detail
  loop
   select coalesce(jsonb_agg(k.key order by k.key),'[]'::jsonb) into v_keys
   from (
    select u.key from jsonb_object_keys(coalesce(v_event.old_detail,'{}'::jsonb) || coalesce(v_event.new_detail,'{}'::jsonb)) u(key)
    where v_event.old_detail->u.key is distinct from v_event.new_detail->u.key
   ) k;
   v_changes:=v_changes||jsonb_build_array(jsonb_build_object(
    'section',v_collection,
    'recordId',v_event.record_id,
    'operation',case when v_event.old_detail is null then 'created'
      when v_event.new_detail is null then 'deleted' else 'updated' end,
    'fields',v_keys
   ));
  end loop;
 end loop;

 if old.data->'settings' is distinct from new.data->'settings' then
   select coalesce(jsonb_agg(k.key order by k.key),'[]'::jsonb) into v_settings
    from (select x.key from jsonb_object_keys(
      coalesce(old.data->'settings','{}'::jsonb)||coalesce(new.data->'settings','{}'::jsonb)) x(key)
      where old.data->'settings'->x.key is distinct from new.data->'settings'->x.key) k;
   if jsonb_array_length(v_settings)>0 then
     v_changes:=v_changes||jsonb_build_array(jsonb_build_object(
       'section','settings','operation','updated','fields',v_settings
     ));
   end if;
 end if;
 if old.data->'capital' is distinct from new.data->'capital' then
   v_changes:=v_changes||jsonb_build_array(jsonb_build_object(
     'section','capital','operation','updated','fields','[]'::jsonb
   ));
 end if;

 if jsonb_array_length(v_changes)>0 then
  insert into public.autodama_change_audit(workspace_id,revision,actor_id,events)
  values(new.workspace_id,new.revision,new.updated_by,v_changes);
 end if;
 return new;
end;
$audit$;

drop trigger if exists autodama_capture_shared_state_audit_trigger on public.autodama_states;
create trigger autodama_capture_shared_state_audit_trigger
 after update of data on public.autodama_states
 for each row execute function autodama_private.autodama_capture_shared_state_audit();

revoke all on function autodama_private.autodama_capture_shared_state_audit() from public,anon,authenticated;
