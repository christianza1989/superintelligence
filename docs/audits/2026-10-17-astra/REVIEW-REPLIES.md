# Galutiniai atsakymai dėl įgyvendinimo sekos ir Library

**Statusas: recommended, not implemented.** 2026-10-17. Tai ankstesnio nepriklausomo audito patikslinimas, skirtas pagrindiniam įgyvendinimo pokalbiui. Kanoniniai dokumentai ir produkto kodas šiame darbe nekeisti. Nauji testai, generacijos ir mokami kvietimai neatlikti.

Audito atskaitos commit: `fe14bdd4fb9cd8805938e1169a4bd2d13961bb86`. Šiam atsakymui papildomai perskaitytos aktualaus checkout MVP/ROADMAP dalys, dokumentų įvadai, observer sąsajos ir `catalog/popularity.json`; naujas fetch ar viso repo pakartotinis auditas neatliktas. Ankstesni įrodymai: [AUDIT.md](AUDIT.md), [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md), [EVIDENCE.json](EVIDENCE.json). Toliau pateikti ID yra siūlomi papildomi checklist ID, ne jau priimti vartai.

## 1. Techninis preview, MVP ir vieša beta turi skirtingus vartus

Pirmoji CSV vertikalė yra architektūros įrodymas ir dalis coding gebėjimo. Ji neužbaigia MVP. Mano anksčiau pateiktas REA/image-editor pavyzdys yra plėtros ir perkeliamumo bandymas; jis nepakeičia norminio browser/research modulio. 27 generacijų A/B/C pasiūlymas yra atskiras tyrimas ir nepakeičia esamų 30 MVP kūrimo užduočių.

| Etapas | Konkretus rezultatas | Dar neuždaryti vartai |
|---|---|---|
| Pirmas techninis preview | Vienas tikras esamo worker kelias: užduotis → pasirinkimas/paruošimas → vykdymas → artefaktas → atskiras tikrintojas. Emuliuotas modelis leidžiamas su matomu žymėjimu. Lygiagrečiai Library galima savarankiškai naršyti. | Produkto/modelio kokybė, gyvas pasirinktas Jev profilis, trys moduliai ir vieša beta |
| Techninis produkto MVP | Vienas kvalifikuotas vietinis profilis, realus pagrindinis modelis, pasirinktas ir gyvai patikrintas Jev/OpenRouter ToolSelector, browser/research + PDF + coding, savarankiška Library ir ribotas naujo projekto reuse kelias. | Platesnis REA/Treg, autonominis leidimų ciklas, platinimas ir beta vartai |
| Vieša beta | Ankstesnis MVP ir visi jam taikomi G2/G3A–G3D/G4 vartai, REA static, Treg read-only bei tikroji provider/auth matrica; nepriklausomas naujas naudotojas. | Neįvykdyti OS/profilių ir vėlesnio portfelio vartai lieka aiškiai atviri |

Siūlomas konkretus checkbox karkasas:

