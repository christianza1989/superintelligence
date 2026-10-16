# Kokybės, greičio ir sąnaudų kalibravimas

2026-10-16. **Veikia nuolatinio kalibravimo CLI; pirmas Claude prenumeratos v2 A/B turi patikrintus abiejų programų artefaktus. Pakartojimai ir kitos užduotys dar laukia.** Kalibruojama visa RepositoryZero darbo eiga, nuo užklausos supratimo iki patikrinto artefakto. [Daugkartinis Zero Lab modulis](ZERO-LAB.md), [porinio bandymo taisyklės](PAIRED-BENCHMARK.md), [pirma paruošta užduotis](../benchmarks/sprintdesk-v1/README.md).

## Tikslas

Užduotis laikoma naudinga, kai rezultatas atitinka iš anksto nustatytą acceptance ir naudotojas gali jį paleisti bei tęsti darbą. Optimizuojame bendrą užduoties kainą ir laiką, išlaikydami sutartą kokybę. Vien greičiau sugeneruotas tekstas ar mažiau vieno kvietimo tokenų nėra visos užduoties pagerėjimas.

Naudotojo „Codex ant steroidų“ tikslą paverčiame tikrinama hipoteze: tinkamų jau sukurtų komponentų paieška, tikslingas kontekstas ir darbo paskirstymas gali pagerinti galutinį rezultatą prieš tą patį coding CLI be papildomo katalogo konteksto. Laimėtojas iš anksto nenustatomas. Nesėkmingi, nutrūkę ir biudžetą išnaudoję bandymai lieka rezultatuose.

## Ką kalibruojame

| Sritis | Keičiami parametrai | Tikrinama pasekmė |
|---|---|---|
| Promptai ir planavimas | Užduoties išskaidymas, sistemos instrukcijos, klausimų tikslinimas, sustojimo ir taisymo sąlygos | Prarasti reikalavimai, nereikalingi žingsniai, papildomi naudotojo veiksmai |
| Katalogo retrieval | Užklausos, kategorijos/capabilities, lexical/semantinio retrieval derinys, shortlist dydis | Tinkamo kandidato suradimas, trūkstami ir klaidingai panašūs rezultatai |
| Kandidatų atranka | Evidence aktualumas, versija, platforma, licencija, API suderinamumas, vienos bazės ir komponentų parinkimas | Veikiantis reuse ir integracijos kaina; stars nėra kokybės ground truth |
| Jev | Choice/abstain instrukcijos, kontekstas, kriterijai, aktualumo rubrikos, call grupavimas ir cache | Klaidingi pasirinkimai/atmetimai, routerio kaina ir jo įtaka visai užduočiai |
| Kontekstas | Dokumentų/failų ištraukos, chunk dydis, privalomų kontraktų išlaikymas, pakartotinis retrieval | Reikalingos informacijos išsaugojimas, pagrindinio modelio input ir taisymų poreikis |
| Modeliai | Fiksuotas modelis ir reasoning; vėliau Auto pagal tikrai prieinamus capability/context/cost profilius | Galutinis correctness, sąnaudos ir laikas; OAuth modeliai neapsimetami visais tiekėjais |
| Agentų darbas | Užduočių ribos, specialistai, lygiagretumas, peer review, handoff formatas | Koordinavimo kaina, konfliktai, pasikartojantis skaitymas ir klaidos |
| Vykdymas ir cache | Source/build/context cache raktai, cold/warm režimai, tinklo ir build trukmė | Tikras end-to-end laikas, stale source, cache klaidos ir atkuriamumas |
| Testai ir taisymai | Tiksliniai testai, privalomos regresijos, repair limitai, sustojimas | Ištaisytos ir įneštos klaidos, recovery bei galutinio acceptance rezultatas |

Licencijos, leidimų, secret handling ir privalomo acceptance vartai nesilpninami siekiant geresnio balo. Jev rekomendacija negali pati paskelbti savo teisingumo ar repo verified statuso. Nežinomą kokybę žymime nežinoma.

## Kontroliuojami profiliai

1. **A — Claude baseline:** nauja oficialaus Claude CLI sesija, naudotojo prenumerata, `claude-sonnet-5-5`, effort `high`.
2. **B — Zero retrieval:** tas pats pagrindinis modelis ir reasoning; RepositoryZero katalogas, reuse instrukcija ir konteksto paruošimas.
3. **C — Zero retrieval + Jev:** tas pats coding modelis, papildoma ribota Jev atranka. Jev ir visų pagalbinių kvietimų laikas bei sąnaudos įtraukiami.
4. **D — Zero Auto model:** ankstesnis laimėjęs retrieval profilis ir Jev parenkami realiai prijungti modeliai. Tai jau kitas modelių profilis, todėl jo rezultato nepriskiriame vien retrieval ar promptui.

Importuotame Claude bandyme modelio ID ir tikras usage užfiksuoti CLI reportuose; auth status vienas to neįrodo. Codex auth ir OpenRouter/Jev lenktynės dabartiniam etapui atidėtos. Visų keturių profilių paleisti kiekvienam mažam pakeitimui nereikia. Pirmiausia tikrinama konkreti hipotezė su dviem atitinkamais profiliais.

## Vienas ciklas

