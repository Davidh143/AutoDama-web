# AutoDama: dvoufázové ověření Authenticator – bezpečné zavedení

## Stav implementace v testovací větvi

V nové větvi `feature/security-totp-20261106` je doplněno do `index.html`:
- přihlášení e-mail + heslo → kontrola aktivních TOTP faktorů v Supabase,
- první naskenování QR v Google/Microsoft Authenticatoru a potvrzení šestimístným kódem,
- při dalším přihlášení povinná výzva na kód, dokud Supabase nevydá session s JWT `aal=aal2`,
- kontrola AAL2 před výběrem a otevřením firmy, a uložení obnovených tokenů do existujícího úložiště relace,
- zobrazení ověřených zařízení v Nastavení a možnost přidání dalšího záložního zařízení.

Všechny změny jsou v samostatné větvi. Původní aplikace i současná data nebyla změněna. QR/secret se nevkládají do GitHubu ani do záloh AutoDama.

## Klíčová bezpečnostní hranice – MFA pouze v prohlížeči NESTAČÍ

Podle oficiální dokumentace Supabase musí být vynucen AAL2 **také na serveru** prostřednictvím RLS, pravidel Storage a ověření privilegovaných RPC funkcí. Uživatelská obrazovka v HTML nezabrání obejití pomocí přímých API požadavků. Samotný veřejný Supabase `sb_publishable_` klíč není tajný a jeho bezpečnost závisí na serverových pravidlech.

Zdroj: https://supabase.com/docs/guides/auth/auth-mfa a https://supabase.com/docs/guides/database/postgres/row-level-security

### Kontrola backendu před ostrým provozem

1. Udělejte kompletní zálohu auta + doklady a ověřte obnovu.
2. V **Supabase → SQL Editor** spusťte výhradně read-only skript `docs/security-audit-readonly.sql`.
3. Potvrďte, že všechny firemní tabulky `public.autodama_*` a `storage.objects` mají zapnuté RLS a správná oprávnění; zkontrolujte politiku pro bucket `autodama-documents`.
4. Připravte omezující RLS podmínku `(select auth.jwt()->>'aal') = 'aal2'` v politikách typu `AS RESTRICTIVE` pro čtení i zápis. *Nepouštějte změnu bez testovacího účtu s již aktivním TOTP:* jinak se můžete zamknout mimo data. Zkontrolujte, že vedle omezujících politik existují i povolující politiky pro členství ve firmě.
5. Všechny `SECURITY DEFINER` RPC (zejména `autodama_create_workspace`, `autodama_save_state`, `autodama_members_list`, `autodama_add_member`, `autodama_remove_member`) musí na serveru kontrolovat AAL2 i oprávnění ke konkrétní firmě. Např. při začátku funkce `if (auth.jwt()->>'aal') is distinct from 'aal2' then raise exception 'MFA required' using errcode='42501'; end if;` — ale až po kontrole úplné definice funkce a řízení rolí. U `SECURITY DEFINER` se **nelze spoléhat na RLS tabulky**.
6. Otestujte neoprávněný požadavek se session AAL1 **přímo na REST a RPC**; musí být zamítnut. Otestujte AAL2 vlastníka, AAL2 čtenáře bez zápisu i zcela cizí účet. Všechno na testovacích datech.
7. Otestujte ztrátu telefonu a plán ověřené obnovy faktoru. Pro bezpečný přístup do budoucna přidejte druhý Authenticator v Nastavení.
8. Na GitHubu zvažte přesunutí repozitáře do private; nesdílejte databázové servisní klíče ani hesla.
9. Zálohy JSON obsahují citlivá obchodní data **v čitelné podobě**. Ukládejte je na šifrovaný disk a nikdy je nedávejte do veřejného GitHub repozitáře.

**Tato větev není produkčně schválena.** Nebylo možné ověřit ani upravit aktuální Supabase SQL z připojeného GitHub projektu, protože definice databáze tu nejsou. Neprovádějte merge/deploy ani neoznačujte data za bezpečná, dokud neproběhne kontrola serveru a interaktivní test přihlášení.

### Testování Authenticatoru na testovacím účtu

1. Přihlaste se k testovací verzi e-mailem a heslem; pokud není aktivní TOTP, zobrazí se QR kód.
2. V telefonu v Google/Microsoft Authenticatoru přidejte účet skenem QR.
3. Vepište šestimístný kód do AutoDama. Do konverzace neposílejte QR, secret ani kód.
4. Odhlaste se, znovu se přihlaste a ověřte výzvu.
5. V Nastavení → Dvoufázové zabezpečení přidejte druhé záložní zařízení.
6. Až poté vyhodnoťte serverové RLS a právní/praktickou správu přístupu.
