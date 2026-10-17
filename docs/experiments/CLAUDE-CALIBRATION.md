# Claude prenumeratos kalibravimas

> **Istorinė eksperimento ataskaita · uždarytas 2026-10-17 snapshot.** Išsaugoti rezultatai, failures, modelių ir tikrintuvų versijos. Žodis „aktyvus“ žemiau reiškia to bandymo laiką. Dabartinis metodas: [CALIBRATION](../CALIBRATION.md); produkto būsena: [IMPLEMENTATION](../IMPLEMENTATION.md).

Geriausias patvirtintas šios užduoties opt-in profilis: **Sonnet 5.5 / low, lean-v1 sisteminės instrukcijos ir keturi vietiniai įrankiai**. Trys naujos kaitaliojamos poros: **6/6 automatinių patikrų PASS**. Visų trial laikų suma −61,61 %, CLI API kainos ekvivalentas −68,69 %, visi tokenai −87,74 %. Trial mediana −48,95 %; vienos ilgesnės baseline sesijos įtaka nepaslėpta. Tai vienos užduoties visos konfigūracijos rezultatas, ne bendras Jev, runtime ar prenumeratos mokesčio pranašumas. [Visi rezultatai](../../catalog/claude-cohort-results-2026-10-16.json).

2026-10-16. **Importuotas vietinis Claude CLI bandymas, perskaičiuotas palyginimas ir pakartotinai patikrintos abi sugeneruotos programos.** Tai to paties Claude CLI su statiniu Zero katalogo kontekstu ir be jo palyginimas. Pilnas RepositoryZero runtime, Jev ir Auto šiame bandyme nedalyvavo.

Mašininė santrauka: [catalog/claude-calibration.json](../../catalog/claude-calibration.json). Naudotas `claude-sonnet-5-5`, effort `high`, oficialus Claude CLI 2.1.292 su first-party prenumeratos prisijungimu, Node24/Linux x64. CLI įrašytas modelis nėra nepriklausoma provider attestation.

## Antra pora: promptas v2

| Metrika | Claude baseline | Claude + Zero kontekstas | Pokytis |
|---|---:|---:|---:|
| Visas trial su tikrinimu |266351ms (4:26,351)|200449ms (3:20,449)|−24,74%|
| CLI kūrimo etapas |200251ms|162656ms|−18,77%|
| Nepriklausomas tikrinimas |66028ms|37742ms|−28286ms|
| Normalizuoti input tokenai |349922|332054|−5,11%|
| Output tokenai |26097|23127|−11,38%|
| Visi tokenai |376019|355181|−5,54%|
| Faktinė prenumeratos kaina |Nežinoma|Nežinoma|Nevertinta|

Tai **viena sėkminga kalibravimo pora**. Dalis viso trial laiko skirtumo atsirado tikrintuve; iš šios poros negalima išvesti25% bendro modelio ar produkto pagreitėjimo. Provider cache nekontroliuotas. Claude necache input, cache creation ir cache read sudedami po vieną kartą; tai nėra vienodo tarifinio svorio išlaidų suma. CLI pateiktas API kainos ekvivalentas nėra prenumeratos mokestis.

Abu variantai praėjo API8/8, tikro SQLite įrašo išlikimą po app konteinerio perkrovimo ir desktop1440×900/mobile390×844 klaviatūros create→move→API readback→reload, overflow bei runtime klaidų patikras. Pirmas šioje poroje vykdytas Zero variantas. `automatedContractComplete` apima tik deklaruotą automatinį kontraktą; subjektyvus dizainas ir visi papildomi UI srautai neįvertinti. Laimėtojas ir automatinis profilio promotion nenustatyti.

## Įrodymų patikra ir ankstesnės nesėkmės

Perdavimo paketo53išvardytų failų hash patikrinti; patikrinta visų13source failų pradinė būsena:10esamų failų hash sutapo su aktualia šaka,3naujų kelių joje dar nebuvo. Patikrinti20antro bandymo source digest, abiejų pilnų promptų hash ir baitais vienodas naudotojo užduoties tekstas. Palyginimo rezultatas perskaičiuotas iš originalaus reporto. Hash patvirtina turinio atitiktį, ne provider sąskaitą ar originalaus vykdymo laikmatį.

Abi antros poros programos dar kartą vykdytos šioje cloud aplinkoje: tas pats candidate source digest, API/SQLite/UI PASS ir cleanup PASS. Kandidatų kodas vykdytas tik ribotuose Docker konteineriuose, be raktų ir host naršyklės. Šis pakartotinis vertinimas turėjo **0naujų coding CLI ar modelio kvietimų**; jo laikas nepridėtas prie originalių lenktynių ir nelaikomas nauju kūrimo bandymu.

