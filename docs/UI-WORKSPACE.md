# RepositoryZero darbo erdvė

> **Planuojama produkto specifikacija · peržiūrėta 2026-10-17.** Aprašo siekiamą elgesį; schemų pavyzdžiai ir maketai savaime nėra įgyvendintos funkcijos. Daliniai foundation komponentai nekeičia viso vartų statuso. Datuotos įgyvendinimo pastabos žemiau nėra atnaujinta būsenos suvestinė; senos kainų/auth/source prielaidos tikrinamos prieš realų profilį. Dabarties autoritetas: [būsena](IMPLEMENTATION.md), [priimta architektūra](DECISIONS.md), [roadmapas](../ROADMAP.md).

2026-10-16. Naudotojo pateikta Codex ekrano nuotrauka yra darbo struktūros atskaitos taškas. **Tai dizaino planas, ne jau sukurta sąsaja.** Naudojame pažįstamą projektų/pokalbio/rezultato struktūrą ir savą RepositoryZero identitetą.

## Pagrindinis vaizdas

```text
┌─────────────────────────────────────────────────────────────────────┐
│ RepositoryZero  ·  Projektas  ·  Užduoties būsena  ·  Biudžetas  ·  LT │
├───────────────┬──────────────────────────────┬────────────────────────┤
│ Nauja užduotis│ Pokalbis ir darbo planas     │ Rezultatas              │
│               │                              │                        │
│ Projektai     │ Žmogaus tikslas              │ Failo / PDF / lentelės │
│ Pokalbiai     │ Pasirinkti įrankiai           │ / video peržiūra        │
│ Užduotys      │ Vykdoma → tikrinama → baigta  │ arba kodo diff          │
│               │                              │                        │
│ Įrankiai      │ Suskleidžiamos veiksmų        │ Versija, kilmė ir       │
│ Nustatymai    │ kortelės ir klaidų paaiškinimai│ patikros rezultatas     │
│               ├──────────────────────────────┤                        │
│               │ Užduotis…  + priedai          │                        │
│               │ Modelis · sąnaudos · siųsti  │                        │
└───────────────┴──────────────────────────────┴────────────────────────┘
```

Kairė projektų/istorijos juosta ir dešinė rezultato peržiūra suskleidžiamos. Kai nėra atidaryto rezultato, pokalbis gauna daugiau vietos. Mažame ekrane tie patys vaizdai perjungiami, ne suspaudžiami į tris neįskaitomas skiltis.

## Kas matoma dirbant

Centre žmogus mato savo užduotį, trumpą tikrą planą, veiksmų korteles ir aiškų rezultatą. Detalūs tool kvietimai, kaina, laikas, versija ir paaiškinimas atidaromi pagal poreikį. „Baigta“ turi atskirą patikros būseną; netikra progreso procentinė reikšmė nerodoma. Cancel, blocked ir unknown turi konkretų suprantamą paaiškinimą.

Dešinėje gali būti kodas/diff ir testai, originalus PDF su išgauta lentele, source ataskaita ar media preview. Artefaktas turi versiją ir kilmę; naudotojas gali palyginti rezultatą ir jo patikrą. Nėra būtinybės kiekvieną failą iš naujo ieškoti pokalbio tekste.

Apatinis composer turi tekstą, leidžiamus priedus, pasirinkto pagrindinio modelio/account indikaciją ir žinomą budget būseną. API raktai nepatenka į composer. Jev yra tools atrankos sluoksnis; jo darbą ir usage galima matyti veiksmų/advanced vaizde, neapsimetant, kad jis pakeičia pagrindinį generuojantį modelį.

„Įrankiai“ atidaro [katalogą](TOOL-DIRECTORY.md): kategorijos/search, readiness ir lokalūs installed/authorized profiliai. Agentas gauna įrankius per [registrą](AGENT-CAPABILITIES.md). To paties įrankio pasirinkimo priežastis prieinama tiek kataloge, tiek susijusioje darbo kortelėje.

## Vizualinis stilius ir kalbos

**Numatytoji tema — juoda / salotinė**, aiški tipografija, kontrastas ir keyboard/focus. Kitos temos vėliau jungiamos per bendrą temų pagrindą. Pagrindinė darbo erdvė skirta pokalbiui ir artefaktui. Pasaulinio augančio tinklo/Zero gaublio vizualas priklauso projekto pristatymo svetainei bei apžvalgos pasakojimui.

Visi UI tekstai per [i18n paketą](LANGUAGES.md); pradinis locale rinkinys en/ru/es/zh-Hans/lt/de/fr/pt-BR. Navigation, formos, statusai ir klaidos palaiko ilgesnius tekstus/CJK ir nekeičia vidinių capability ar API identifikatorių.

## MVP ir tolimesni vaizdai

MVP prioritetas – projektai/pokalbis, tikras užduoties progresas, composer, modelio/budget nustatymai ir artefakto/testų peržiūra. Katalogas ir suplanuoti portalai turi savo stage/route pagal [roadmapą](../ROADMAP.md). Dar neįgyvendintas vėlesnis screen nerodomas kaip veikiantis vien dėl gražaus menu.