- [ ] **TP0 — siauras root CI.** Vykdo pasirinktų Zero paketų patikras iš repo šaknies; nėra paveldėto publish/deploy į upstream.
- [ ] **TP1 — offline worker vertikalė.** Esamas scheduler/worker, kontroliuojamas input, tikras komponento paruošimas ir paleidimas, išsaugotas artefaktas bei nepriklausomas validator. Modelio emuliacija pažymėta. Priklauso nuo TP0 kaip merge patikros, bet įgyvendinimas gali vykti lygiagrečiai.
- [ ] **TP2 — scenarijaus gedimai.** Cancel/restart/timeout ir pakartotas pranešimas nedubliuoja efekto; aiškios failed/blocked/unknown baigtys. Priklauso nuo TP1. Šis siauras rinkinys nepakeičia viso G1.
- [ ] **M0 — palaikomas profilis ir G0/G1.** Užfiksuoti runtime/model/auth, pin/lock, išmatuoti resursai, existing fault/backup/reconnect kriterijai. Bazės dydžio ar 50 fault vykdymų reikalavimo tyliai nemažinti.
- [ ] **M1 — pasirinkto gyvo profilio apskaita.** Prieš kiekvieną palaikomą mokamą dispatch yra tinkamo account ir lane atominis rezervas; call/usage/receipt susieti. Neapimami alternatyvūs modeliai ar child kvietimai aiškiai uždrausti šiame profilyje, kol kvalifikuoti.
- [ ] **M2 — Jev gyvas ToolSelector.** Tikri shortlist/abstain sprendimai pasiekia workerį ir lemia leistino tool naudojimą; actual account/model/usage, gedimai ir caps patikrinti. Priklauso nuo M1 ir 3 skyriaus J1/J2. Vien source rekomendacijų CLI to neuždaro.
- [ ] **M3 — browser/research.** Savi/sintetiniai puslapiai → ribotas tyrimas → šaltinių ataskaita ir domeno patikra.
- [ ] **M4 — PDF.** Originalas → CSV/JSON lentelės → reikšmių ir puslapių kilmės patikra.
- [ ] **M5 — coding ir P2.14.** Seeded klaida → mažas diff → izoliuoti testai/smoke; papildomai naujo projekto bazė/komponentas → build → preview → testas → source/lock perdavimas.
- [ ] **M6 — trijų sričių priėmimas.** Su užfiksuotu realiu modeliu vykdytos visos 30 iš anksto aprašytų užduočių, bent 24/30 ir bent 7/10 kiekvienoje srityje; failures matomi, privalomi permissions/budget/cancel/restart atvejai praeina. Priklauso nuo M0–M5. Tai dev acceptance, ne nepriklausomas pranašumo benchmark.
- [ ] **M7 — savarankiška žmogaus Library.** 5 skyriaus L1–L5, be būtinybės pradėti AI pokalbį. Paieškos dalis nepriklauso nuo M1/M2; tik vykdymo handoff priklauso nuo veikiančio projektų kelio.
- [ ] **M8 — pirmas naudotojas ir esama UI apimtis.** Naujas žmogus gauna artefaktą, supranta patikros ribas; išlaikomi esami M1 UI, lokalizacijos ir reconnect reikalavimai. Naujasis trumpas sąrašas jų neatšaukia.
- [ ] **B1 — platesni privalomi profiliai.** REA static G3B ir Treg P2.11–P2.13 su tikromis paskyromis/profiliais; kiekvienas turi savo evidence, o ne bendrą integracijų skaičių.
- [ ] **B2 — beta.** Visi taikomi G2/G3A–G3D/G4 ir supported matrica. P4D kelių desktop OS kvalifikacija išlieka atskiru etapu.

Preview = TP1+TP2, su TP0 pristatymo kontrole. MVP = M0–M8. Beta = MVP+B1+B2. Library įgyvendinimas ir offline vertikalė gali judėti paraleliai, kol gyvas profilis blocked. ROADMAP išlieka visų vartų autoritetas; MVP-ROADMAP turi į juos rodyti. Taip išvengiama antro tarpusavyje nesutampančio kriterijų rinkinio.

## 2. Pirmas pakeitimas turi būti mažesnis už visą account brokerį

Ankstesnė mano pirmojo rezultato eilutė buvo per plati vienam PR. Root CI, observer scope, bendras account rezervavimas ir fallback/child kvalifikacija yra atskiri darbai. Rekomenduoju tokią skaidą:

| Pakeitimas | Failų riba | Priėmimo esmė |
|---|---|---|
| A: root CI | Vienas naujas `.github/workflows/zero-checks.yml`; tik prireikus esamų script komandų korekcija | Tik būtinos offline/type/regression patikros; jokių credentials/publish/deploy. Nekopijuoti visų `platform/.github` workflow |
| B: request observer jungtis | `platform/packages/adapter-kit/src/types.ts`, `platform/packages/adapters/src/pi-runtime.ts`, `platform/packages/adapters/src/pi-usage.ts`, tiksliniai jų testai | Observer perduodamas konkretaus `AgentRunRequest` kontekste; tas pats `callId` pasiekia beforeCall, usage ir reservation susiejimą. Du lygiagretūs run nesumaišo savo observer. Observer atsisakymas reiškia nulį modelio dispatch |
| C: pirmo live profilio įjungimas | `platform/packages/adapters/src/executor.ts`, mažas naujas observer adapteris greta, worker composition tik jei reikia, tikslinės esamo budget primitive patikros | Trusted resolver sukuria request scope pagal realų connection/account. Vienas pagrindinis modelis ir atskiras pasirinktas Jev kelias naudoja tą patį account limitą, jei tai ta pati mokėtojo paskyra; routing turi ir savo lane cap |
| D: fallback/child plėtra | Tik resolver/fallback/child keliai ir jų regression | Kiekvienas tikras target turi savo teisingą account/model/call tapatybę. Įjungti tik po šio priėmimo; neleisti paveldėti primary account vien pagal provider pavadinimą |

