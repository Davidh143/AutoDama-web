# AutoDama – hlídač skladových aut a výnosnost kapitálu

**Stav:** testovací verze. Větev `feature/stock-watch-20261107` vychází z `feature/security-totp-20261106` (Authenticator). Původní verzi a databázi není třeba nahrazovat.

## Novinky

1. **Hlídač skladu** na stránkách Přehled a Vozidla – pouze skutečná neprodaná auta, ne testovací kusy. Kontroluje datum přijetí na sklad (náhradně datum nákupu) a standardně upozorňuje po 30 / 45 / 60 dnech. Pro každý vůz ukáže vázaný kapitál, odhad pojištění a ušlého výnosu za dalších 30 dní. Řazení upřednostňuje nejdéle stojící urgentní vozidla.
2. **Detail auta** obsahuje rozpis orientačního ekonomického dopadu dalšího čekání.
3. **Nastavení hlídače** je společné pro firmu. Uživatel s rolí owner/editor může změnit tři hranice, očekávané procento výnosnosti kapitálu měsíčně a odhad ostatních držebních nákladů na auto za 30 dní. Výchozí hodnoty: 30/45/60 dní, 1 % měsíčně, 0 Kč ostatní rozpočet.
4. **Reporty** porovnávají u prodaných aut zisk na 100 000 Kč vázaného kapitálu za 30 dní a přidávají agregovaný kapitálově-denní ukazatel. Z neúplných, testovacích a historických záznamů bez dat se hodnota neodvozuje.

## Vysvětlení čísel

- `vázaný kapitál` = dosavadní výpočet `vehicleFinancial.investment` (nákupní cena po odpočitatelné DPH + evidované náklady, kde jsou již započítané i evidované pojistky).
- `pojištění / 30 dní` = poměrná část pojistného ze zadaných smluv, které pokrývají příštích 30 dní. Je to **rozložení známého výdaje v čase**, nikoliv nová faktura; účetní zisk se tím nesnižuje znovu. Neznámé budoucí obnovení pojištění se neodhaduje.
- `ušlá příležitost / 30 dní` = vázaný kapitál × zadané očekávané měsíční procento. Je to **scénář**, nikoli skutečná ztráta, jistý výdělek nebo peněžní tok. Výchozí 1 % je pouze předpoklad, který lze změnit i na 0 %.
- `ostatní rozpočtový náklad` = dobrovolně zadaný přibližný náklad na auto; **nezaúčtovává se**, nepřičítá k jednotlivým fakturám ani nezapočítává opakovaně do účetního zisku.
- `výnos na 100 000 Kč za 30 dní` = zisk prodaného auta × 100 000 × 30 / (vázaný kapitál × počet dní od skladu do prodeje). Nulové dny či kapitál a neúplný zisk se z přehledu vyloučí. Jde o srovnání rychlosti zhodnocení, ne příslib výnosu; bez nezadaných provozních režií.

## Otestování bez rizika pro původní evidenci

1. Na původní fungující verzi AutoDama stáhnout úplnou JSON zálohu.
2. Na GitHubu ve větvi `feature/stock-watch-20261107` otevřít `index.html`, stáhnout soubor jako `AutoDama-sklad-test.html`. Nahradit **nesmí** původní HTML.
3. Po přihlášení přes Authenticator zkontrolovat Přehled > Hlídač skladu, Vozidla > Hlídač skladu a Reporty > Výnosnost kapitálu.
4. Zkontrolovat dvě skutečná auta a jejich pojistky, starší než 45 a 60 dní, a ověřit, že výpočty sedí. V Nastavení otevřít pravidla, případně změnit 1 % (uložení se propíše do společné evidence a do všech klientů po aktualizaci).
5. V původní verzi zkontrolovat, že se stav aut, DPH, zisk a bankovní účty nijak nezměnily.
6. Testovat přihlášení zvlášť; v této větvi se neměnila implementace Authenticatoru.

## Výsledek technických kontrol

- JavaScript syntakticky zkontrolován, CSP `script-src` přepočítán SHA-256 a srovnán se zdrojovým skriptem.
- Jednotkové scénáře upozornění pro 0, 29, 30, 44, 45, 59, 60 a 90 dní uspěly.
- Pojištění v modelovém období 600 Kč / 30 dní, další krytí 23 dní = 460 Kč, uspělo.
- Normalizované výnosy pro modelové příklady 40 000 / 270 000 Kč / 20 dní a 65 000 / 420 000 Kč / 90 dní vyšly 22 222,22 a 5 158,73 Kč na 100 000 Kč za 30 dní.
- **Nebyl proveden produkční end-to-end test v Chrome se skutečnou relací** ani kontrola správnosti všech historických dokladů; před přechodem na běžnou verzi je potřeba ověření majitelem.

## Záměrná omezení

- Neexistují push upozornění mimo otevřenou aplikaci; práh je vyhodnocený při zobrazení.
- Hlídač nepředpovídá přesnou dobu prodeje a nepřebírá aktuální tržní ceny; nacenění aut zůstává ve společné konzultaci ChatGPT.
- Do produktivní databáze nebyly touto změnou nasazeny žádné nové tabulky, migrace ani změny v účtech.
