# Šifrované automatické zálohy AutoDama

Tato sada vytváří **každý den** (02:37 UTC) silně zašifrovanou aplikační zálohu uloženou jako GitHub Actions artifact na 30 dní, **až po aktivaci workflow na výchozí větvi a doplnění secrets**.

### Co obsahuje

- veškeré řádky tabulek autodama_workspaces, autodama_members, autodama_states, autodama_history, autodama_owner_private, autodama_change_audit (včetně soukromých výběrů a cílů vlastníka),
- všechny přílohy odkazované z dokumentů v současných a uložených revizích,
- čas vytvoření a počty záznamů.

Není to plný `pg_dump`, nezálohuje GoTrue hesla, MFA faktory, SQL schéma a nastavení Supabase projektu, ani osiřelé soubory bez odkazu. Pro úplnou obnovu je potřeba mít také DB migrace z repozitáře a přístup do Supabase. Pro plnohodnotný disaster recovery plán doporučujeme také nativní managed database backup Supabase, pokud je dostupný v tarifu.

### Před spuštěním (nutná akce vlastníka)

1. V GitHubu otevři **Settings → Secrets and variables → Actions** a vlož 3 **repository secrets**:
   - `SUPABASE_URL`: `https://guuepzzhpkwnxoxhgikv.supabase.co`.
   - `SUPABASE_SERVICE_ROLE_KEY`: **tajný** klíč z nastavení Supabase. NEPOUŽÍVAT publishable klíč. Nikdy ho nepsat do chatu, commitu ani HTML souboru.
   - `AUTODAMA_BACKUP_KEY`: náhodný 32bajtový klíč zakódovaný Base64. Na vlastním počítači jej vytvoř: `python -c "import secrets,base64;print(base64.b64encode(secrets.token_bytes(32)).decode())"`.
2. Třetí klíč si **zvlášť ulož do správce hesel mimo GitHub**. Bez něj nelze artefakty obnovit. Pokud jej někdo získá, může přečíst uložené zálohy.
3. Repozitář je **veřejný**. Workflow nesmí vypisovat secrets. Před slučováním cizích pull requestů vždy zkontroluj jakékoli změny `.github/workflows` a `scripts`, protože workflows mohou po začlenění na hlavní větev přistupovat k tajným klíčům. Zapni ochranu hlavní větve a 2FA na GitHub.
4. Až ověříš kód, sluč jej do výchozí větve a povol GitHub Actions. V **Actions → AutoDama – encrypted off-site backup → Run workflow** proveď ruční zkušební běh. Zkontroluj, že je vytvořen soubor `.adbackup` s odpovídající velikostí.
5. Každý měsíc bezpečně stáhni jednu šifrovanou zálohu mimo GitHub. GitHub artifact má retenci jen 30 dní a jeho existence není zárukou dlouhodobé obnovitelnosti.

### Obnovení

Stáhni `.adbackup`, nastav **lokálně** `AUTODAMA_BACKUP_KEY`, potom:
```bash
python scripts/autodama_encrypted_backup.py --decrypt autodama-20261107.adbackup --output autodama-restore.zip
```
ZIP obsahuje aplikační JSON data a přílohy. **Neexistuje automatický restore do produkční databáze.** Obnovení se provádí řízeně a po prověření schématu, členů, bezpečnostních zásad a integrity. Rozšifrovaný ZIP obsahuje citlivé osobní a finanční údaje.

### Aktuální stav

Workflow je **připravené** v testovací větvi. Bez doplnění tří tajných hodnot a nasazení na výchozí větev se zálohy nevytvářejí. O úspěšném automatickém denním zálohování lze mluvit **až po prvním úspěšném běhu a testu obnovitelnosti**.
