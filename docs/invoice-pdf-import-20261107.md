# AutoDama: import nákupní faktury a proformy do vozidla

## Proč dvě faktury
Drivalia nejprve posílá **proforma / zálohovou fakturu**, později **konečnou fakturu** podobného vzhledu. Oba dokumenty patří k jednomu vozidlu podle VIN. Proforma **není automaticky daňový doklad pro odpočet DPH**.

## Nové ovládání
1. V AutoDama otevři **Přidat vozidlo**, případně otevři už existující auto a dej upravit.
2. V horní části formuláře vyber PDF a klikni **Načíst údaje z PDF**.
3. Zobrazí se návrh modelu, VIN, SPZ, první registrace, nákupní ceny, čísla dokumentu a data vystavení.
4. Zkontroluj typ dokumentu: **Zálohová faktura** nebo **Konečná faktura**. Typ lze ručně přepnout, pokud je konečná faktura vzhledově stejná jako proforma.
5. Pokud je VIN už založené v jiném záznamu, aplikace vložení nového vozidla odmítne. Otevři existující vozidlo a nahraj k němu konečnou fakturu.
6. Teprve po potvrzení **Uložit vozidlo** se atomicky zapíše upravené auto a jeho nový dokument do stejného sdíleného stavu. Ani samotné načtení PDF, ani změna výběru dokumentu nic neukládají.
7. Nový záznam s pouze proformou je veden jako **rozpracovaný**. Rok výroby a nájezd jsou prázdné. Předvyplněná nákupní DPH a odpočet jsou 0, nikoli odhadnutých 21 %. Datum vystavení faktury není automaticky DUZP a nepřepisuje datum nákupu.

## Co je ve vzorové faktuře
Šablona Drivalia má řádky Značka a model, RZ, Č. karoserie, Datum 1. registrace, Datum vystavení, Datum splatnosti a Částka k úhradě.
OCR skenů není zahrnuto. Parser čte jen PDF obsahující text; při selhání lze vše zadat ručně.

## Bezpečnostní poznámky
- PDF bytes zůstávají pro textovou extrakci v lokálním prohlížeči; textové vrstvy vyčítá Mozilla PDF.js.
- **Vývojová implementace** používá PDF.js `6.5.438` načítanou z pevně uvedené CDN adresy. Před produkčním nasazením doporučujeme závislost hostovat lokálně / vendorizovat, ověřit její integritu a provést bezpečnostní review; CDN dodává spustitelný kód.
- Příloha se do Supabase Storage přenese teprve při potvrzeném uložení vozidla přes existující `SupabaseStore.save`.
- Duplicita faktury kontrolována podle VIN + čísla dokumentu + typu dokladu. U dřívějších dokladů bez zaznamenaného čísla není tato ochrana stoprocentní; podle VIN se však druhý vůz nesmí vytvořit.
- Ověřování VIN zatím kontroluje alfanumerický formát, nikoliv všechny homologované WMI a kontrolní součty. VIN vždy porovnej s originálem.
- Typ dokumentu se při čtení odhaduje dle titulku (PROFORMA → zálohová; FAKTURA → konečná); uživatel ho může změnit.
- **Není provedeno reálné end-to-end klikání v obou přihlášených prohlížečích ani plné otestování na všech šablonách PDF.** PR je draft, produkce zůstává na předchozí verzi.
- Data reálné uživatelovy faktury nejsou ve veřejném GitHub repozitáři ani v testech.

## Ověřené testy
- Samostatná parsovací funkce: 3 syntetické podoby titulku (proforma, konečná faktura, daňový doklad) se shodným modelem, VIN, SPZ, cenou a daty → správně odlišený typ a vyčtená čísla.
- Syntax celého `<script type="module">` úspěšná.
- CSP sha256 skriptu aktualizováno po změnách.
- Žádná změna tabulek ani živých vozidel neproběhla.

## Oprava čtení PDF podle původní proformy (7. 11. 2026)

Opraven problém u PDF, která vykreslují text po **jednotlivých znacích**. Původní čtečka volala `trim()` na každé položce a při spojování vkládala mezeru mezi každý textový fragment. U dokumentu Drivalia to mohlo vyprodukovat `Z n a č k a…` namísto `Značka…`, takže parser nenašel VIN/model/cenu.

Nová čtečka zachovává i samotné znaky mezer a skládá sousední textové fragmenty podle souřadnic `x`, `y` a udávané šířky znaku. Mezeru doplní jen při skutečné horizontální vzdálenosti. Prohlížeč teď zobrazuje přesnou chybu také vedle tlačítka importu, ne jen v horní části formuláře.

**Regresní test:** Z původní dodané PDF proformy byl lokálně zkonstruován analogický tok 760+ jednotlivých glyphů a rekonstruovány řádky. Správně vzniklo `Značka a model: SKODA Kodiaq…`, `Č. karoserie: TMBLN7NSXM8055029`, `RZ: 8AR9610`, datum 1. registrace a částka. Šest kontrolních výrazů prošlo. Není to zatím plný E2E test v uživatelově Chromu s originální PDF.js.
