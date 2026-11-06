-- AutoDama / audit bezpečnosti Supabase
-- POUZE ČTENÍ. NEMĚNÍ ŽÁDNÁ DATA, ROLE ANI PRAVIDLA.
-- Spusťte v Supabase SQL Editoru a posuzujte společně s bezpečnostním checklistem.

-- 1) Ochrana firemních tabulek a storage.objects
select n.nspname as schema_name,c.relname as table_name,
       c.relrowsecurity as rls_enabled,c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.relkind in ('r','p')
  and ((n.nspname='public' and c.relname like 'autodama_%')
       or (n.nspname='storage' and c.relname='objects'))
order by n.nspname,c.relname;

-- 2) Přístupová pravidla pro tabulky a Storage včetně AAL2 podmínek
select schemaname,tablename,policyname,permissive,roles,cmd,
       qual,with_check
from pg_policies
where (schemaname='public' and tablename like 'autodama_%')
   or (schemaname='storage' and tablename='objects')
order by schemaname,tablename,policyname;

-- 3) Privilegované RPC funkce; SECURITY DEFINER mohou obcházet běžné RLS
select n.nspname as schema_name,p.proname as rpc_name,
       pg_get_function_identity_arguments(p.oid) as signature,
       p.prosecdef as security_definer,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as signed_in_can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'autodama_%'
order by p.proname;

-- 4) Úložiště příloh nesmí být veřejné
select id,name,public,file_size_limit
from storage.buckets where id='autodama-documents';