Priėmimas: naujas žmogus pradeda palaikomą užduotį, supranta pasirinktą paskyrą/modulio poreikį, mato realų progresą, atidaro artefaktą ir patikrą, supranta nesėkmę/atšaukimą ir gali naudotis deklaruota UI kalba. Reikia tikro responsive/accessibility ir user walkthrough; šios patikros dabar **NOT_RUN**.


## Keičiamų temų pagrindas

Nuo M1 pernaudojami pasirinkto UI bazės design tokens; spalvos nehardcodinamos kiekviename ekrane. Pradinė tema `zero-lime`: fonas #090B09, paviršius #121612, pagrindinis tekstas #F2F4EF, salotinis akcentas #B7FF32 su tamsiu tekstu ant ryškaus mygtuko. Tai dizaino reikšmės iki tikro kontrasto ir įrangos bandymo.

Semantiniai tokens apima background/surface/text/muted/border/accent/on-accent/focus ir atskiras success/warning/error/info reikšmes; tema turi light/dark color-scheme metadata. Selected nėra sinonimas verified. Statuso pavadinimas/ikona išlieka kartu su spalva, neutralus source-only netampa sėkme pakeitus paletę. Dialogai, editorius, terminalas, chart ir desktop chrome turi tą patį theme kontraktą arba aiškų mapping.

Temų registras turi stabilų ID, versiją ir leistinų tokens schemą, default fallback ir persistintą žmogaus pasirinkimą. Trūkstamas/neteisingas paketas grįžta į saugią default temą; nauja tema nekeičia task, auth, policy ar API. Pirmame MVP pakanka vienos pilnos numatytosios temos ir patikrinto pakeitimo mechanizmo su testine alternatyva; daugiau išbaigtų temų kuriama vėliau. Account pasirinkimas neprivalomas vietinei temai.

Temos paketas deklaratyvus — nepaleidžia savavališko JS, neskaito secrets ir neturi išorinių asset fetch kaip būtinos sąlygos. Theme picker vėliau leidžia preview, pasirinkti ir išsaugoti. Mažesnis judesys, keyboard/focus, tekstų kontrastas ir8locale/CJK išdėstymas turi išlikti tinkami. Deklaratyvių temų importo parduotuvė nėra privaloma M1 dalis.

## Imagegen dizaino maketai po tarpusavio kritikos

- [Darbo erdvė: kuriama buhalterinės programos demonstracija](quarantine/2026-10-17/docs/assets/ui/workspace-accounting-concept.png).
- [Įrankių katalogas ir kandidato detalės](quarantine/2026-10-17/docs/assets/ui/tool-directory-concept.png).

Tai generuoti ateities dizaino vaizdai su pavyzdiniais įrašais, sąnaudomis ir statusais; ne veikiančios programos screenshotai. EN pasirinktas vaizdų tekstui, o produkto locale planas lieka8kalbų. Juoda/salotinė pakeičia ankstesnę mint kryptį. Maketai nėra galutinis pixel-perfect ar accessibility acceptance.

Po antro agento kritikos darbo makete pridėtas Stop task, atskirtas pagrindinis modelis ir Jev tools atranka; išimtas klaidinantis Docling TypeScript diff. Kataloge source-only yra neutralus, Integration pending, o diegimą pakeičia integracijos progreso peržiūra. Tikroje UI atskirame Budget vaizde turi būti abu routing ir task cap bei jų bendras account rezervas; vien vaizde nupiešta suma to neįgyvendina.

## Žmogus prašo sukurti naują programą

„Naujas projektas → sukurk buhalterinę programą“ pradeda [reuse ir kūrimo eigą](PROJECT-CREATION.md): brief → palyginami esami sprendimai → viena bazė ir tinkami papildymai → isolated build → veikiantis preview ir patikra. Centre matomi tikri veiksmai, dešinėje kuriamos programos Preview/Changes/Checks, apačioje tęsiami pakeitimų prašymai. Rezultato programa turi savo sąsają; RepositoryZero lieka jos kūrimo darbo erdvė.

Šaltinių pernaudojimo pasirinkimas ir alternatyvos aprašyti [UI pagrindo sprendime](UI-FOUNDATIONS.md). Daugiau mockup ekranų savaime nepraplečia pirmo techninio MVP.


## Pirmo įgyvendinto pjūvio vaizdai

[Veikiančio katalogo ekrano nuotrauka](assets/ui/directory-foundation-screenshot.png), [vietinės svetainės ekrano nuotrauka](assets/ui/site-foundation-screenshot.png) ir [tikros darbo erdvės su sukurtu agentu nuotrauka](assets/ui/workspace-foundation-screenshot.png) yra tikro naršyklėje atvaizduoto pirmo pjūvio vaizdai. Darbo erdvė patikrinta su vietine paskyra ir išlikimu po reload, be modelio key. Jie skiriasi nuo ankstesnių imagegen konceptų; pilnos pokalbio/programos kūrimo eigos acceptance dar nėra. [Įgyvendinimo būsena](IMPLEMENTATION.md).