**Mažiausias prasmingas runtime PR yra B, be DB migracijos ir be gyvo profilio įjungimo.** Dabartinis `observedPiStream` jau generuoja `callId` ir turi prieš dispatch kviečiamą observer. Trūksta request scope ir to paties ID perdavimo rezervavimo grandinei. Nereikia pirmiausia projektuoti invoice/refund/subscription platformos ar naujos universalios schemos.

B turi pasirinkti request observer vieną kartą konkretaus run pradžioje ir nuosekliai perduoti jį pagrindiniam bei helper keliui. Globalus kintamas `currentRun` netinka, nes worker turi konkurentinį vykdymą. Jei paliekamas constructor observer suderinamumui, precedence turi būti aiški; jo buvimas savaime nepadaro Zero live profilio kvalifikuotu.

C galima pradėti su esamais `zero-budget.ts` atominiais, baigtiniais rezervais: vienas invocation/call ID, account rezervas ir atskira routing riba. Existing `onUsage`/unique callId lieka išlaidų įrašo autoritetu; observer antrą kartą tos pačios išlaidos neįrašo. Nežinomo dispatch/usage rezervas lieka hold, kol sutaikytas. Konservatyvus rezervų negrąžinimas pirmajame profilyje yra priimtinas su matoma išnaudoto limito būsena; tai nepateisinimas rodyti numatomą kainą kaip tikrą provider sąskaitos garantiją.

Svarbi tapatybės detalė: dabartinis `AgentRunModel.accountId` skirtas Cloudflare gateway. Jo negalima pervadinti ar panaudoti kaip universalaus mokėtojo account ID be atskiro kontrakto. Patikimas mapping ateina iš connection/credential resolver, ne iš modelio teksto. Nustatytas vieno OpenRouter account limitas turi būti bendras ir pagrindiniam modeliui, ir Jev, jeigu jie jį naudoja.

**Offline vertikalė gali būti kuriama lygiagrečiai su B/C.** Naudoti esamą worker, emuliuotą modelį ir tikrą lokalų komponento build/invoke/verifier. Nenaudoti provider credentials ir leisti tik apibrėžtus paruošimo šaltinius. Mokamo profilio dispatch lieka uždarytas iki C priėmimo; UI to neslepia. Tai leidžia patikrinti artefaktų ir reuse grandinę, nelaukiant visos billing schemos. Emuliacija negali uždaryti M2/M6 ar pagrįsti Jev naudos.

Pirmam C profiliui model fallback ir mokami child kvietimai gali būti aiškiai išjungti. Jei profilyje jie leidžiami, D tampa būtina priklausomybe prieš live. Tai taikoma ir netiesioginiams helper/repair keliams, ne tik matomai UI parinkčiai.

## 3. Pasirenkamas tiekėjas ir naudotojo pasirinkto Jev užbaigimas

Produkto branduolys gali turėti keičiamą, neprivalomą Jev adapterį. Tačiau naudotojas pasirinko Jev/OpenRouter šio MVP profiliui: baseline fallback neuždaro to pasirinkimo įgyvendinimo. Atitinkamai reikia keturių atskirų eilučių:

| Vartas | Ką patvirtina | Kas jo neuždaro |
|---|---|---|
| **J0: adapteris** | Sąsaja, offline schema, shortlist/abstain, klaidų apdorojimas | Paskyros prieiga, faktinė kaina, gyvas įrankio panaudojimas |
| **J1: pasirinktas profilis** | Tikras model/API/auth/connection, baigtinis routing ir account limitas, aiškiai pasirinktas naudojimas | Vien secret buvimas ar dokumente nurodytas modelio vardas |
| **J2: live conformance** | Tikras end-to-end sprendimas per worker; positive atveju leistinas tool parinktas ir realiai panaudotas; no-fit atveju abstain; timeout/schema/grant/cap bei usage receipts | Standalone CLI, vien deterministinis baseline arba visi atvejai abstain |
| **J3: papildomos naudos matavimas** | Užšaldyto B prieš C palyginimo kokybė, sprendimo aprėptis, klaidingi pasirinkimai, visas laikas/kaina, aiški išvada | Vien gyvas API atsakymas arba viena sėkminga programa |

