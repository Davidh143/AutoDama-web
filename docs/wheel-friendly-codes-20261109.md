# Přehledné názvy sad kol — AutoDama

## Změna oproti předchozí verzi

Automaticky generované interní označení pro novou sadu je nyní `KOLA-001`, `KOLA-002`, `KOLA-003` atd., bez ohledu na to, zda byla sada zadána ručně nebo vznikla z PDF Macadam. Původní automatický formát `MAC-EEC825FC` se pro nové záznamy nepoužívá.

Číslování vychází ze **stávajících čísel KOLA-...** a vždy vybere následující nepoužité číslo, takže nevzniká duplicita, když jsou některé záznamy přejmenované ručně nebo odstraněné. Počítá se bez ohledu na velikost písmen. `MAC-` zůstává pouze ve starých záznamech do jejich přejmenování.

## Přejmenování starších položek

V záložce **Kola a pneumatiky** je pro starší automaticky vytvořené sady Macadam (původní kód `MAC-` + 8 hexadecimálních znaků) k dispozici tlačítko **Přejmenovat N starších sad**. Po potvrzení:
- Každá starší automaticky pojmenovaná sada dostane následující volné sériové číslo.
- **Interní ID sady se nemění**, a tedy ani původní vozidlo, aktuální přiřazení, potvrzení převzetí, stav nebo počet kusů.
- Pokud je odkaz na sadu také v historii prodeje vozidla (`wheelSaleHistory`), aktualizuje se tam její zobrazovaný kód podle stejného interního ID.
- Ručně zadané vlastní názvy zůstávají nedotčené.
- Opakované kliknutí nic znovu nemění.

Jde pouze o **přejmenování zobrazovaného názvu**; žádné zásoby se automaticky nepřesouvají ani nevzniká účetní či daňová událost.

## Technické ověření

- Test helperu: správné další číslo pro `KOLA-001` a `KOLA-003` je `KOLA-004`.
- Migrace dvou starých `MAC-XXXXXXXX` na `KOLA-004` a `KOLA-005` včetně přepsání historie prodeje podle `wheelId`.
- Opakovaná migrace neprovádí žádné další změny.
- Zkontrolována syntax celého inline JavaScriptu a aktualizován striktní CSP SHA-256.
- **Změna je pouze ve vývojové větvi (draft PR), ne v hlavní AutoDama.** Uložení a chování v přihlášeném prohlížeči je ještě potřeba prakticky ověřit.
