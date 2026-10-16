# Tyrimas: ciklai, atranka ir įrodymų ribos

Data **2026-10-16, Europe/Kiev**. Dauguma gyvų šaltinių momentinių kopijų paimta2026-10-15 vakare UTC, jau2026-10-16 naudotojo laiko juostoje. Tikslūs laikai įrašyti [evidence.json](../../catalog/evidence.json) ir [popularity.json](../../catalog/popularity.json).

## Išvada

Rekomenduojame pirmiausia patikrinti **Rakazo ADAPT/FORK kaip vienintelę produkto bazę**, išlaikant minimalų Python variantą kaip alternatyvą iki P0.0. Bendra kryptis: vienas užduočių autoritetas, paprastas UI, vienodi tool/artifact/permissions kontraktai,3 pirmi moduliai ir privalomas REA plėtros etapas, bendras tobulinimas per nepriklausomus įrodymus ir versijuotus leidimus.

Tyrimas turi [atvirą kandidatų baseiną be skaičiaus lubų](CANDIDATE-POOL.md). Pradinė dokumentinė100 projektų portfelio atranka išsaugota kaip istorinė imtis; nauji kandidatai dar unscored ir bus vertinami kartu su alternatyvomis. Nė vienas kandidatas šiame darbe netapo runtime `verified` ar `recommended`. Žvaigždutės naudojamos kandidatų atradimui, o vertinimo baluose jų nėra. Architektūros, kokybės, kainos ir dydžio hipotezės turi konkrečius [roadmap bandymus](../../ROADMAP.md).

## Atlikti ciklai

| Ciklas | Kas iš tiesų atlikta | Radinys / pakeistas sprendimas |
|---|---|---|
| C1: plati aprėptis |320 adresų;306 prieinami atsakymai; po alias ir raidžių registro normalizavimo299 unikalios prieinamos saugyklos; README/licencijų tekstų surinkimas ir indeksavimas per 20+ gebėjimų sričių | Pagrindinės ekosistemos ir pradinių10vartotojo repo egzistavimas; dalis adresų pervadinti, dubliuoti arba neprieinami |
| C2: spragos ir nišiniai įrankiai |10paieškos/discovery sąrašų šaltinių,9 prieinami;45 tikslinės naujos repo apžiūros. Tūkstančiai rastų nuorodų nevadinami ištirtais repo | build123d, ast-grep, AgentDojo, tau šeimos eval ir kiti konkrečių gebėjimų pretendentai |
| C3: nepriklausoma kritika | Antras agentas atskirai tikrino15 pagrindinių ir7 tikslinius repo README/LICENSE/public API; po kritikos keitėme kontrolės kalbą, DB ribą ir izoliacijos prielaidas | Vienas coordinator, taisyklingas effect timeout/reconcile, realūs MCP v2 entrypoints, Docling kodas ir modeliai atskirai, bubblewrap nėra paruošta pilna sandbox |
| C4: populiarumas ir naujumas |18gyvų šaltinių:5paieškos pjūviai po 3 puslapius ir daily/weekly/monthly Trending;195 repo reitingo stebėjimai;65 naujos repo apžiūros | REA#1dienos/savaitės Trending kopijoje; OpenClaw ir Hermes įtraukti kaip produkto baselines, HyperFrames į HTML video kryptį |
| C5: vartotojo Rakazo | README/LICENSE/manifestas/CI ir tikri modelių, API, executor, leases, artifact/effect persistence įėjimai; papildoma antro agento kritika | Greenfield Python pasirinkimas tapo alternatyva; privalomas build-vs-adapt ADR prieš realizaciją |
| C6: vartotojo Inbox Zero | README/LICENSE, manifestas/CI ir email/MCP/OAuth/draft/send kodas | Nauja email sritis, bet root LICENSE turi papildomų komercinių/enterprise apribojimų; reference-only/licence-blocked papildomame kataloge |
| C7: priežiūros aktualumas | Originalaus SWE-agent README nurodyto tęsinio mini-swe-agent repo ir jo licencijos/manifesto patikra | TOP100 pakeistas dabartiniu mini-swe-agent pretendentu; senas adresas paliktas kandidatų istorijoje |
| C8: plėtra be100kvotos |163 papildomų science/math/engineering/document/security/robotics/business adresų,145 prieinami atsakymai | Išsaugoti nauji ir siauresnių gebėjimų kandidatai, be išgalvotų kokybės balų |
| C9: speech ir cinematic media |15 GitHub paieškų,90 search stebėjimų,155 naujų repo adresų,148 prieinami; papildytas197 įrašų bendras media registras | TTS/STT/realtime/camera/video/avatar/postproduction; Higgsfield pavadinimas neįrodo atviro kino modelio |
| C10: antro agento spragos |55 nauji kanoniniai agentų/research/gateway ir kitų sričių repo su tiksliais SHA;52 root licencijų šaltiniai | AI-Scientist custom teisės, Archestra mixed scope ir Atropos archive lieka aiškiai peržiūrėtini |
| C11: autonomija ir auth | Oficialūs Electron/electron-builder/TUF/GitHub source snapshotai, OpenCode2.0.30 provider/auth source ir skills-only Treg dokumentacija | Ankstyvas auto PR, VPS, signed update/independent recovery, upstream lifecycle, oficiali svetainė/donate; live Treg count ir OAuth tinkamumas nepatvirtinti |

