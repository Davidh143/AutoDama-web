# Sklad kol: automatické čekající sady a rozhodnutí při prodeji auta

## Co se změnilo

- Po načtení Macadam PDF se druhá sada pneumatik / kol **automaticky založí** jako záznam v záložce **Kola a pneumatiky**, stav **Čeká na převzetí** (oranžově). Pro vytvoření položky není nutné předem zaškrtávat „Založit druhou sadu“.
- Záznam označený **Čeká na převzetí** má `received:false`; do skutečné fyzické skladové zásoby se **nezapočítá**. Po převzetí otevři řádek tlačítkem **Potvrdit převzetí**, zkontroluj značku, rozměr, počet kusů, typ (samotné pneumatiky / kompletní kola) a zatrhni **Fyzické převzetí potvrzeno**.
- Pokud jsou kola fyzicky převzatá už při importu, lze potvrdit rovnou při načítání Macadamu a zvolit jejich typ.
- U dříve uložených Macadamů, kde byla druhá sada uvedená, ale ještě nebyla založená do skladu, se zobrazí tlačítko **Zaevidovat starší sady z Macadamu**. Po kliknutí se založí oranžové nepotvrzené řádky bez duplicit.
- Obuté pneu, rezervní kolo, klíče i výbava zůstávají přehledně u vozidla jako **stav při inspekci**. Obuté pneu nejsou samostatně účtované zásoby.
- Při změně stavu vozidla na **Prodáno / Předáno** formulář obsahuje sekci **Prodej auta – co bude s druhou sadou kol?**. U každé skutečně převzaté a přiřazené sady je **povinné rozhodnutí**:
  - **Předat s autem zákazníkovi:** sada dostane stav `delivered`, zůstane v historii auta, zmizí z fyzického skladu.
  - **AutoDama si kola ponechá:** sada dostane stav `available`, odpojí se od prodaného auta, je znovu volná pro další vůz.
- Pokud nebyla žádná druhá sada převzatá, detail prodaného auta uvádí **Prodáno bez druhé sady** nebo **Druhá sada nebyla při prodeji potvrzená**.
- Na detailu prodaného auta se ukládá výsledek prodeje i historie jednotlivých sad. Na samotné sadě se současně ukládá pohyb, původní auto zůstává zachované.
- Finanční část aplikace, nákupní DPH, prodejní DPH ani dosavadní zisk se automaticky nemění.

## Bezpečnost

Nepovažujeme historický Macadam „Druhá sada: ANO“ za fyzický důkaz převzetí. Oranžové řádky se do zásob počítají až po fyzické kontrole. Předanou sadu není možné nevědomky nabídnout dalšímu kupujícímu.

## Kontroly

- Syntakticky ověřený kompletní JS kód a přepočítaný CSP SHA-256.
- Modelový test: založení nepotvrzené sady, nemožnost duplicitního backfillu, zákaz automatického předání nepotvrzené sady, uvolnění při prodeji bez kol, vyřazení při předání, záznam pohybu a povinné rozhodnutí.
- **Bez end-to-end ověření v přihlášeném prohlížeči** – pouze testovací větev, ne hlavní `main`.
- Kompatibilní JSON datový stav verze 2, bez změn DB/RLS nebo produkčních záznamů. Sady existujících uložených Macadamů vyžadují jednorázové kliknutí na doplnění starších sad.

## Manuální test

1. Zálohuj AutoDama a otevři testovací HTML.
2. V detailu vozu, který již má Macadam, otevři Kola a pneumatiky a tlačítkem pro starší sady vytvoř čekající záznam.
3. Zkontroluj oranžový stav a nulový nárůst fyzických zásob.
4. Potvrď převzetí ve formuláři sady a ověř navýšení zásob.
5. Otevři vůz → Upravit vozidlo → Stav Prodáno. Vyber, zda kola předáš nebo ponecháš. Ulož a zkontroluj detail auta a sklad.