Pirmos poros promptas v1 išsaugotas. Abu variantai praėjo API, tačiau originalus SQLite tikrintuvas klaidingai atmetė WAL režimą. Pataisius tikrintuvą ir be naujų modelių kvietimų pakartojus vertinimą, SQLite PASS; abiejų UI liko FAIL dėl tikslių antraščių pavadinimų. Ši pora nepaversta sėkmingu v2 pakartojimu.

Tikrinimo v2 kopijuoja iki64MiB DB/WAL/journal į atskirą ribotą tmpfs, kuriame SQLite gali atkurti WAL indeksą; originalus tūris lieka read-only. Promptas [PROMPT.v2.md](../../benchmarks/sprintdesk-v1/PROMPT.v2.md) prieš naują generavimą paaiškina jau buvusį reikalavimą: vienintelės accessible headings `Todo`, `In progress`, `Done`, skaitikliai už jų accessible name. Originalus [PROMPT.md](../../benchmarks/sprintdesk-v1/PROMPT.md) nepakeistas. Graderio UI vartai nesušvelninti; skirtingos promptų ir grader versijos nepaverčiamos viena kohorta.

Importuotas archyvas, originalūs reportai, programos ir screenshotai išlaikyti privačiame ignoruojamame `.artifacts/handoffs/claude-lab-20261016/`. Jie nėra diegiami į produkto šaknį ar automatiškai viešinami. Vieša santrauka neturi vietinių paskyrų ir auth duomenų.

## Kitas ribotas etapas

- [x] Įgyvendintas `lab:cohort`:1–3poros, kaitaliojama eilė, source/prompt freeze, atskiri coding/grading laikai, baigtiniai limitai ir nesėkmių išlaikymas. Offline bei realus dry-run patikrinti; naujų modelių kvietimų nėra.
- [x] Atskiras `zero-compact-claude-v1` kandidatas; senasis profilis išlaikytas.3614→2234payload baitai apima ir6→5kandidatų pokytį; tas pats retained rinkinys3202→2234. Tai nėra tokenų ar kokybės naudos matavimas.

- [x] Su ta pačia source/grader versija atliktos 3 papildomos v2 poros: baseline→Zero, Zero→baseline, baseline→Zero. Visos 6 programos praėjo automatinį kontraktą; promptas ir tikrintuvas tarp bandymų nekeisti.
- [x] Prieš pirmą naujos kohortos sesiją užfiksuoti source/prompt/profile hash; visi 23 source hash patikrinti ir po abiejų žemiau aprašytų etapų. Promptas ir tikrintuvas nepakeisti, nesėkmės išsaugotos. Naujo CLI parserio hardening naudos senieji skaičiai nematuoja.
- [x] Pakartojimų kodavimo, tikrinimo ir viso trial laikai, cache read/write bei faktinės kainos nežinomybė išanalizuoti atskirai. Naujo adapterio/grader hash nesutampančios kohortos nesujungtos.
- [ ] Parengti kitą užduotį: vietinis CSV importas, validacija, dublių aptikimas, SQLite išlikimas ir export. Pirma patvirtinti užduoties tekstą, nepriklausomą graderį ir jo negative control, tik tada generuoti abi programas.
- [ ] Kelių užduočių validavimas ir atskiras holdout prieš bendresnį kokybės/greičio teiginį.

## Nauji vietiniai paleidimai: modelis neprieinamas

2026-10-16 iš švaraus `main` commit `7542de4` vykdyti abu atskiri etapai. Claude CLI 2.1.292 first-party prenumeratos prisijungimas, Docker, pinned image ir naršyklės prerequisite patikros praėjo. Praėjo 93 offline bei 27 Docker regresijos, iš viso 120; tarp jų tikras SQLite/WAL, duomenų praradimo negative control ir desktop/mobile klaviatūros bei layout patikros. Naudota Node 24.19.0, Chromium 155.0.8059.79 ir Playwright 1.63.0.

| Etapas | Planuotos pilnos poros | Užbaigtos pilnos poros | CLI bandymai | Rezultatas |
|---|---:|---:|---:|---|
| `npm run lab:cohort -- --live` |3|0|1|`model_unavailable`|
| `npm run lab:cohort -- --mode compact --live` |3|0|1|`model_unavailable`|

