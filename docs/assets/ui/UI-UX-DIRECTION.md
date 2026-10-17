# RepositoryZero UI/UX kryptis

2026-10-17 · Design concept / demo · 7 sugeneruoti PNG ekranai · produkto kodas nekeistas.

**Esama kryptis tinkama kaip pradžia: projektai ir sesijos kairėje, darbas centre, rezultatas atveriamame skydelyje.** Profesionaliam kasdieniam įrankiui reikia mažiau dekoratyvaus lime, mažiau vienu metu rodomų būsenų ir daugiau vietos pačiam darbui. Greta darbo aplinkos **Library yra savarankiška atradimų vieta žmonėms**: joje galima naršyti repo, ieškoti idėjų, filtruoti, išsisaugoti ir pradėti projektą dar nepradėjus jokio pokalbio su AI.

Maketuose naudojamas fiktyvus Image Studio projektas: layers, crop, undo ir PNG export. Tai nėra visos Photoshop programos atkūrimo pažadas. Testų rezultatai, veikimo būsena, modelių profiliai, sąnaudų limitas ir bibliotekos žvaigždučių skaičiai yra demonstraciniai. Jie nėra nauji produkto matavimai. „Canvas Kit“ ir „Vector Canvas“ — iliustraciniai komponentų vardai. Repo bibliotekos makete tikri repo vardai naudojami su aiškiai pažymėtais išgalvotais star counts, ne kaip aktualus reitingas.

## Ką peržiūrėjau

Visi penki šaltiniai atverti kaip vaizdai iš audituoto WSL checkout `docs/assets/ui/`. PNG parodytos sąveikos nepaleistos ir nepatikrintos. Source screenshot nėra dabartinės gyvos UI sesijos įrodymas.

| Failas | Statusas | Kas verta išlaikyti | Ką keisti |
|---|---|---|---|
| `workspace-accounting-concept.png` | Sugeneruota koncepcija | Aiškus project/session kontekstas, darbas šalia preview, matomas Stop | New project, stepper, activity kortelės, checkmark, Jev juosta ir preview statusas kartoja tą pačią informaciją. Ryškus lime ir švytėjimas konkuruoja su rezultatu |
| `tool-directory-concept.png` | Sugeneruota koncepcija | Paieška, filtrai, rezultatas ir detail inspector; sąžininga source-only būsena | Per didelės kortelės mažina apžvelgiamumą; dažni statusai ir paaiškinimai užima daug vietos. Reikia tankesnio list/table ir nepriklausomo discovery kelio |
| `workspace-foundation-screenshot.png` | Esamos bazės screenshot | Paprastas chat ir navigation karkasas | Tuščias turinys ir avatarais paremtas bot sąrašas dar neparodo projekto, failų, rezultatų, review ar naujo naudotojo kelio |
| `directory-foundation-screenshot.png` | Esamos bazės screenshot | Veikiamo katalogo karkaso vaizdas, source paieška, detail ir Open source | Source SHA užima pagrindinį inspector plotą, dar nėra turtingo filtravimo/populiarumo/saved/compare/start-project kelio. Vien kategorijos filtras nepakanka atradimams |
| `site-foundation-screenshot.png` | Esamos bazės screenshot | Atpažįstama juoda/lime tapatybė, aiški reuse idėja | Tai komunikacinis svetainės paviršius. Jo hero dydžiai, dekoratyvus flow ir ryškumas netinka kelių valandų darbo ekranui |

Sutinku su pagrindinės sesijos kritika dėl perteklinių statusų. Papildymas: katalogas negali likti tik užduoties inspektoriumi. Naudotojo patikslinimas aiškiai įtvirtina du lygiaverčius įėjimus — **pradėti nuo darbo** arba **pradėti nuo atradimo**. Nereikia pirma parašyti AI užduoties, kad būtų galima pamatyti repo ir idėjas.

## Faktai ir prielaidos

Faktai: yra web, Electron host ir Expo mobile bazė; shared `ui-tokens` jau turi semantic dark/light ir `system/light/dark` pasirinkimą. Dabartinio dark token lime yra `#B7FF32`, background `#090B09`; maketų siūloma neutralesnė paletė yra dizaino pasiūlymas, ne jau pakeisti tokens. Yra source katalogo UI/data, tačiau audituotame `zero-catalog-data.json` įrašo kontrakte nėra stars/language/popularity metaduomenų. Tam reikės duomenų papildymo, ne vien žvaigždutės ikonos.