J3 bandymas gali būti **atliktas** ir parodyti „nauda nenustatyta“ ar „šiame profilyje C blogesnis“. Atskirai žymėti „naudą įrodė“; tai nėra tas pats checkbox. Jei C neprideda naudos, baseline gali likti produkto rekomenduojamas numatytasis kelias. J1/J2 vis tiek reikalingi naudotojo pasirinktai integracijai užbaigti; jos tyliai neištrinti iš plano.

Pirmas vertas matavimo atvejis: **pasirinkti vieną iš kelių jau aprašytų, leistinų tool/capability variantų arba abstain pagal konkretų poreikį**. Pavyzdžiui, PDF darbe atskirti struktūruotos lentelės išgavimą, OCR reikalaujantį input ir paprastą teksto išgavimą. Kandidatai turi turėti tikrus input/output ir pasirengimo faktus; jei OCR kelias dar neparuoštas, jis negali būti vykdomas kaip paruoštas. Galima mažesnė analogiška coding/CSV tool imtis, jei ji pirmiau realiai veikia.

Pradėti tik tada, kai retrieval pateikia prasmingą mažą kandidatų rinkinį. Jev netaiso katalogo situacijos, kai tinkamo kandidato išvis nėra. Lyginti deterministinį B su tuo pačiu B+Jev C; pagrindinis modelis, tools, grants, užduotis ir grader tie patys. Įtraukti multi-candidate pasirinkimą, aiškų tinkamą kandidatą ir no-fit atvejį. Vertinti pasirinktą ir faktiškai panaudotą įrankį bei galutinį rezultatą, ne vien selection score.

Repo relevance atranka taip pat naudinga tyrimui, bet vien source-only repo rekomendacija neuždaro dabartinio P1D.7/M1 ToolSelector vykdymo vartų. Jeigu šį vartą norima pakeisti, reikalingas aiškus dokumentuotas sprendimas, o ne nauja žodžio „integruota“ reikšmė. Model routing ir universalų repo kokybės balą atidėti, kol yra tikri palyginamų profilių duomenys.

## 4. Dokumentų tvarkymas: vienas dabarties įėjimas ir išsaugota istorija

Vienas trumpas dabartinės architektūros ADR turi fiksuoti Rakazo pasirinkimą, esamą worker, ploną reuse sluoksnį, Library kaip savarankišką įėjimą ir profilių ribas. `docs/IMPLEMENTATION.md` turi rodyti tik faktiškai priimtą būseną su evidence. `ROADMAP.md` saugo norminius vartus; `MVP-ROADMAP.md` yra jų etapų santrauka. `PROJECT-V1.md` lieka produkto paaiškinimas, aiškiai skiriantis dabartį ir planą.

