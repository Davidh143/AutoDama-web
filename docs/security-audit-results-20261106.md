# AutoDama – bezpečnostní audit skutečného projektu (6. 11. 2026)

**Projekt:** AutoDama v Supabase (EU, PostgreSQL 17).

## Potvrzené read-only auditem

- Čtyři firemní tabulky `autodama_workspaces`, `autodama_members`, `autodama_states`, `autodama_history` mají zapnuté RLS.
- Všechny čtecí RLS politiky se omezují na `authenticated` a příslušné členství. U seznamu členů smí uživatel číst svůj záznam nebo vlastník své firmy.
- `anon` nemá oprávnění číst firemní tabulky ani vykonávat veřejné RPC.
- Role `authenticated` nemá přímo INSERT/UPDATE/DELETE na firemní tabulky; zápisy se provádějí privilegovanými RPC.
- Pět `SECURITY DEFINER` RPC je záměrně dostupných `authenticated`; čtyři kontrolují `autodama_private.has_access()` a `autodama_create_workspace` vyžaduje `auth.uid()` a zakládá vlastní firmu. Samotné upozornění advisoru zde tedy není důkaz obejití členství.
- `autodama_private.has_access()` kontroluje `auth.uid()` a členství ve firmě. **Zatím nevyžaduje `aal2`**.
- Bucket `autodama-documents` je soukromý; `storage.objects` má RLS, čtení/vkládání dokumentů je omezené na členství a roli.
- Existují 2 uživatelské účty, 1 firemní prostor, 2 členství, 1 vyplněná evidence. **Ověřených MFA faktorů je 0** (6. 11. 2026).
- Security Advisor hlásí pět privilegovaných funkcí jako možné riziko (vyžadují audit, proveden) a zakázanou kontrolu uniklých hesel. Doporučení: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable a https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Co ještě není hotové

- **Žádné produkční databázové ani auth nastavení nebylo změněno.**
- Nový klient s TOTP MFA je jen na samostatné větvi a prošel pouze statickou kontrolou, syntaktickým testem a mock testy. Nebyl vyzkoušen v reálném přihlášení.
- Povinné AAL2 na databázových tabulkách, Storage a RPC ještě není zapnuté.
- Kontrolu uniklých hesel je třeba zapnout přes Supabase Auth v Dashboardu; dostupné připojení ji neumí přímo měnit.
- Uživatel musí sám naskenovat QR kód, potvrdit šestimístný TOTP kód a bezpečně mít záložní možnost obnovy. Nesmí zasílat QR, secret ani kódy do chatu.

## Připravená aktivace

Připravený **nevykonaný** produkční skript: `docs/security-mfa-server-activation.sql`. Skript po aktivaci vyžaduje AAL2 v helperu `has_access`, ve funkci `create_workspace` a v restriktivních RLS SELECT/Storage politikách.

**Důležité pořadí:** 1) kompletní ověřená záloha, 2) reálný test nové HTML verze s uloženou AAL2 relací vlastníka, 3) alternativní záložní MFA zařízení, 4) teprve pak serverový SQL skript, 5) ověřit explicitní zamítnutí AAL1 REST/RPC i Storage a povolení rolí AAL2, 6) sledovat Security Advisor a logy.

Serverový SQL skript je úmyslně ve větvi, ne nasazený. Spuštění před nastavením MFA by nyní uživatelům znemožnilo používat současnou evidenci.