1. Užfiksuoti užduoties tekstą, acceptance, pradžios failus, source pins, modelį/reasoning, įrankius, teises, cache režimą ir baigtinius laiko/resursų limitus.
2. Paleisti palyginamus naujus workspace su atskirais duomenimis. A/B eilę kaitalioti arba atsitiktinti; nenaudoti jau gauto kitos pusės sprendimo.
3. Surinkti faktinį elapsed laiką, modelių usage, realią ar unavailable kainą, žmogaus įsikišimus, artefaktų digest ir nepriklausomą acceptance. Setup, discovery, Jev, coding, tests ir repair laikas įtraukiami, o etapai pateikiami ir atskirai.
4. Išanalizuoti pagrindinę problemą: discovery miss, netinkama bazė, prarastas kontraktas, klaidingas routing, kodas, aplinka ar vertinimo spraga. Klaidos nepriskirti Jev vien dėl to, kad jis įjungtas.
5. Pakeisti vieną parametrų grupę, išsaugoti naują profilio versiją ir hipotezę. Susijusių pakeitimų paketą aiškiai pažymėti; iš jo neišvesti kiekvieno parametro atskiros naudos.
6. Pakartoti bandymą ir patikrinti, ar pagerėjimas išlieka su kitomis užduotimis. Jei kokybė prastėja ar sąnaudos neaiškios, nepristatyti jo kaip bendro laimėjimo.

Vienas laimėtas paleidimas yra vieno atvejo rezultatas. Turint pakankamai kartojimų rodomi sklaidos matavimai, p50/p95 ir neapibrėžtumas; mažo mėginio nevadiname patikima pasauline statistika. Keli vienodai kokybiški variantai gali likti kaip greičio/kainos kompromisai.

## Užduočių rinkiniai ir apsauga nuo prisitaikymo

Kalibravimo užduotys, validavimo užduotys ir galutinis laikomas rinkinys turi atskirus ID ir versijas. Promptai/routeris/kandidatų taisyklės derinami pagal kalibravimo dalį. Galutinio rinkinio atsakymai nenaudojami kitam promptui toje pačioje deklaruotoje eval versijoje; persidengimas pažymimas, rinkinys atnaujinamas.

Apimame naujo produkto kūrimą, pakeitimą esamame projekte, klaidos taisymą, source integraciją, duomenų/dokumentų darbą ir trūkstamą ar netinkamą repo. Pradiniame mažame rinkinyje turi būti bent LT ir EN užduotys. Cold ir warm rezultatų nesuplakame; repo/source pokyčiai ir atsitiktiniai provider sutrikimai išlieka matomi.

Privačios naudotojo užduotys netampa viešu benchmarku ar bendru kalibravimo rinkiniu automatiškai. Tokiam panaudojimui reikia atskiro opt-in, duomenų nuasmeninimo ir aiškaus scope. Katalogo augimas nėra modelio pertreniravimas.

## Kas įgyvendinta ir kas dar laukia

- [x] Kalibravimo principai, parametrų sritys ir kontroliuojami A/B/C/D profiliai aprašyti.
- [x] Pirmos SprintDesk užduoties promptas ir nepriklausomas API tikrintuvas paruošti prieš generavimą.
- [x] Bendras SystemOne transportas ir tools/model/repo atrankos ribos turi offline testus.
- [x] Importuotas Claude prenumeratos CLI conformance ir usage su abiejų sugeneruotų programų revalidation; be naujų modelių kvietimų integruojant.
- [ ] Jev account/entitlement/usage ir Auto lane conformance; Codex auth šiuo metu atidėtas.
- [x] Viena sėkminga Claude prompt-v2 pora: abi realios programos praėjo restart/SQLite ir desktop/mobile acceptance. V1 nesėkmės nepašalintos.
- [x] Vietinių versijuotų A/B JSON, prompt/source digest, faktinių CLI usage ir konservatyvaus reportų palyginimo kodas; offline testai PASS, importuotas tikras Claude palyginimas perskaičiuotas; [apimtis ir ribos](CLAUDE-CALIBRATION.md).
- [x] Kontroliuojamo fixture API/SQLite ir izoliuoto desktop/mobile/keyboard grader integracija; regressions aptinkamos, subjektyvus UI vertinimas lieka atskiras.
- [ ] Kelių užduočių kartojimai, validavimo ir galutinis laikomas rinkinys.
- [ ] Biudžetu apribotas automatinis profilio vertinimas ir regresijų aptikimas; žmogaus patvirtintas paskelbimas apie realiai išmatuotą rezultatą.

Tai konkretina esamus P0.29 ir P1Q kokybės darbus; pilno MVP30užduočių acceptance ir viešų pažadų nepakeičia. Neribotas kalibravimas ar visų naudotojų mokami kvietimai neįjungiami vien dėl prijungto rakto.

## Artimiausia kohorta

[Patikrinta vienos poros santrauka ir trijų papildomų porų planas](CLAUDE-CALIBRATION.md#kitas-ribotas-etapas). V2 promptas ir graderis fiksuojami prieš sesijas. Kodavimo laikas analizuojamas atskirai nuo graderio; v1 ir v2 bei skirtingų CLI/grader hash kohortos nesuplakamos. Dabartinis tikslas — pakartojamumas, po to naujas CSV/SQLite užduoties promptas su nepriklausomu tikrintuvu.

`npm run lab:cohort` saugiai paruošia tris poras be modelių; `-- --live` jas vykdo su Claude prenumerata. `--mode compact` yra atskiras seno ir kompaktiško katalogo konteksto palyginimas, o ne automatinis antras etapas. [Komandos, limitai ir ataskaitos](LOCAL-LAB.md#trys-poros-viena-komanda). Naujas kandidatas pakeičia ir kandidatų limitą, ir kodavimą; pirmas eksperimentas vertina jų bendrą poveikį. Payload baitų sumažėjimas nėra tokenų sutaupymo įrodymas. Automatinis numatyto profilio pakeitimas neįjungtas.