Prielaidos: pagrindinis desktop naudotojas dirba ilgomis sesijomis; telefonas dažniau naudojamas stebėti, atsakyti ir tęsti, nei pilnam code diff redagavimui. Naujas naudotojas gali pradėti natūralia užduotimi arba Library radiniu. Maketuose Auto ir paruoštų komponentų būsenos vaizduoja planuojamą architektūrą; dabartiniame produkte jų negalima rodyti kaip įgyvendintų, kol backend grandinė neprijungta.

Impeccable `context` buvo paleistas vieną kartą; jis nerado PRODUCT.md/DESIGN.md. Pagal aiškų užsakovo brief papildomas bendras interviu nedarytas, kanoniniai produkto failai nekurti. Taikyti Operate metodai ir viena bendra vaizdų peržiūra su vienu keturių ekranų pataisymų ratu. Subagentai nenaudoti pagal užduoties ribą; atskiros nepriklausomos UI reviewer agento išvados nėra.

## Informacijos architektūra

Globalūs įėjimai: **New task, Search, Projects, Library, Saved, Settings**. Projektas turi sesijas, artefaktus ir darbo istoriją. Biblioteka ir saved kolekcijos pasiekiamos ir be aktyvaus projekto. Search/command palette leidžia pereiti prie projekto, sesijos, failo, repo, nustatymo ar veiksmo. Library nėra paslėpta už Jev ar „AI tools“ režimo.

Darbo ekrane kairė navigacija priklauso projektui/sesijai. Centre — užduotis, trumpi sprendimai ir pokalbis. Dešinėje atveriamas rezultato arba sprendimo inspektorius; jo plotis reguliuojamas. Terminalas ir žali logs atveriami žemiau arba skirtuke, ne visada užima trečdalį ekrano. Mažame darbe preview gali būti uždaryta, o didelį diff ar dokumentą galima išplėsti.

Rezultato skydelis pagal artefaktą:

| Artefaktas | Pagrindinė peržiūra | Kontekstiniai veiksmai |
|---|---|---|
| Programa | Preview, Files, Changes, Tests | Atidaryti, peržiūrėti diff, tęsti taisymą, eksportuoti projektą |
| Dokumentas | Dokumento/PDF vaizdas, puslapiai, versijos | Redaguoti, komentarai, atsisiųsti, palyginti versijas |
| Tyrimo ataskaita | Turinys ir šaltiniai | Atverti citatą, tikrinti coverage, papildyti ar eksportuoti |
| Vaizdas / video / garsas | Drobė arba player, variantai | Palyginti, peržiūrėti specifikaciją, atsisiųsti |
| Duomenys | Lentelė ir schema, validacijos rezultatai | Filtruoti, patikrinti anomalijas, eksportuoti |

Pirmi šeši maketai naudoja ankstesnį bendrą „Tools“ punktą; septintas rodo vartotojo patikslintą **Library/Saved** globalią navigaciją. Įgyvendinant visus ekranus ją reikia suvienodinti. Tai viena toliau vystoma vizualinė šeima, ne septynios galutinės komponentų specifikacijos.

## Savarankiška repo biblioteka

Library tikslas — padėti žmonėms atrasti įdomų pagrindą naujam projektui, net kai jie dar nežino tikslios užduoties. Naudotojas gali ilgai naršyti nekviesdamas mokamo modelio.

Pirmi paviršiai: **Popular**, **Trending**, **Recently added**, **Collections**; atskirai Saved. Popular turi aiškią star count rūšiavimo taisyklę. Trending reikia žvaigždučių pokyčio per konkretų laikotarpį ir pakankamos istorijos; jo negalima apskaičiuoti iš `updatedAt` ar vien bendro stars skaičiaus. Recently added yra įtraukimo į mūsų katalogą data, ne klaidinanti repo sukūrimo data. Curated kolekcijai rodyti kas ją parengė ir pagal ką atrinko.

Paieška: repo vardas/owner, idėja, užduotis/capability, žymos ir technologija. Filtrai: sritis, library/app/framework/tool tipas, kalba, OS/runtime, local/hosted, licencijos šaltinis/profilis, stars intervalas, maintenance/archived, paskutinis push/release ir mūsų parengtis. Filtrai nėra vienas horizontalus 20 dropdown sąrašas: pagrindiniai matomi, likusieji atveriami „More filters“, aktyvūs filtrai rodomi atšaukiamais žymekliais. Rūšiavimas ir filtrai išsaugomi URL/back navigation; list turi pagination arba prieinamą „Load more“.

