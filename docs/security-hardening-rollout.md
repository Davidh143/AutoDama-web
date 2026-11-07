# AutoDama – bezpečnostní aktualizace 7. 11. 2026

## Stav zavedení

### Aktivní v produkční Supabase (aplikace / oprávnění jsou oddělené)

1. Tabulka `autodama_change_audit`: append-only serverový audit výhradně pro vlastníka. Trigger automaticky loguje revizi, účet, čas, sekci a NÁZVY změněných polí pro společná auta, náklady, doklady, finanční pohyby a nastavení, nikoliv hodnoty.
2. Migrace pro volitelné striktní MFA: `autodama_workspaces.require_mfa` je default **false**. Vlastník může zavolat `autodama_enable_mfa` až poté, co mají **všichni aktivní členové firmy** verified TOTP. RPC `autodama_mfa_status` vrací jen ownerovi souhrnný stav.
3. Současný stav při testu: **1 ze 2 účtů** má verified TOTP (vlastník); investor čeká. Povinné MFA pro všechny **není zapnuté**. Původní rolling serverové omezení platí pro již ověřené uživatele.

### Připravené v testovací GitHub větvi

1. **Automatické odhlášení po 20 minutách uživatelské nečinnosti**. Varování po 18 minutách. Sleduje reálné interakce, ne serverové synchronizace; návrat do dlouho skryté karty vyvolá kontrolu času. Po odhlášení se čistí citlivý in-memory stav a lokální relace.
2. V Nastavení jen pro vlastníka **Historie změn** – posledních 50 událostí načtených ze serverového auditu, podle účtu.
3. V Nastavení jen pro vlastníka **Firemní ověřování** – informace o počtu ověřených účtů a tlačítko pro zapnutí povinného Authenticatoru (zobrazí se až po dokončení všech registrací).
4. Nezávislé AES-256-GCM šifrované **denní aplikační zálohy** jako GitHub Actions artifacts s retenční dobou 30 dní – `.github/workflows/autodama-encrypted-backup.yml`, `scripts/autodama_encrypted_backup.py`. **Zatím neběží**. Vyžadují tři bezpečně uložené GitHub Actions secrets a sloučení zkontrolovaných workflow do výchozí větve.
5. **Jedna HTTPS webová adresa** přes GitHub Pages – `.github/workflows/autodama-pages.yml`. Zatím nepublikováno, čeká na nastavení Pages a autorizovaný merge do `main`.

## Testy provedené před předáním
- DB: ověřená owner-only RLS a žádné oprávnění člena přímo zapisovat/mazat audit.
- DB: trigger auditu otestován skutečným RPC zápisem **v transakci ROLLBACK** – produkční revize a data nedotčeny.
- DB: striktní MFA nelze zapnout, pokud investor ještě nemá ověřený Authenticator.
- DB: při simulaci aktivního striktního MFA server zamítá přístup s JWT `aal1`; test pouze v transakci s ROLLBACK.
- DB: s `require_mfa=false` stále mohou owner (`aal2`) i investor (`aal1`) načíst společný stav – nebyli odříznuti.
- Frontend: syntax JavaScriptu a CSP SHA-256 hash skriptu ověřeny.
- Frontend: modelový test varování po 18 minutách a odhlášení po 20 minutách splněn.
- GitHub backup job **nebyl spuštěn**, protože není nakonfigurovaný přístup a šifrovací klíč; produkční end-to-end backup a restore zatím netestovány.
- V prohlížeči zatím neproběhl kompletní test owner + investor nové bezpečnostní větve. **PR musí zůstat draft.**

## Co musí vlastník udělat

1. Novou testovací verzi `index.html` otevřít a přihlásit se vlastním účtem. Zkontrolovat Nastavení → Historie změn / Firemní ověřování, vlastní soukromé cíle a Finance.
2. Nechat investora stáhnout stejnou verzi, přihlásit se vlastním účtem a **aktivovat TOTP**. Vlastník poté v Nastavení zkontroluje `2/2` a může kliknout Zapnout MFA povinně pro všechny.
3. Samostatně otestovat investorský přehled, že nevidí soukromé cíle ani osobní výběry, ale vidí správné celkové bankovní zůstatky.
4. Zálohy nakonfigurovat podle `docs/offsite-backups-setup.md` a absolvovat jeden úspěšný ruční běh + místní dešifrovací test. Udržovat šifrovací klíč bezpečně **mimo GitHub**.
5. Webový hosting nasadit podle `docs/github-pages-launch.md` po schváleném code review, pak provést nový test na finální HTTPS adrese.
6. Repozitář GitHub je veřejný. Secret/service_role klíč nesmí být v `index.html`, SQL, dokumentaci ani v commitu. Zkontrolovat změny `scripts/` a `.github/workflows/` před merge, protože workflow s právy číst secrets může klíče vyzradit.
7. Bezpečnostní advisor Supabase hlásí `auth_leaked_password_protection`. Projekt je na bezplatném tarifu, a tato funkce vyžaduje Pro; **nebyl aktivován žádný placený tarif**. Používat 12+ znaků a unikátní hesla.

## Omezení
- Automatické odhlášení v prohlížeči není totéž jako serverem vynucený absolutní limit životnosti JWT; staré tokeny se řídí pravidly Supabase, v aplikaci se po odhlášení čistí klientská relace.
- Audit zaznamenává změny od okamžiku aktivace triggeru, ne historické změny před ním.
- Šifrovaný aplikační archiv není kompletní `pg_dump`, nezahrnuje nastavení účtů MFA v Supabase.
- Na GitHub Pages je HTML přihlašovací stránka veřejně přístupná. Databáze a soukromé soubory zůstávají chráněné Supabase Auth a RLS.
