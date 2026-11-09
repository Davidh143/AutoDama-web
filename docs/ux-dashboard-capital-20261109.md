# AutoDama — přehlednější dashboard, kapitál, vozidla a inzeráty

## Rozsah této testovací aktualizace

### Hlavní přehled
- Čtyři prioritní ukazatele: auta na skladě, zisk tento měsíc, kapitál v autech a **skutečná dostupná hotovost pro nákup** po závazcích, DPH a rezervách.
- Přidán samostatný panel **Kapitál · já a investor** pro vlastníka evidence. Zobrazuje vlastní/investorův celkový kapitál, vázanou část v autech a jejich **virtuální nevázané podíly**.
- **Nesmí se zaměnit** virtuální nevázané podíly za peníze na účtu. Bankovní dostupnost se počítá původní funkcí `financeDashboard`.
- Pokud nejsou kapitálové počáteční stavy nastavené, aplikace vysvětlí, že údaje nejsou k dispozici. Pokud některým vozidlům chybí rozdělení financování, aplikace upozorní na neúplnost místo odhadování.
- Podrobná tabulka kapitálu byla posunuta na začátek stránky Finance (pod banner s volným kapitálem).
- Panel **Vyžaduje pozornost** upozorní na dlouho stojící auta, nepotvrzené druhé sady, chybějící nabídkové ceny a starší reporty Macadam k doplnění.
- **Soukromí investora:** osobní kapitálový rozpis je na dashboardu dostupný jen vlastníkovi (v lokálním režimu je dostupný operátorovi). Investor vidí svůj dosavadní omezený přehled financí.

### Vozidlo
- Detail auta je rozdělen na záložky **Přehled | Výbava | Kola | Doklady | Finance**.
- Přehled začíná aktuálními technickými údaji, nákupní cenou, nabídkovou cenou a dobou na skladě; dlouhé finanční a DPH tabulky jsou přesunuty na kartu Finance.
- Formulář Přidat/Upravit vozidlo zůstává kompletní, ale jednotlivé oblasti lze rozbalovat: faktura, Macadam, základní údaje, nákup/DPH, plánovaná cena, prodej, Slovensko, financování, náklady, výsledky, poznámky.
- Pokud je některé povinné pole ve sbalené oblasti, klientská validace tuto oblast otevře.
- Stávající evidované kola, historie předání, dokumenty, náklady a finanční detaily zůstávají beze změny.

### Plánovaná prodejní cena
- Nové **volitelné** pole `askingPrice` v Kč pro ceny v inzerci. **Není** to potvrzený prodej, finanční transakce, ani základ pro DPH.
- Současná pole `sale`, `sold` a prodejní DPH se nemění. Neprodané vozidlo má stále `sale:null`.
- V detailu se zobrazuje nabídková cena a orientační zisk v simulovaném scénáři pomocí existujícího výpočtu `vehicleFinancial` nad **dočasnou kopií vozidla**. Jestliže chybí ověřené údaje, scénář se nezobrazuje. Nezahrnuje budoucí neznámé náklady ani případnou slevu.
- Seznam vozidel u neprodaných aut ukazuje inzerovanou cenu místo dřívějšího „Prodej zatím nezadán“.

### Náklady a doklady
- Stránka je rozdělená do záložek **Náklady | Pojištění | Doklady**.
- Jedno filtrování podle vozidla platí pro všechny tři záložky.
- Opravena nepřesná poznámka o tom, kde se přílohy ukládají: pro lokální režim je zmíněná IndexedDB; pro sdílené přihlášení soukromé cloudové úložiště.

### Generátor textu inzerátu
- Z detailu auta lze kliknout **Vytvořit inzerát pro Bazoš**.
- Nadpis a text se sestaví z dostupných údajů auta, VIN, nájezdu, výbavy z Macadamu a **volitelné** zadané nabídkové ceny.
- Před zkopírováním musí uživatel potvrdit, že ověřil aktuální nájezd a výbavu.
- **Druhá sada kol se nezmiňuje**. Generátor nevymýšlí majitele, historii nehody, servisní historii, záruku ani technický stav.
- Nic se automaticky nevystavuje na Bazoš; pouze se připraví text a zkopíruje.

## Zachování účetní logiky a bezpečnosti
- Beze změny zůstaly `vehicleFinancial`, `purchaseTax`, `saleTax`, `capitalView`, `fundingSplit`, logika evidence DPH a fyzického skladu.
- Nevznikly nové tabulky, migrace SQL ani změny RLS. Nové pole `askingPrice` je volitelná vlastnost vozidla v existujícím stavovém JSON.
- Zkopírování inzerátu vyžaduje aktivní kliknutí a osobní potvrzení faktů.
- Změny jsou ve větvi **feature/ux-dashboard-capital-20261109**; žádná data nebyla změněna, hlavní `main` ani používaná produkční aplikace ne.
- Ověřena syntax kompletního inline JS, konzistence CSP SHA-256, nedotčené finanční funkce a generování inzerátu na syntetickém autě.
- **Reálný end-to-end test přihlášení, přenosu dat, ukládání, zobrazení v různých prohlížečích a mobilních zařízeních ještě nebyl proveden.** Proto draft PR; před nasazením prakticky vyzkoušet v testovací kopii.

## Doporučený ruční test
1. Otevřít testovací verzi a ověřit nový dashboard v režimu vlastníka, pak zkusit investorův účet.
2. Otevřít existující auto a projít všech pět záložek; ověřit faktury, Macadam, náklady a kola.
3. U auta na skladě zadat plánovanou prodejní cenu, uložit a ověřit, že přitom nevznikl prodej ani DPH.
4. Nahrát fakturu a Macadam do nového auta přes rozbalovací sekce, ověřit validaci povinných položek.
5. Otevřít Náklady a doklady, přepnout všechny tři karty, filtrovat vozidlo.
6. V detailu otevřít generátor Bazoše; ověřit obsah a kopírování textu. Druhá sada kol se nesmí objevit.