Repo eilutė: kanoninis owner/name, trumpas prasmingas aprašymas, svarbiausi tags, stars, kalba ir save. Detail: README santrauka arba source, sąsajos, realios examples/screenshots jei yra, last push/release, licencijos šaltinis, evidence/readiness ir projekto idėjos. Source prieinamumas, patikrintas adapteris ir local-ready laikomi skirtingais faktais; žmonėms rodomas **visas indeksuotas katalogas**, ne tik jau įdiegiami repo.

Veiksmai: Save → private collection; Compare → 2–4 repo lentelė; Open on GitHub; Start a project → esamas projekto/užduoties sukūrimas su pasirinktu source kaip pradiniu kontekstu. Vėlesniame žingsnyje galima pasirinkti „Use as a foundation“, „Add a capability“ ar „Study as a reference“, kai tai tinka repo. Repo peržiūra ar išsaugojimas nieko neinstaliuoja. Source-only projektas gali pradėti ribotą tyrimą, jam neprivalomas jau paruoštas adapteris.

AI gali pasirenkamai paaiškinti repo, palyginti ar padėti suformuoti projektą, tačiau įprastas browse/filter/sort/save neturi mokamo modelio priklausomybės. Stars rodo populiarumą; tinkamumui svarbūs gebėjimai, suderinamumas, priežiūra ir patikros. „Geriausi repo“ turėtų reikšti paaiškinamą konkrečios kolekcijos ar užduoties atranką, ne absoliutų globalų kokybės pažymį.

Duomenų pusė: viešo katalogo metaduomenys atnaujinami atskirai nuo execution-ready pins. Reikia kanoninio repo ID ir rename/alias, stars/forks, pagrindinės kalbos, topics, license source, archived, pushed/release datų, fetchedAt, source API ir nullable unknown. Kešas leidžia naršyti greitai; rate-limit ar fetch klaida palieka paskutinį snapshot su data, o ne paverčia skaičių nuliu. Metadata refresh nepakeičia įdiegto komponento pin. Tai plona esamo katalogo indeksavimo/platinimo plėtra, ne būtinybė kurti naują marketplace servisą.

## Svarbiausios eigos

1. **Nauja užduotis:** pasirinkti projektą/folder arba pradėti tuščią → parašyti tikslą/pridėti failą → prireikus atsakyti į konkretų neaiškumą → vykdymas → atverti rezultatą. Modelio infrastruktūra netampa pradiniu interviu.
2. **Atradimas bibliotekoje:** browse/search/filter → repo detail → saved/collection/compare → Start a project → trumpas darbo brief. Grįžtant iš detail išsaugoti list poziciją ir filtrus.
3. **Vykstantis darbas:** viena aktuali state eilutė → išskleidžiamos detalės → Stop aiškiai pasiekiamas. Naujas komentaras nekeičia jau vykstančio darbo tyliai; backend turi aiškiai nurodyti, ar įtrauktas dabar, ar į kitą žingsnį.
4. **Komponento pasirinkimas:** automatiniam aiškiam pasirinkimui pakanka trumpo „Using … · Details“. Comparison inspektorius atveriamas žmogui paprašius arba kai reikia tikro pasirinkimo. Jo nereikia stabdančio kiekvienai užduočiai.
5. **Peržiūra:** rezultatas ir tikrinimo aprėptis → failed check → konkretus diffo/failure paaiškinimas → Fix and re-run. Peržiūrint jau pataisytą, bet dar nepatikrintą kandidatą rodyti, kuriam artifact revision priklausė ankstesnis testas.
6. **Modeliai ir sąnaudos:** Auto arba Fixed; Auto leidžiami modeliai ir connection scope aiškūs. Advanced routing ir usage atveriami papildomai. Šiuose maketuose modelių vardai placeholder; realiame UI būtinas tikras model/provider/connection identifikavimas. Neįgyvendintas Auto rodomas ne kaip veikiančios magijos jungiklis.
7. **Mobile tęsinys:** rasti tą pačią sesiją → perskaityti svarbų pokytį → atverti rezultatą/review → pateikti pastabą ar tęsti. Mobilus klientas nepradeda antro konkuruojančio darbo.

## Būsenų elgsena

