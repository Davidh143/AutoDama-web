# AutoDama: soukromé cíle a výběry vlastníka

**7. listopadu 2026 – implementace v testovací větvi.** 
Na této větvi jsou také předchozí změny pro Authenticator, hlídač skladu a výnosnost kapitálu. Nedělat merge přímo do `main` bez ověření historie předchozích draft PR.

## Co je hotové
- Tabulka `public.autodama_owner_private` s RLS pro vlastníka: soukromé cíle, plán osobních výběrů, samotné osobní výběry a revize.
- Funkce `autodama_update_owner_goals` dovoluje měnit cíle pouze vlastníkovi (kontrola autorizace v databázi).
- Nová položka v postranním menu **Moje cíle**, pouze pro vlastníka. Výchozí cíle 5 vozidel/měsíc, očekávaný zisk na auto 30 000 Kč, cílový měsíční zisk 150 000 Kč a 60 aut ročně. Vše lze upravit; cíle nejsou v globálním sdíleném JSON, nejsou v investorově exportu, nevyskakují na hlavní obrazovce.
- Serverový `autodama_save_state_private`: vlastník může atomicky uložit veřejný stav a soukromé transakce v jedné databázové transakci.
- Původní `autodama_save_state` nově **odmítne** osobní výběry ve společném stavu. Může jej volat investor pro sdílené údaje, ale nemůže se dostat k soukromé části.
- `autodama_current_balances` vrací pouze **aktuální celkové zůstatky účtů** včetně soukromých výběrů. Nemá parametr data; nelze tak dotazovat minulá jednotlivá období.
- Investorův pohled Finance a Reporty schová podrobnosti osobních výběrů, časový výpis a soukromý finanční plán, ale ukazuje současné zůstatky, zisky aut a investorský kapitál.
- Owner má v soukromé in-memory evidenci vlastní výběry a plán; při běžném uložení je server oddělí od sdíleného dokumentu. Soukromá část zůstává ve vlastním exportu úplné zálohy.
- Existing 20-history recordů: současná i historická hodnota osobního plánu ve sdílených JSON byla nastavena na neinformativní nulu. Skutečný nastavený plán byl předem zkopírován do vlastníkova soukromého profilu.
- V době migrace nebyly v cloudovém stavu ani historii žádné transakce typu `withdrawal` nebo přílohy. Žádné reálné platby tedy nebylo nutné přesouvat.

## Bezpečnostní testy serveru
- Soukromá tabulka má právě owner-only SELECT RLS; editorovi simulovanému jako `authenticated` vrací 0 řádků.
- Simulovaný vlastník přes `authenticated` vidí svůj řádek.
- Editor nemůže změnit cíle: RPC odmítla požadavek se stavem SQLSTATE 42501.
- Editor může načíst bezpečný JSON se souhrnnými zůstatky, nikoliv osobní výběry.
- `anon` nemá EXECUTE k RPC aktualizace cílů, soukromého uložení ani souhrnných zůstatků.
- Databázová migrace prošla, nové funkce existují.
- JS syntax a CSP sha256 jsou ověřovány při přípravě branche; **browser end-to-end s účtem investora zatím neproběhl**.

## Zásadní provozní upozornění
- **Pro osobní výběry od této migrace používat pouze novou verzi**. Stará HTML aplikace nezná soukromé úložiště; kdyby se z ní pokusil vlastník vložit osobní výběr, server ho odmítne, aby ho nezveřejnil. Ostatní typy zápisů fungují na původním RPC.
- V nové verzi načíst autentizaci vlastníka; otevřít **Finance** a **Moje cíle**, případně cíl bez zásahu do skutečných transakcí upravit a uložit.
- V samostatném prohlížeči v účtu investora zkontrolovat, že není položka Moje cíle, není plán vlastníka ani jednotlivé výběry, zůstává přesný souhrn peněz a jeho kapitál.
- Zkontrolovat srovnání výpisu účtu a agregátu v aplikaci před zadáním reálných soukromých výběrů.
- Při kontrole stáhnout kompletní JSON zálohu POUZE jako vlastník. Owner záloha obsahuje i osobní výběry; nesdílet ji s investorem.
- Nedokáže se zabránit tomu, aby si investor někdy **odvodil rozdíl** mezi zůstatkem a známými společnými platbami. Souhrnné bankovní zůstatky ze své podstaty určitou informaci o odchozích pohybech nesou. Nemáme slibovat absolutní nezjistitelnost.
- Podrobné historické bankovní cashflow je na investorově obrazovce omezené, protože jinak by z něj šly soukromé výběry zpětně dopočítat.
- Nejde o náhradu účetní evidence. Vlastník musí uchovat úplné doklady a bankovní výpisy a daňové podklady.

## K testu
- Zvolený stav v Supabase: projekt `AutoDama` (`guuepzzhpkwnxoxhgikv`).
- SQL: `docs/owner-withdrawals-privacy-activation.sql` — **již aplikováno** přes Supabase migrace.
- Výsledná PR: připravená jako draft, nelze ji považovat za kompletní produkční test.