Abu runneriai sustojo po pirmos nesėkmingos sesijos su `stopped_shared_prerequisite`; likusių sesijų nevykdė. CLI prašytas tik `claude-sonnet-5-5` / `high`, modelis automatiškai nekeistas. Pirmas atmetimas truko 8541 ms, antro atskiro etapo 9684 ms. Tai nesėkmingų kvietimų trukmės, ne programos kūrimo rezultatai. Nei viena programa nesukurta, tikrinimo etapų ir kokybės rezultatų nėra. CLI receipt rodo 0 input/output/cache tokenų, o modelio dispatch skaičius ir faktinė prenumeratos kaina lieka nežinomi (`null`). Greičio, tokenų ar cache pranašumas nevertinamas; `measurements: null`, `winner: not_assessed`.

Abiejų kohortų originalūs reportai, promptai ir nesėkmės išsaugoti atskiruose ignoruojamuose `.artifacts/zero-lab/cohorts/` aplankuose. Vieša [gyvų bandymų santrauka](../../catalog/claude-cohort-live-2026-10-16.json) turi reportų SHA256, visas 23 source digest ir abiejų etapų būsenas be vietinių paskyrų duomenų. Ankstesni artefaktai išsaugoti; sėkminga istorinė pora su naujais bandymais nesujungta.