| Būsena | Vartotojas mato | Veiksmas ir semantika |
|---|---|---|
| Empty | Vieną aiškų task input arba bibliotekos pavyzdžius | Start task / Browse library; ne fiktyvų aktyvumą |
| Queued | „Waiting to start“ ir priežastį, jei žinoma | Cancel; ne running animacija |
| Running | Dabartinis prasmingas etapas, elapsed, išskleidžiama activity | Stop; detalių atvėrimas nepertraukia run |
| Stopping | Sustabdymas paprašytas, laukiama backend patvirtinimo | Neapsimesti, kad external effect atšauktas |
| Paused | Konkreti priežastis: naudotojas, limitas, review, ryšys su vykdytoju | Continue/Review/Raise limit pagal tikrą priežastį |
| Failed check | Kuri savybė nepraėjo ir kuri revision tikrinta | Fix and re-run; tas pats artefaktas automatiškai netampa verified |
| Failed execution | Kuri operacija nepavyko ir kas išsaugota | Retry/from checkpoint kai saugu; unknown effect atveju pirmiau patikrinti būseną |
| Completed | Atidaromas rezultatas, tikrinimo aprėptis, neišspręstos dalys | Edit / Export / New task; nėra bendro „viskas saugu“ badge |
| Disconnected UI | Paskutinės žinomos būsenos data ir reconnect | Kliento ryšio praradimas nėra run failure ar permission naujam run |
| Missing connection | Konkretus trūkstamas provider/tool | Connect arba leistina alternatyva, neprašant keys pokalbyje |

State turi vieną backend kilmę. Repeated stepper/checkmarks/chat status/preview footer neturi kurti keturių konkuruojančių tiesų. Jev, SHA, broker reservations ir raw provider usage nėra nuolatinės pagrindinio ekrano juostos; jie atveriami tada, kai padeda įvertinti pasirinkimą, klaidą ar kainą.

## Vizualinė sistema ir temos

Siūlomi dark token orientyrai: background `#18191C`, sidebar `#131417`, surface `#232529`, border `#34363B`, text `#E8E9EB`, secondary `#A8ABB2`, lime `#B7DE58`. Tai mažiau žalias neutralus paviršius nei dabartinėje bazėje. Lime skirtas pagrindiniam veiksmui, mažam brand ženklui ir pasirinktai būsenai, ne kiekvienam checkmark ar visam navigacijos mygtukui. Success, warning, failure ir running semantika atskirta nuo brand accent, kartu naudojant tekstą/ikoną.

System UI sans, nedidelė antraščių hierarchija, 14–16 px desktop tekstas ir maždaug 16 px mobile; kodui tikras mono. 8 px ritmas, kompaktiški 6–8 px controls, nuoseklus icon stroke. List/table tankis didesnis negu pokalbio. Naudoti sutampančius komponentus, ne kiekvienam ekranui kitokį mygtuką. Generuoti rastrai nėra tikslios pixel/token specifikacijos; juose likęs subtilus tonų variantiškumas neturi tapti reikalavimu įvesti dekoratyvius gradients.

Light tema planuojama toje pačioje semantic token sistemoje: šviesūs neutralūs paviršiai, tamsus tekstas, santūrus accent, atskiros hover/focus/disabled/destructive reikšmės. Ji nėra dark spalvų invertavimas. `System` gerbia OS ir leidžia user override. Reikės tikro kontrasto patikrinimo, abiejų temų screenshot ir high-contrast/focus testų įgyvendinus. Šiame rinkinyje sugeneruota tik tamsi tema.

## Responsive, klaviatūra ir prieinamumas

Desktop apie 1200+ px: navigacija + darbas + keičiamo pločio rezultatas. Tarpiniai pločiai: navigacija suskleidžiama, rezultatas atveriamas kaip alternatyvus pilno ploto skirtukas. Mobile: viena skiltis, Activity/Result/Files; detail ir compare tampa atskiru ekranu, ne 3 kolonų miniatiūra. Library filtre mobile atidaromas sheet su aiškiu Apply/Clear, selected filtrai išlieka matomi. Tai pradinis breakpoint pasiūlymas, kurį reikia patikrinti su tikru turiniu ir platformomis.

Ctrl/Cmd K — command palette; Ctrl/Cmd Enter — siųsti pasirinktame composer; Esc uždaro laikiną inspektorių/menu ir grąžina focus, bet savavališkai nestabdo mokamo darbo. Stop turi matomą pavadinimą ir klaviatūros kelią. Pane resizer, tabs, lists, radio/checkbox grupės turi tinkamą keyboard/ARIA elgseną; code diff gauna tekstinį/screen-reader pateikimą. Pasikeitusi būsena paskelbiama ramiai, ne kiekvienas log token.

