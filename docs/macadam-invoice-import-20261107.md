# AutoDama – dvoufázové načtení faktury a reportu Macadam

## Pracovní postup

1. V sekci **Vozidla** klikni na **Přidat vozidlo**, případně uprav existující vozidlo.
2. Nahraj **proforma / konečnou nákupní fakturu**, klikni na **Načíst údaje z PDF**. Tím se předvyplní VIN, model, SPZ, cena, číslo faktury a další nalezené údaje.
3. V témže formuláři je nový blok **Načíst report Macadam**. Vyber exportované PDF a klikni **Načíst údaje z Macadamu**.
4. Macadam zkontroluje VIN a doplní prázdné položky (zejména nájezd, převodovku, motor, výkon a první registraci, pokud ještě nebyla vyplněna). Stávající SPZ/registraci nepřepisuje a zobrazuje případné rozdíly.
5. Již zadaný nájezd automaticky nepřepisuje. Pokud opravdu chceš převzít starší nájezd z inspekce, zaškrtni **Nahradit již zadaný nájezd...** *před* načtením Macadamu.
6. Report se uloží jako příloha **Inspekční report Macadam** k vozidlu a po uložení se přehled pneumatik, výbavy, klíčů a data inspekce objeví v detailu vozidla.
7. Pokud Macadam hlásí druhou sadu pneumatik, můžeš v importním bloku **volitelně založit skladovou sadu**. Vyber, zda jsi opravdu dostal kompletní kola nebo samotné pneumatiky, a potvrď **fyzické převzetí**. Bez dvojího potvrzení se nic do skladu nepřidá.
8. Potvrď **Uložit vozidlo** – teprve nyní se změny stavu a PDF uloží do sdílené evidence.

## Záměrné bezpečnostní hranice

- **Proforma neprokazuje nárok na odpočet DPH.** Macadam nemá žádný vliv na výpočet DPH, pořizovací cenu ani finance.
- Report Macadam zachycuje **stav v den inspekce**. Výbava a kola mohou být mezitím jiné. Kilometry jsou podle reportu, nikoli automaticky dnešní stav.
- **Historická poškození nejsou nové úkoly ani náklady.** Zůstávají pouze v původním PDF pro dohledání.
- V reportu může být „Druhá sada kol: Ano“, ale v sekci „Pneumatiky ve vozidle“ u typu kol znak „-“. Z toho **nelze automaticky potvrdit, zda jsou na discích**. Při importu výslovně volíš typ a potvrzuješ skutečné převzetí.
- Jeden report se stejným obsahem se nemůže stejnému vozidlu připojit dvakrát. VIN Macadamu musí souhlasit se zadaným VIN i s VIN původně uloženého auta.
- Nově přidaná druhá sada se přiřadí k vozidlu, ale **nepředá se automaticky kupujícímu při prodeji**. Zůstává na skladě, dokud ji ručně nepředáš nebo neuvolníš.
- PDF se zpracuje lokálně v prohlížeči pomocí PDF.js. PDF soubor se uloží do soukromé Supabase Storage až po uložení vozidla. Knihovna PDF.js se stále načítá z pevně uvedené CDN verze; před produkčním nasazením doporučeno zajištění vlastní kopie a bezpečnostní revize.
- Macadam parser je zatím optimalizován pro **8stránkový PDF výtisk** se sekcemi Informace o vozidle, Příslušenství, Pneumatiky. Jiné šablony je potřeba průběžně otestovat.
- Fotky z reportu jsou v přiloženém PDF; nejsou extrahovány jako jednotlivé fotografie.

## Ověření a připravenost

- Lokální rozbor skutečného poskytnutého PDF (8 stran) ukázal správné rozpoznání nájezdu, počtu klíčů, výkonu, výbavy a tří skupin pneu. Testovací PDF není nahráno do veřejného GitHub repozitáře.
- Syntetický test parseru v JavaScriptu prošel pro VIN, 107 922 km, 2 klíče, 147 kW, 4 zimní a 4 letní pneumatiky i volbu druhé sady.
- Ověřena syntax kompletního JavaScriptu a přepočítaný CSP SHA-256 hash; stávající import faktur zůstává v kódu.
- Zkontrolována kompatibilita serverové Supabase RPC: nový volitelný `wheelSets` a vlastnost `vehicle.macadam` jsou předávány spolu s existujícím sdíleným JSON stavem, bez databázové migrace.
- **End-to-end test u přihlášeného vlastníka/investora a skutečné uložení souboru přes prohlížeč ještě není potvrzený.** Proto je implementace v draft větvi a ne na hlavní větvi.

## Zachování soukromí

V samotné veřejné GitHub větvi není vložena skutečná faktura, Macadam PDF, obsah fotografií ani kopie uživatelových dokladů; je tam pouze parser a kód formuláře.