Išplėsta rinkimo apimtis: **806 adresų patikros,767 prieinami atsakymai,757 unikalūs prieinami repo**;796 registro įrašai įskaitant neišspręstus adresus.760 surinktų README tekstų ir726 repo-adreso patikros su licencijų šaltiniais; po alias dedup750 unikalių įrašų turi README ir716 – licencijos šaltinį. Tai surinkimo/indeksavimo apimtis; visų failų pilnas teisinis ir semantinis auditas neatliktas. Pradinei100 imčiai turime README/licencijos tekstą,88 manifestus ir86 CI YAML;25 gilesnės pirminės repo/source peržiūros papildytos atskirais autonomy/auth review. Tikslūs skaičiai ir apribojimai [research-run.json](../../catalog/research-run.json). Dalis plataus baseino yra sąrašai, mokymo medžiaga, API wrappers ar už MVP ribų esantys projektai; jų prieinamumas neįrodo naudingumo ar open-source teisių.

Tos pačios saugyklos HEAD tyrimo metu galėjo pasikeisti. Katalogo ir gilesnės peržiūros SHA gali skirtis, pavyzdžiui, REA atveju; kiekviena nuoroda lieka prie realiai skaitytos nekintančios revizijos. Npm/package versijos atitikimas source commit yra atskira dar neįvykdyta patikra.

## Populiarumo pjūvis

Momentinėje2026-10-15T21:15:51–52UTC kopijoje REA buvo#1dienos ir savaitės GitHub Trending, su 267698stars paieškos įraše. Tuo metu `topic:ai sort:stars` pirmas buvo OpenClaw392112, po jo obra/superpowers299789 ir Hermes254092. Tai atitinkamų paieškų ir momentų stebėjimai, ne globalus kokybės reitingas. Puslapių kopijose skaičiai gali keliais vienetais skirtis jau per minutę.

„Visų laikų stars“ čia reiškia iki momento sukauptų žvaigždučių paiešką. Istorinės visų GitHub Trending dienų duomenų bazės nesurinkome. Aprėpti `topic:ai`, `topic:llm`, `agent stars:>10000`, `stars:>100000` ir reverse-engineering pjūviai, po 3 puslapius. GitHub topic žymos gali būti nepilnos, todėl kartu naudojome gebėjimų ir tikslinių alternatyvų paiešką.

