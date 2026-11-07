# Stabilní HTTPS adresa AutoDama – připravené nasazení

Repozitář `Davidh143/AutoDama-web` je veřejný, proto je také výsledná **přihlašovací stránka veřejně dosažitelná**. Není to veřejná databáze: data musí chránit přihlášení a Supabase RLS.

Automatizace `.github/workflows/autodama-pages.yml` umístí **pouze** `index.html` na GitHub Pages po schváleném commitu do `main`. Nepublikuje SQL, serverové migrace, uživatelské údaje nebo šifrované zálohy.

### Co musí udělat vlastník, až bude ověřená produkční verze

1. Nechat investora otestovat přihlášení Authenticatoru a investorský finanční přehled z testovacího HTML.
2. Ověřit v soukromém okně vlastníka odhlášení po nečinnosti a historii změn.
3. Na GitHubu **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Po code review sloučit všechny předchozí navazující feature větve do hlavní větve `main` ve správném pořadí. Slučování `feature/security-hardening-20261107` přímo do staré hlavní větve může zavést konflikty s bezpečnostními PR, proto nikdy nevynucovat bez kontroly rozdílů.
5. Po prvním úspěšném Actions nasazení by výchozí adresa měla být `https://davidh143.github.io/AutoDama-web/`; skutečnou URL nejdříve ověřit v GitHub → Settings → Pages.
6. V Supabase Authentication → URL Configuration nastavit odpovídající **Site URL** a povolit **Redirect URL** pro tuto konkrétní HTTPS adresu, aby fungovala obnova hesla a pozvánky.
7. Po prvním nasazení provést v prohlížeči testy owner + investor a ověřit serverové RLS.

**Pozor:** Přepnutí na webový hosting neznamená automatické bezpečné nasazení soukromých dat. Povoleno je jen veřejné frontend HTML s `sb_publishable_` klíčem; veškeré administrátorské klíče, zálohovací klíče a šifrovaná data zůstávají mimo HTML.

### Stav
Připraveno ve vývojové větvi, **web není potvrzeně nasazen**. Nelze slibovat fungující URL dříve než po úspěšném Pages jobu.