Šie du ankstesni paleidimai lieka neužbaigti ir nepakeisti. Vėliau tas pats Sonnet 5.5 atsakė sėkmingai; nauja atskira pakartojimų kohorta užbaigė visas tris poras. Ankstesnio cloud preflight ir konteksto baitų patikros išlieka [paruošimo įrodymais](../../catalog/claude-cohort-checks.json), ne nauju modelio našumo rezultatu. [Paleidimo komandos](../LOCAL-LAB.md#trys-poros-viena-komanda).

## Trys naujos poros: katalogo kontekstas

Kohorta `2026-10-16T19-50-47-560Z-19b0c778f0c4`, tas pats Sonnet 5.5 / high, promptas v2 ir 23 nekintantys source hash. Visos šešios programos praėjo API, SQLite restart, desktop/mobile klaviatūros ir cleanup patikras. Šios kohortos nemaišome su pradine viena sėkminga pora ar dviem modelio neprieinamumo ataskaitomis.

| Metrika | Baseline | Zero katalogas | Pokytis |
|---|---:|---:|---:|
| Kūrimo laiko mediana |164304 ms|163166 ms|−0,69 %|
| Tikrinimo laiko mediana |20243 ms|24400 ms|+20,54 %|
| Viso trial mediana |184711 ms|183632 ms|−0,58 %|
| Visi trijų bandymų tokenai |1188297|1308255|+10,09 %|
| Cache read tokenai |1030050|1135027|atskirai nuo kainos|
| Cache creation tokenai |87369|97316|atskirai nuo kainos|
| Nekache input tokenai |84|84|0 %|
| Output tokenai |70794|75828|+7,11 %|
| CLI API kainos ekvivalentas |1,263594 USD|1,3747174 USD|tik estimate|
| Faktinė prenumeratos kaina |nežinoma|nežinoma|nevertinta|

Atskirų porų kūrimo deltos: +32,21 %, −9,69 %, −7,33 %. Ši variacija nepatvirtina ankstesnės vienos poros pagreitėjimo kaip bendros sistemos savybės. Katalogo kontekstas šioje kohortoje 50 % ekonomijos ar greičio tikslo nepasiekė. Atskiras `compact` etapas baigtas su viena kokybės nesėkme (žemiau), o Jev ir tikras bendrų bibliotekų pernaudojimas reikalauja savo naujo profilio ir visų paruošimo sąnaudų apskaitos.

Aktyvi kryptis — Claude prenumerata. Codex auth ir OpenRouter lenktynės atidėtos. [Vietinis paleidimas](../LOCAL-LAB.md), [kalibravimo metodas](../CALIBRATION.md), [Zero Lab modulis](../ZERO-LAB.md).

## Trumpesnio katalogo kohorta

Kohorta `2026-10-16T20-12-56-653Z-01cd50ba05f8` baigė visas tris kaitaliojamas poras. Pradinis Zero: **3/3 PASS**, compact: **2/3 PASS**. Pirmos poros compact programa praėjo API ir SQLite, bet nepraėjo `desktop_runtime_errors` patikros. Programa, promptas ir tikrintuvas nepataisyti kohortos viduryje; nesėkmė išsaugota.

Visi tokenai: 1745005 → 1546847 (−11,36 %). Cache read: 1550961 → 1357330; cache creation: 106441 → 105210; output: 87499 → 84215. CLI API kainos ekvivalentai: 1,6111542 → 1,53464 USD; faktinis prenumeratos mokestis nežinomas. Tai visų bandymų apskaita, **ne pergalė esant vienodai kokybei**. Kohortos performance measurements lieka null.

Trečioje poroje nustatyta vykdymo pauzė: baseline CLI laikrodžio laikas 2313828 ms, monotonic coding laikas 355851 ms (skirtumas 1957977 ms). Laiko pranašumo neskelbiame. Vėlesniems bandymams vykdymo metu laikinai stabdomas automatinis host užmigimas.

Papildomas repeat agregatų patikslinimas: visų trijų coding laikų sumos 500444 → 523171 ms; trial sumos 565219 → 592750 ms. Nedidelis medianos sumažėjimas nereiškia mažesnio bendro darbo laiko. [Pilni abiejų kohortų sanitizuoti matavimai](../../catalog/claude-cohort-results-2026-10-16.json).

## Jev atranka ir reali Git HTTP biblioteka

Kohorta `2026-10-16T21-13-26-972Z-d9e4dab9eb7d`: trys naujos kaitaliojamos poros, **6/6 PASS**, 25 source hash, vienodas Sonnet 5.5/high ir promptas v2. API, tikro SQLite restart, desktop/mobile klaviatūros ir cleanup patikros praėjo. Laikrodžių neatitikimo nenustatyta: porų wall/monotonic skirtumai 34–35 ms.

| Metrika | Claude baseline | Jev + biblioteka | Pokytis |
|---|---:|---:|---:|
| Coding mediana |183016 ms|150558 ms|−17,74 %|
| Grading mediana |22790 ms|23884 ms|+4,80 %|
| Trial mediana |205823 ms|206736 ms|+0,44 %|
| Visų trial suma su paruošimu |630636 ms|577966 ms|−8,35 %|
| Visi tokenai |1369719|1019562|−25,56 %|
| Cache read |1196892|874015|įtraukti po vieną kartą|
| Cache creation |94571|81441|atskirai nuo cache read|
| Nekache input |88|86|atskirai|
| Output |78168|64020|atskirai|
| API kainos ekvivalentas su Jev |1,3995184 USD|1,14107256 USD|−18,47 %, tik estimate|
| Faktinė prenumeratos kaina |nežinoma|nežinoma|nevertinta|

Jev vieną kartą visai kohortai parinko vietinius keturis įrankius ir atmetė penkis katalogo šaltinius pagal eksperimentinę 0,7 ribą. Pinned Hono ir node-server biblioteka pasirinkta **operatoriaus verified-http politika**; tai nepriskiriama Jev atrankos pergalei. Bibliotekos šaltiniai ir abi MIT notices išsaugoti. Visi trys kandidatai turi statinį `vendor/http.mjs` importą ir nepakeistus keturis seeded failus; atskiras runtime acceptance PASS. Tai statinis panaudojimo įrodymas su veikiančia programa, ne instrukcijų vykdymo trace.

Vienas frozen paruošimas kainavo 4547 ms ir 0,00013356 USD; abi sąnaudos pridėtos kandidatui vieną kartą. Ankstesni paruošimai ir diagnostika atskirai įtraukti į [bendrą kalibravimo apskaitą](../../catalog/jev-preparations-2026-10-16.json): keturi API kvietimai, provider pateikta 0,000443394 USD suma, konservatyviai rezervuota 0,40 USD iš leisto 1 USD. Šio kombinuoto profilio bandymas neatskiria įrankių, konteksto ir bibliotekos individualios naudos; pilnas produkto runtime ir Auto nedalyvavo.

Toliau atskirai tikrinami [lean profiliai](LEAN-CALIBRATION.md); jų sisteminės instrukcijos, įrankiai ir effort skiriasi, todėl tai visos konfigūracijos palyginimas.

## Lean atranka: high

Pirma iš anksto deklaruotos atrankos pora `2026-10-16T21-35-20-039Z-c59356262667`: abu variantai PASS, nepakitęs user task ir graderis, Sonnet 5.5/high. Trumpa sisteminė instrukcija ir keturi vietiniai įrankiai šioje poroje nepagerino darbo eigos: trial 175060 → 220672 ms (+26,06 %), coding 153433 → 198115 ms (+29,12 %), tokenai 450147 → 400135 (−11,11 %), CLI API kainos ekvivalentas 0,43813 → 0,4543876 USD (+3,71 %). Output padidėjo 22847 → 24475; vien mažesnė tokenų suma nėra pigesnio darbo įrodymas. Tai viena atrankos pora, ne patvirtinimo kohorta ir ne Jev/reuse poveikio matavimas. Toliau to paties protokolo medium ir low atrankos.

## Lean atranka: medium

Antra deklaruotos atrankos pora `2026-10-16T21-42-43-288Z-2ba66e43d179`: abu variantai PASS. Bazinis high prieš lean medium: trial 221318 → 94171 ms (−57,45 %), coding 200267 → 70902 ms (−64,60 %), grading 21037 → 23225 ms, tokenai 628921 → 88474 (−85,93 %), API kainos ekvivalentas 0,5096114 → 0,1742964 USD (−65,80 %). Faktinis prenumeratos mokestis nežinomas. Tai viena **atrankos** pora, 50 % tikslo patvirtinimo dar nėra.

Peržiūrėtos medium desktop/mobile ekrano kopijos ir statinis UI kodas: paieškos, filtrų, edit/delete, santraukos bei eksporto valdikliai yra. Papildomi UI srautai atskirai nepaleisti; automatinis PASS apima deklaruotą API/SQLite/create/move/reload kontraktą, ne subjektyvią dizaino kokybę. Skiriasi sisteminis promptas, įrankiai ir effort, todėl poveikis nepriskiriamas Jev ar vien bibliotekų pernaudojimui.

## Lean atranka: low ir pasirinkimas

Trečia deklaruotos atrankos pora `2026-10-16T21-48-36-889Z-4f289e7c4739`: abu variantai PASS. High baseline prieš lean low: trial 197065 → 79736 ms (−59,54 %), coding 174732 → 58020 ms (−66,79 %), grading 22318 → 21701 ms, tokenai 512074 → 35562 (−93,06 %), CLI API kainos ekvivalentas 0,4625044 → 0,1390162 USD (−69,94 %). Faktinis prenumeratos mokestis nežinomas.

Visi trys atrankos kandidatai praėjo deklaruotas patikras. Pagal iš anksto užfiksuotą mažiausio kandidato API kainos ekvivalento taisyklę pasirinktas **low** (high 0,4543876; medium 0,1742964; low 0,1390162 USD). Low šioje atrankoje taip pat turėjo trumpiausią trial. Pradėta atskira trijų naujų kaitaliojamų porų low patvirtinimo kohorta. Atrankos poros į jos statistiką neįtraukiamos; galutinio ar bendro produkto laimėtojo dar nėra.

## Low patvirtinimas: trys naujos poros

Kohorta `2026-10-16T21-54-33-518Z-087c20f06f63`, source commit `ee3d5be64e42ff84315e715d13b4821c91953436`: trys poros AB/BA/AB, 26 nekintantys source hash, šeši patikrinti promptų digest. **6/6 PASS**, įskaitant API, SQLite restart, desktop/mobile klaviatūros create/move/reload ir cleanup. Visi laikrodžių integrity vartai PASS. Atrankos poros į šią statistiką nepridėtos.

| Metrika | Claude high baseline | Zero lean low | Pokytis |
|---|---:|---:|---:|
| Visų trial laikų suma |818560 ms|314249 ms|−61,61 %|
| Trial mediana |235774 ms|120365 ms|−48,95 %|
| Coding mediana |186431 ms|70448 ms|−62,21 %|
| Grading mediana |49292 ms|47911 ms|−2,80 %|
| Visi tokenai |1205576|147769|−87,74 %|
| Cache read |1045133|91923|normalizuoti po vieną kartą|
| Cache creation |85605|28320|atskirai|
| Nekache input |82|24|atskirai|
| Output |74756|27502|atskirai|
| CLI API kainos ekvivalentas |1,2991706 USD|0,4067326 USD|−68,69 %, estimate|
| Faktinis prenumeratos mokestis |nežinomas|nežinomas|nevertinta|

Coding laikai poromis: baseline 186431 / 331740 / 164559 ms; low 72422 / 70448 / 51591 ms. Antros poros baseline buvo gerokai ilgesnis; todėl rodoma ir suma, ir mediana. 50 % kriterijus pagal iš anksto deklaruotą visų workflow laikų sumą ir API kainos ekvivalentą šiai kohortai pasiektas. **50 % trumpesnės trial medianos nėra**. Provider cache ir apkrova nekontroliuoti.

Šis profilis nenaudoja Jev ar šaltinių bibliotekos; skiriasi sisteminės instrukcijos, įrankiai ir effort. Iš jo negalima išvesti individualios Jev/reuse naudos ar kitų užduočių kokybės. Tai geriausias iki šiol patvirtintas SprintDesk opt-in variantas. Numatytasis profilis automatiškai nepakeistas:

```bash
npm run lab:cohort -- --mode lean-low --live
```

Po patvirtinimo atskirai pradėta viena `jev-http-lean-low` atrankos pora su nauju frozen paruošimu (4894 ms, 0,00013356 USD). Kol ji ir būtini kartojimai neužbaigti, kombinuotas variantas nepaskelbtas geresniu. Atskirai, tarp kohortų, vien tik naršyklės assetų paruošimas be modelio pamatuotas 6278 ms (tas pats 461392285 baitų digest); tikrintuvas ar jo kontraktas dėl šio profiliavimo nepakeisti.

## Kombinuoto low atranka

Atskira viena pora `2026-10-16T22-15-24-200Z-acfb0d6efc2c`: high baseline ir `zero-jev-http-lean-low-claude-v1` abu PASS. Baseline trial 238547 ms, kandidato 68265 ms, su visu frozen paruošimu 73159 ms (−69,33 %); coding 215752 → 47108 ms. CLI API kainos ekvivalentas su Jev 0,506496 → 0,12086576 USD (−76,14 %), tokenai 506327 → 33850. Bibliotekos panaudojimo ir nepakeistų assetų duomenys saugomi ataskaitoje.

Tai viena atrankos pora. Pradėtas atskiras trijų naujų porų kombinacijos patvirtinimas, nes kandidatas perspektyvus pagal kainos ir laiko apskaitą. Patvirtinto `lean-low` dar nepakeičiame. Šis palyginimas yra prieš high baseline; jis neizoliuoja Jev ar bibliotekos individualios naudos prieš paprastą low.

Tas pats nepakitęs paruošimo planas pernaudojamas patvirtinimui. Kiekvienos kohortos scenarijui konservatyviai pridedama visa jo 4894 ms ir 0,00013356 USD kaina; bendra realių API kvietimų apskaita naudoja unikalius paruošimus, todėl globalus Jev mokestis nepadvigubinamas.

## Kombinuoto patvirtinimo nesėkmė ir sesijos kvota

Kohorta `2026-10-16T22-21-29-987Z-520ec330d1ed`: trys suplanuotos poros bandytos, visos šešios generacijos baigėsi `cli_failure`, po 0 CLI pateiktų tokenų, programos nesukurtos, acceptance nepaleistas. Raw ataskaitos nepakeistos. Kohorta **not_comparable**, measurements null, greičio pergalės nėra. Sėkminga viena kombinuota atrankos pora nepaversta patvirtinimu.

Vienas vėlesnis trumpas diagnostinis kvietimas grąžino struktūrinį `rate_limit`, HTTP 429 ir Claude sesijos limitą; CLI nurodė atsinaujinimą 00:40 UTC, pagal diagnostikos laiką tai 2026-10-17 00:40 UTC (03:40 Europe/Kiev). Tai vėlesnės diagnostikos priežastis, originalių šešių reportų `cli_failure` įrašai neatgalinami. Tiekėjo kvota skiriasi nuo naudotojo leidimo neriboti Sonnet bandymų.

Rasta adapterio klaida: neatpažintas tekstas „session limit“ ir struktūrinė assistant klaidos žyma. Ištaisyta jų klasifikacija, išsaugomas terminal subtype ir saugus HTTP statusas; tuščias errors masyvas nebeužgožia result. Nežinomas bendras CLI failure dabar sustabdo tolesnes lane ir poras. Išsaugota diagnostika peržaista offline: usage_limit/429, 0 naujų modelių kvietimų. Integruotoje main kopijoje 91 offline regresija PASS, 0 fail/skip. Po šio klasifikavimo taisymo nauja gyva kohorta nevykdyta; ankstesni performance source hash neperrašyti.

Geriausias patvirtintas opt-in pasirinkimas lieka **lean-low**. Kombinuotas profilis dar nepatvirtintas. Po kvotos atsinaujinimo reikalinga nauja kohorta ir naujas frozen Jev planas, nes adapterio/runnerio source hash pasikeitė; tęsti tą patį bendrą 1 USD ledger, nekurti naujo biudžeto ir nepernaudoti pasenusio plano. Automatinis retry ar kito modelio/provider fallback neįjungtas.
