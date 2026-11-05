# AutoDama – zapojení financování investora (testovací větev)

Změny jsou integrovány přímo do `index.html`. Produkční větev `main` se nemění.

## Co nově funguje

- V sekci **Finance** je panel **Kapitál AutoDama · já a investor**.
- **Nastavit kapitál a procenta** – zadávají se skutečné počáteční nároky obou stran **včetně kapitálu v autech**. Nezakládejte nové bankovní příjmy.
- Ve formuláři vozidla je **Rozdělení financování auta**, automaticky podle volného kapitálu nebo ručně. Celkové financování musí přesně pokrývat nákupní cenu.
- Podíl financování a sjednaná sazba investora se **uloží ke konkrétnímu autu**. Změna nastavení nepřepočítá staré podíly.
- Prodej rozděluje kladný výsledek podle `zisk × podíl financování investorem × sazba investora`, pomocník dle podílu na zisku; při ztrátě se ztráta rozděluje podle financování a pomocník dostává nulu.
- Osobní výběry OSVČ již uložené v bankovních transakcích snižují virtuální vlastní kapitál; DPH vratky jej nezvyšují.
- Vklad a výběr investorova kapitálu je samostatná virtuální evidence; **skutečná bankovní platba se zapisuje zvlášť**.

## Bezpečný postup zkoušení

1. Ve stávající aplikaci nejdříve exportujte kompletní JSON zálohu (včetně dokladů) a ponechte původní soubor beze změny.
2. Ze své testovací větve stáhněte `index.html` jako nový soubor, například `AutoDama-test-financovani.html`. Nezapisujte reálná firemní data dříve, než ověříte místo ukládání.
3. Otevřete kopii v prohlížeči, přejděte do **Finance**, nastavte testovací počáteční kapitál, a potom při přidání testovacího vozidla vyzkoušejte rozdělení. Testovací vozidlo označte jako testovací, aby nevstoupilo do reálných výsledků.
4. Ověřte nákup, prodej, zálohování i obnovení a teprve potom rozhodněte o převedení skutečných dat.

**Nepřepisujte soubor s původní evidencí.** Lokální IndexedDB je navázané na konkrétní prostředí/origin a zkopírování HTML souboru samo o sobě data nepřenese.

## Ověřené scénáře

- Nákup 400 000 Kč financovaný 1,5 mil. Kč / 2,3 mil. Kč dostupným kapitálem → vlastní podíl 157 894,74 Kč, investor 242 105,26 Kč.
- Zisk 50 000 Kč, investorova sazba 35 %, pomocník 15 % → investor 10 592,11 Kč, pomocník 7 500 Kč, vlastník 31 907,89 Kč.
- Ztráta −20 000 Kč → investor −12 105,26 Kč, vlastník −7 894,74 Kč, pomocník 0 Kč.
- Osobní výběr 60 000 Kč snižuje vlastní kapitál; vratka DPH 63 000 Kč nevytváří zisk investora ani vlastníka.
- Nesouhlasící ruční částky financování jsou odmítnuty.

## Omezení

Rozdělení investorova nároku je **manažerská evidence**, ne automatická platba. Před použitím skutečných částek ověřte smluvní pravidla s investorem a daňové/účetní zpracování. Starým vozidlům se neodhaduje financování, dokud ho ručně nepotvrdíte. Výsledky zatím prošly kontrolou výpočetních funkcí a syntaktickou kontrolou, nikoli kompletním uživatelským testem v prohlížeči nebo proti skutečné databázi.