| Dabartiniai failai | Rekomenduojamas veiksmas |
|---|---|
| `PLAN.md` pradinis 2026-10-16 planas | Išsaugoti visą datuotą originalą archyve; šaknies įėjimą sutrumpinti iki nuorodų į priimtą ADR, dabartinę būseną ir roadmap. Nebelaikyti nepasirinktos bazės aktyvia alternatyva |
| `docs/research/README.md`, `TOP100.md`, `SPECIAL-CANDIDATES.md`, `MEDIA-CANDIDATES.md`; `docs/reviews/*.md` | Datuoti research/review istorija, pažymėti analizuotą commit ir kas vėliau superseded. Pašalinti iš „ką dabar įgyvendiname“ navigacijos. Jei perkeliama fiziškai, išlaikyti nuorodų atitikmenis; ne visos rekomendacijos savaime tampa sprendimais |
| `docs/research/CANDIDATE-POOL.md` | Išsaugoti source inventorių ir provenance. Dabartinį indeksą generuoti iš vieno katalogo šaltinio; seną tekstinį snapshot pažymėti data. Neprarasti duomenų vien dėl aplanko pavadinimo „research“ |
| `docs/PROJECT-ANALYSIS-2026-10-17.md`, šis auditas | Datuotos analizės, ne nuolat perrašomas produkto statusas. Nuoroda iš dabarties įėjimo ir aiški analyzed SHA riba |
| `docs/CLAUDE-CALIBRATION.md`, `LEAN-CALIBRATION.md`, `STOCKDESK-CALIBRATION.md` ir istorinių rezultatų dalys `CALIBRATION.md` | Išsaugoti kaip eksperimentų ataskaitas su model/CLI/prompt/grader/source versijomis. Atskiras aktualus metodikos įėjimas gali rodyti į jas. Senų kohortų „aktyvus“ žodžius pakeisti archyvo statuso antrašte, o ne perrašyti rezultatus |
| `docs/CONTRACTS.md`, `PROJECT-CREATION.md`, `TOOL-DIRECTORY.md`, `AGENT-CAPABILITIES.md`, `MODULE-SELECTION.md`, `AUTONOMY-AND-UPDATES.md` | Palikti aktyvias specifikacijas, priderinti prie ADR; kiekvienai atskirti implemented/designed/blocked dalis ir susieti su vartais. Schema pavyzdys lieka dizainu, kol egzistuoja tikras vartotojas |
| `docs/ROUTER-EVALUATION.md`, `JEV-APPLICATIONS.md` | Atskirti datuotą source tyrimą nuo aktyvaus adapterio kontrakto/profilio. Seni „gyva integracija dar nebandyta“ sakiniai apibūdina konkrečią datą; naują būseną turi patvirtinti tikri receipts |
| `docs/ZERO-LAB.md`, `PAIRED-BENCHMARK.md`, `BUDGET-FOUNDATION.md`, `LOCAL-LAB.md` | Išlaikyti palaikomą metodiką/runbook ir tikrą įgyvendinimo apimtį. Budget foundation nėra visas brokeris. Eksperimentų results atskirti nuo metodo |
| `CLOUD-WORKSPACES.md`, `VIDEO-HUB.md`, `CONTRIBUTOR-PORTAL.md`, `COMMUNITY-QUALITY.md`, `GROWTH-AND-OUTREACH.md`, `PUBLIC-WEBSITE.md` | Palikti atsekamas būsimas specifikacijas su stage/gate. Atidėta funkcija nėra klaidingas istorinis dokumentas; jos nepaslėpti taip, tarsi produkto reikalavimas panaikintas |

Prieš fiziškai perkeliant failą patikrinti jo importus/nuorodas ir generatorių vartotojus. Konkrečios archyvo vietos pasiūlymas: `docs/archive/2026-10-16-planning/` ir `docs/experiments/`; tai ne reikalavimas atlikti masinį rename vien dėl tvarkos. Visą turinį galima pirmiausia klasifikuoti vietoje su autoriteto antrašte ir vienu indeksu. Ši lentelė nėra leidimas naikinti nežinomą dokumentą pagal glob.

**Neliečiami įrodymai:** originalūs failures, JSON/logs, input/prompt/grader hash, source pins, lockfiles, LICENSE/NOTICE ir `docs/ORIGIN-AND-ATTRIBUTION.md`, upstream kilmė. StockDesk v1 grader spraga lieka v1 istorijoje; v2 kontrolės jos retrospektyviai neištaiso. Dabartinis 53/54 kvalifikacijos failure nepaverčiamas PASS vien dėl vėlesnių offline regresijų. Trečios šalies licencijų/notices negalima „archyvuoti“ taip, kad jų neliktų platinamame produkte.

Kiekvienas statuso įrašas turi skirti: **padaryta**, **suprojektuota**, **užblokuota**, **istorinis rezultatas**, **pakeistas sprendimas**. „Dokumentas parašytas“ checkbox galima uždaryti; jo aprašomos funkcijos checkbox lieka atviras.

## 5. Savarankiška Library yra MVP funkcija; Trending nėra jos pradžios priklausomybė

Naudotojo patikslinimas aiškus: žmonės patys atranda įdomius repo ir iš jų pradeda projektus. **Library turi atskirą nuolatinį navigacijos įėjimą ir veikia be AI užduoties.** Joje matomas platus indeksuotas source katalogas, įskaitant neparuoštus įdomius projektus. „Ready“ yra pasirenkamas filtras. Paieška ir stars rūšiavimas neturi naudoti mokamo LLM.

Minimalus naudingas MVP:

- [ ] **L1 — paieška ir filtrai.** Ieškoti pagal pavadinimą, aprašą, kategoriją/capability; filtruoti kategoriją, žinomą programavimo kalbą, licencijos faktus ir patikros būseną; archyvuotumą rodyti aiškiai. Trūkstamas laukas turi `unknown` reikšmę. Paieškos/filtrų būsena išsaugoma grįžus iš repo puslapio.
- [ ] **L2 — populiarumas su data.** Stars skaičius, jo šaltinis ir nuskaitymo laikas; rūšiavimas „Daugiausia stars“ ir „Neseniai įtraukta“. Pastarasis reiškia įtraukimą į mūsų indeksą, ne repo sukūrimą. Nežinomi stars nerodomi kaip 0. Paaiškinta, kad rūšiuojamas mūsų indeksuotas katalogas, ne visas GitHub.
- [ ] **L3 — repo informacija ir evidence.** Trumpas panaudojimas, upstream nuoroda, metadata data, licencijos šaltinis ir atskirai mūsų source/pin/tested/runtime-ready faktai. Žmogus gali apžiūrėti source-only repo. „Populiarus“ ir „patikrintas šiame profilyje“ yra skirtingi rodikliai; universalaus „geriausias“ balo nežadėti.
- [ ] **L4 — Saved.** Paprastas vietinis išsaugojimas tarp sesijų. Tai tiesiogiai padeda grįžti prie atradimo ir nereikalauja Collections, cloud sync ar naujos paskyros sistemos.
- [ ] **L5 — Pradėti projektą.** Pasirinktas repo ir jo turimi faktai perduodami esamam projekto kūrimo srautui kaip foundation/component/reference kandidatas. Naudotojas įrašo norimą rezultatą; source-only atveju sistema pirmiausia tiria ir paruošia, rodydama apribojimus. Browse/save nieko neįdiegia. Handoff turi veikti, o ne vien atidaryti bendrą tuščią composer.

**Compare** naudinga trumpa antroji iteracija: 2–3 repo sugretinimas pagal tuos pačius turimus faktus, be AI. Ji gali būti MVP dalis, jei nereikalauja naujos infrastruktūros, bet nėra priežastis stabdyti L1–L5. **Collections**, redakcinės atrankos, bendruomenės balsai, sudėtingas maintenance score ir personalizacija gali laukti. Paprasti tikri last-push/archived faktai naudingi, kai juos turime; iš jų negaminti nepagrįsto universalios kokybės reitingo.

Svarbus papildomas radinys: audituotoje produkto katalogo projekcijoje nėra stars/language, tačiau **`catalog/popularity.json` jau yra istorinis populiarumo tyrimas**: 18 source įrašų, 150 cumulative-stars observations ir 45 trending observations. Tai observations skaičiai, ne unikalūs repo. Yra source URL ir timestamp, pavyzdžiui `2026-10-16T00:15:51.288439+03:00` (= `2026-10-15T21:15:51.288439Z`). Lauko vardas `retrieved_at_utc` nereiškia, kad jo reikšmė jau normalizuota į `Z`; parsinti offset.

Tą failą galima panaudoti kaip aiškiai datuotą pradinį snapshot, susiejant pagal kanoninį repo ID ir neklastojant pilnos 796 įrašų aprėpties. Reikia vieno metadata projection ir riboto refresh/cache proceso, ne rankomis suvestų maketo stars. Naujo nuskaitymo nesėkmė palieka paskutinį sėkmingą snapshot su sena data, o ne apsimeta atnaujinimu. Public metadata snapshot laikas yra atskiras nuo vykdymo source pin.

**Trending turi dvi teisėtas skirtingas reikšmes.** Galima rodyti datuotą „GitHub Trending, daily/weekly, nuskaityta…“ source rank, jeigu turime tokį snapshot. Tokiam istoriniam source rank nebūtina mūsų pačių dviejų datų stars istorija. Tačiau teiginiui „+N stars per 7 d.“ arba mūsų pačių augimo rūšiavimui būtini atitinkamo laikotarpio palyginami matavimai ir jų aprėptis. Dabartinis bendras stars skaičius nėra augimas. Nei vieno varianto nereikia L1–L5 užbaigti.

Taigi naujoji Library gali būti naudinga nuo pirmo preview ir privaloma techniniam MVP, net kol dalis repo lieka source-only, Jev profilis dar blocked, o Trending/Collections neįgyvendinti. Žmogaus pasirinkimas yra savarankiškas produkto kelias; AI pagalba prie jo prisijungia pagal poreikį.

---

Dokumento rezultatas — konkreti rekomendacija įgyvendinimo ir kanoninių dokumentų darbui. Šio atsakymo checkboxai sąmoningai nepažymėti: tai **recommended, not implemented**.
