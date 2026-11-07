# AutoDama – samostatný sklad kol a pneumatik

## Provozní účel

Jeden vůz může přijít s druhou sadou kol. Zákazníkovi ji lze předat v rámci obchodu, ale nemusí: pokud ji nechá prodejce, sada se uvolní do fyzického skladu a může být přiřazena k dalšímu vozu. Záznam ve zprávě Macadam je pouze informace z inspekce, **nikoli důkaz fyzického převzetí**.

## Nové funkce

- Samostatná položka menu „Kola a pneumatiky“ a skladový souhrn na přehledu AutoDama.
- Každá evidovaná sada má samostatné ID a vlastní označení, počet kusů 1–4, typ (kompletní kola / samotné pneumatiky), sezónu, značku, rozměr, disky, dezén, umístění, orientační hodnotu a poznámku.
- Vazby na **původní auto** (historie odkud kola pocházejí) a **aktuálně přiřazené auto** (rezervace / předání). Vazby lze změnit přiřazením k jinému vozu.
- Stavy `available` (volné), `assigned` (přiřazené), `delivered` (předané spolu s autem), `sold` (samostatně prodané), `discarded` (vyřazené). Změny stavu a přiřazení zaznamenávají pohyb s časem v `movements`.
- Tlačítka **Uvolnit** a **Předat s autem** jsou dostupná pro fyzicky převzaté přiřazené sady.
- Zobrazuje se počet **volných kompletních sad (4 ks)**, zvlášť kola na discích a samotné pneu, počet přiřazených sad a celkový počet fyzicky držených kusů.
- Sady se započítávají **jen pokud je ručně potvrzeno fyzické převzetí**. Data z Macadamu nejsou automaticky proměněna ve skladové kusy.
- V detailu auta je odkaz na vytvoření přiřazené sady.
- Ochrana duplicitních interních označení.
- Přibližná cena není účetním nákladem, příjmem, DPH ani automatickou úpravou obchodního zisku. Tyto položky se vedou samostatně podle skutečných dokladů.

## Ukládání

Nové volitelné pole `wheelSets` v existujícím JSON stavu verze 2; staré stavy bez pole se čtou jako prázdný seznam a při prvním uložení sady se uloží společně s ostatními daty. Formát kompletní zálohy se nemění. Nevyžaduje vlastní databázovou tabulku ani nové API klíče. Investor s rolí editor může sady měnit stejně jako sdílená vozidla.

## Kontroly a omezení

- Syntaktická validace celého JS a aktualizace CSP hash.
- Modelový test se 6 sadami: jedna volná kompletní kola, jedna volná sada samotných pneu, jedna rezervovaná sada, jedna již předaná (mimo sklad), jedna neověřená (mimo sklad) a jedna volná neúplná sada; součet 14 fyzických kusů, 2 volné kompletní sady, 1 rezervovaná sada a 1 sada čekající na převzetí.
- **Zatím neproběhl end-to-end test s přihlášeným prohlížečem a reálným uložením do Supabase.** PR je draft, aplikace na hlavní větvi se nemění.
- Není součástí automatické rozpoznávání údajů ze zprávy Macadam. To by byla další samostatná funkce, ideálně s kontrolou skutečně převzatých kol.
- Pohyby kol se zapisují do interní historie dané sady. Samostatné serverové auditní logování pohybů zatím nebylo přidáno.
- Změny stavu je třeba potvrzovat ručně; prodej automobilu automaticky nepředává přiřazenou sadu, protože zákazník ji nemusí převzít.