Mobile touch targets bent 44–48 px, safe areas, virtual keyboard neuždengia composer ir primary action. 200 % zoom, ilgi repo vardai, LT/EN tekstų plėtimasis ir horizontalus diff overflow turi būti tikrinami. Reduced motion: jokių dekoratyvių įėjimų; state transition trumpas ir nebūtinas informacijai suprasti.

## Ekranų sąrašas ir paaiškinimai

| PNG | Paskirtis | Svarbiausias sprendimas |
|---|---|---|
| `01-start.png` | Projektai ir nauja užduotis | Pradėti nuo darbo, ne nuo modelių nustatymo; recent list leidžia grįžti |
| `02-workspace.png` | Vykstanti Image Studio užduotis | Vienas statusas, aiškus Stop, plati artefakto peržiūra; nereikalingi avatarai pašalinti |
| `03-components.png` | Kontekstinis alternatyvų palyginimas | Lyginti task fit ir setup; galima rinktis mažą naują kodą; evidence pagal poreikį |
| `04-review.png` | Diff ir failed check | Konkretus failure ir vienas aiškus Fix and re-run kelias; pavyzdinė kodo ištrauka sutvarkyta |
| `05-connections.png` | Jungtys, Auto/Fixed ir limitas | Auto renkasi tik leistus profilius; sąnaudos aiškiai vadinamos įverčiu |
| `06-mobile.png` | Stebėjimas ir tęsinys | Trumpas task kontekstas, artefakto thumbnail, failure ir Continue fixing; nėra suspausto desktop redaktoriaus |
| `07-library.png` | Nepriklausoma žmogaus repo biblioteka | Paieška, filtrai, stars/popular/trending, Saved, Compare ir Start a project be privalomo AI pokalbio |

Viešo rinkinio galutiniai failai, SHA-256 ir dydžiai pateikti [manifest.json](manifest.json), ekranai — [galerijoje](README.md). Originalai `initial/` ir visos generacijos/refinement užklausos išsaugotos vietiniame audito artefaktų pakete; jos nėra šios viešos kopijos dalis. Senieji du konceptai — datuotame karantine.

## Peržiūros išvada ir likusios ribos

Vizualiai peržiūrėti visi 7 pradiniai ir 4 patikslinti PNG. Viename pataisymų rate sutvarkytas darbo ekrano akcentas, kodo pavyzdys/klaidos tekstas, limitų žodynas ir mobile thumbnail. Septintas ekranas pridėtas po tiesioginio naudotojo patikslinimo. Daugiau poliravimo ratų nedaryta.

Šeima pakankamai nuosekli krypčiai aptarti, tačiau tai nėra „tobulas“ patikrintas UI: tikras keyboard/focus, responsive, screen-reader, light theme, model connection ir recovery elgesys neišbandyti. Inspector ir chat maketuose yra nedideli density/label skirtumai; įgyvendinant reikia vieno komponentų rinkinio. Nauja Library navigacija turi būti perkelta į visus ekranus. PNG testų skaičiai nesusiję su 147 architektūros audito testais.

## Įgyvendinimo vieta ir seka

Naudoti esamus `apps/web`, `apps/desktop`, `apps/mobile`, shared `ui-tokens`, `ui-web`, `chat-ui` ir produkto contracts. Nereikia naujo frontend framework ar antro app shell. Pirma išskirti bendrą navigation/split pane/state row/artifact viewer/table/filter vocabulary; tada jungti realų Run ir artifact modelį. Būsenos/grants/sąnaudos ateina iš backend, ne iš gražaus maketo teksto.

Library gali augti lygiagrečiai su pagrindine reuse grandine: papildyti source metadata, filters/sort, details, Saved/collections ir start-project kontekstą. Bazinis discovery neturi laukti visų repo runtime verification. O `Ready locally` neturi atsirasti vien todėl, kad repo išsaugotas ar populiarus.

Pirmą UI vertikalę patikrinti su nauju žmogumi: ar jis be paaiškinimo pradeda darbą; kitu scenarijumi — ar be AI pokalbio atranda tinkamą repo, išsisaugo, palygina ir pradeda projektą. Matuoti užduoties užbaigimą, klaidas, grįžimą prie ankstesnio darbo ir first verified result, o ne tik „patiko maketas“.