Tiesioginiai šaltiniai: [daily](https://github.com/trending?since=daily), [weekly](https://github.com/trending?since=weekly), [monthly](https://github.com/trending?since=monthly), [sukaupti stars AI](https://github.com/search?q=topic%3Aai+sort%3Astars&type=repositories), [LLM](https://github.com/search?q=topic%3Allm+sort%3Astars&type=repositories). Šios nuorodos gyvos; išsaugota stebėjimo istorija [JSON](../../catalog/popularity.json).

## Kaip tikrinti teiginius

- **PATIKRINTA ŠALTINYJE:** HTTP atsakymas, oficialaus repo adresas/pervadinimo alias, commit SHA, konkretus README/LICENSE/manifest/CI tekstas ar pažymėtas public API kodas. Pirminį tekstą surinko ir indeksavo programa; svarbiausių API bei licencijų scope papildomai skaitė abu agentai.
- **AUTORIŲ TEIGINYS:** README nurodyta funkcija, palaikoma OS, kokybės ar greičio skaičius. Autorių demo ir benchmark rezultatų šiame darbe nekartojome.
- **MŪSŲ IŠVADA:** užduoties pavyzdys, tinkamumas portfeliui, alternatyvų skirtumas, balas, integravimo sudėtingumas ir pasiūlyta architektūra.
- **NEPATIKRINTA:** realus adapteris, end-to-end sėkmė, actual disk/RAM/GPU, tikros kainos, visos transityvinės teisės, OS matrica, naujausia CI/release/issues reakcijos istorija. Nežinoma reikšmė null, o ne0arPASS.

L1 žymi README/licencijos/manifesto/CI šaltinių apžiūrą; L2 – papildomai perskaitytą tikrą public entrypoint kodą; L3 – mūsų vykdytą conformance; L4 – nepriklausomą realų end-to-end bandymą. Šiuo metu L3/L4 nėra. Du Codex agentai skaitė ir kritikavo sprendimus, tačiau tai nėra nepriklausomas žmogaus saugumo auditas.

GitHub REST API šiame host buvo užblokuota proxy403. Darbą tęsėme per oficialius GitHub HTML paieškos/repo puslapius ir commit SHA pririštus raw failus, išlaikydami TLS. Mokamų paieškos paslaugų, naujų paskyrų ar provider raktų nereikėjo. [Discovery šaltiniai ir pradinis pool](../../catalog/discovery.json).

## Atranka ir dubliavimo politika

Pradiniai100 portfelio įrašų turi konkrečią užduotį, integracijos kelią, licencijos šaltinį ir vaidmenį: branduolio komponentas, pasirenkamas modulis, alternatyva, eksperimentinis arba vartotojo privalomas planuojamas REA modulis. Jų registry būsena `candidate`. [100 balų sistema](../VALIDATION.md) konservatyviai neįskaito10empirinės kokybės balų, kol nėra runtime įrodymų. Nauji baseino įrašai nėra prievarta suranguoti: `unscored_discovery`, license-blocked ir unresolved statusai paliekami peržiūrai.

Kategorijos neturi vienodų kvotų. Nediegiame šimto repo ir neperimame kelių konkuruojančių frameworkų. Portfelyje paliekame keletą stiprių alternatyvų, kad galėtume priimti realų pasirinkimą pagal tikslų workload. Blogas licencijos fit ar stokojami įrodymai negali būti paslėpti aukštu populiarumu. Pilnas transityvinis licencijų auditas dar numatytas P0.

## Populiarūs ar naudotojo pasiūlyti kandidatai už pirmo pasirinkimo ribų

| Kandidatas | Faktas / atrankos priežastis | Būsena |
|---|---|---|
| [Inbox Zero](https://github.com/elie222/inbox-zero) | Tikrintame root LICENSE AGPL tekstas papildytas monetizavimo ir enterprise apribojimais; funkcionaliai įdomus email produktas | Reference-only/licence-blocked; [pilna atskira kortelė](SPECIAL-CANDIDATES.md) |
| [n8n](https://github.com/n8n-io/n8n) | Sustainable Use ir EE sąlygos; paprasto permissive core perėmimo nėra | Source-available alternatyva, ne default integracijos bazė |
| [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) | Root LICENSE aiškiai Polyform Shield `autogpt_platform/`, MIT kitur | Skirstyti scope, nevadinti viso repo MIT |
| [Open WebUI](https://github.com/open-webui/open-webui) | Individualios branding/naudotojų sąlygos tikrintame LICENSE | Atskira peržiūra prieš produkto perėmimą |
| [tldraw](https://github.com/tldraw/tldraw), [Remotion](https://github.com/remotion-dev/remotion) | Custom production/company licencijos | Už default permissive portfelio ribų; Excalidraw/FFmpeg/HyperFrames kiti profiliai |
| [billion-context](https://github.com/ranxianglei/billion-context) | LICENSE papildomas product-attribution term; kompresijos autorių nauda nebandyta | Eksperimentinė tyrimo kryptis, ne „neribotos atminties“ įrodymas |
| [Chainlit](https://github.com/Chainlit/chainlit) | Tikrinto GitHub puslapio archive pranešimas; naujausia priežiūra šioje saugykloje nepatvirtinta | Atsargiai, ieškoti palaikomo tęsinio prieš naują priklausomybę |
| [SWE-agent](https://github.com/SWE-agent/SWE-agent) | README pats nurodo mini-swe-agent kaip tęstinę plėtrą | Mini-SWE atrinktas; senas lieka alternatyvų istorijoje |
| [OpenJarvis](https://github.com/open-jarvis/openjarvis) | Apache 2, vietinės inference optimizavimo kryptis; autoriaus pajėgumų skaičiai nekartoti | TOP100 eksperimentas, ne visas antras branduolys |
| [Paperclip](https://github.com/paperclipai/paperclip) | MIT, agentų valdymo produktas su savo būsenos ir UI modeliu | Produkto tyrimo alternatyva, dubliavimo kaina prieš priimant |
| [FluidVoice](https://github.com/altic-dev/FluidVoice) | AGPL 3, macOS dictation kryptis | Platformai siauras pasirenkamas balso kandidatas; modelių teisės atskirai |
| [VoiceStudio](https://github.com/debpalash/VoiceStudio) | AGPL 3, platus voice produkto autorių aprašymas | Modelių ir reklamuojamų kalbų kokybė nepatikrinta, ne automatinė runtime priklausomybė |
| [Buzz](https://github.com/block/buzz) | Apache 2 workspace žmonėms ir agentams | Bendradarbiavimo UX tyrimas; nereikia perimti dar vieno globalios būsenos produkto |
| [Anatomy](https://github.com/wheresryan22/anatomy) | MIT agent-skill kryptis ir Node reikalavimai | Konkretaus mechanizmo kandidatūra; atsveria struktūrinė AST paieška ir REA |
| [TesterArmy e2e](https://github.com/tester-army/e2e) | Apache 2, e2e framework, modelinių funkcijų kokybė nekartota | Lyginti su Playwright+nepriklausomu evaluator pagal vienodas užduotis |
| [obra/superpowers](https://github.com/obra/superpowers) | MIT įgūdžių/metodikos karkasas ir didelis populiarumas | Naudinga metodikos tyrimui; atskiro native gebėjimo ir runtime kokybės savaime neprideda |
| [text-to-cad](https://github.com/earthtojake/text-to-cad) | MIT, C4 Trending radinys, CAD-generavimo produkto/įrankių kryptis | Išlaikyti C8 deep-dive kandidatą, lyginti su plonu build123d adapteriu |

Šios priežastys nėra bendras teiginys, kad atmesti projektai prasti. Visas [kandidatų registras](../../catalog/candidates.json) atskiria neprieinamą adresą, trūkstamą licencijos šaltinį, dubliavimą, scope bloką ir dar nepasirinktą portfelio kandidatą. Pavyzdžiui, `inkscape/inkscape` tikrintas GitHub adresas yra nukreipimo repo į kitą upstream, todėl čia neskelbiame, kad perskaitėme visą Inkscape source licenciją.

## Tolimesni ciklai ir sustojimo taisyklė

Artimiausias gilesnis ciklas: viso išplėsto baseino griežta capability/license/overlap atranka, Rakazo prieš minimalų branduolį, LT TTS/STT ir cinematic pipeline, Treg live dokumentacija ir oficialus auth tinkamumas, release/CI/issues požymiai ir transityvinės licencijos. Po jo runtime bandymai tik atskirame įgyvendinimo etape. Kiekvienam naujam priimamo modulio pasiūlymui privaloma užduotis ir konkretus priėmimo testas.

Katalogas atnaujinamas kas mėnesį pagal spragas, stars ir Trending, o rekomenduojamos versijos peržiūrimos pagal release riziką. Tyrimo iteracija gali baigtis, kai dvi tikslinės spragų paieškos nesuranda naujo licenciją ir integraciją atitinkančio gebėjimo arba pasiekiamas nustatytas tyrimo biudžetas. Šį kartą nauji vartotojo radiniai pakeitė planą, todėl „viskas GitHub jau rasta“ teiginio neteikiame.

0.2 kasdienio discovery ir upstream watcher grafikas aprašytas [vienoje norminėje specifikacijoje](../AUTONOMY-AND-UPDATES.md#4-konkreti-darbo-politika-ir-periodiškumas); monthly apžvalga skirta bendrai atrankai, ne draudimas rinkti naujus radinius kasdien. Baigtinis vieno run biudžetas nėra bendras katalogo limitas. [Provider/auth peržiūra](../reviews/provider-auth-review.md) ir [autonomijos kritika](../reviews/autonomy-updates-review.md) išlaiko source faktų ir pasiūlymų skirtumą.


## Papildomi routerių ir UI šaltinių ciklai

[Jev/Laya šaltinių atšaka](../../catalog/router-candidates.json) turi15repo įrašų; [UI atšaka](../../catalog/ui-foundations.json) turi šešis kandidatus su gilesniais React/Solid/Electron/transporto įrodymais. Dalis UI repo jau yra istoriniame baseine, todėl šių skaičių nesumuojame į tariamą naują unikalių projektų bendrą skaičių. Ankstesni806adresai/757unikalūs repo lieka to snapshot statistika. Abi papildomos atšakos source-only, runtime NOT_RUN ir nesukuria naujų kokybės balų. [Routerio sprendimas](../ROUTER-EVALUATION.md), [UI pagrindas](../UI-FOUNDATIONS.md).
