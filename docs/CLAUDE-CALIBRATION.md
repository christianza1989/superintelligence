# Claude prenumeratos kalibravimas

Naujausia Jev ir tikros HTTP bibliotekos trijų porų kohorta: **6/6 automatinių patikrų PASS**. Bendra trial laikų suma su paruošimu mažesnė **8,35 %**, CLI API kainos ekvivalentas **18,47 %**, tokenų suma **25,56 %**. 50 % tikslas nepasiektas; faktinė prenumeratos kaina nežinoma. Ankstesnis vien katalogo kontekstas tokios ekonomijos nepatvirtino. [Visi nauji reportai ir cache apskaita](../catalog/claude-cohort-results-2026-10-16.json).

2026-10-16. **Importuotas vietinis Claude CLI bandymas, perskaičiuotas palyginimas ir pakartotinai patikrintos abi sugeneruotos programos.** Tai to paties Claude CLI su statiniu Zero katalogo kontekstu ir be jo palyginimas. Pilnas RepositoryZero runtime, Jev ir Auto šiame bandyme nedalyvavo.

Mašininė santrauka: [catalog/claude-calibration.json](../catalog/claude-calibration.json). Naudotas `claude-sonnet-5-5`, effort `high`, oficialus Claude CLI 2.1.292 su first-party prenumeratos prisijungimu, Node24/Linux x64. CLI įrašytas modelis nėra nepriklausoma provider attestation.

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

Tikrinimo v2 kopijuoja iki64MiB DB/WAL/journal į atskirą ribotą tmpfs, kuriame SQLite gali atkurti WAL indeksą; originalus tūris lieka read-only. Promptas [PROMPT.v2.md](../benchmarks/sprintdesk-v1/PROMPT.v2.md) prieš naują generavimą paaiškina jau buvusį reikalavimą: vienintelės accessible headings `Todo`, `In progress`, `Done`, skaitikliai už jų accessible name. Originalus [PROMPT.md](../benchmarks/sprintdesk-v1/PROMPT.md) nepakeistas. Graderio UI vartai nesušvelninti; skirtingos promptų ir grader versijos nepaverčiamos viena kohorta.

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

Abiejų kohortų originalūs reportai, promptai ir nesėkmės išsaugoti atskiruose ignoruojamuose `.artifacts/zero-lab/cohorts/` aplankuose. Vieša [gyvų bandymų santrauka](../catalog/claude-cohort-live-2026-10-16.json) turi reportų SHA256, visas 23 source digest ir abiejų etapų būsenas be vietinių paskyrų duomenų. Ankstesni artefaktai išsaugoti; sėkminga istorinė pora su naujais bandymais nesujungta.

Šie du ankstesni paleidimai lieka neužbaigti ir nepakeisti. Vėliau tas pats Sonnet 5.5 atsakė sėkmingai; nauja atskira pakartojimų kohorta užbaigė visas tris poras. Ankstesnio cloud preflight ir konteksto baitų patikros išlieka [paruošimo įrodymais](../catalog/claude-cohort-checks.json), ne nauju modelio našumo rezultatu. [Paleidimo komandos](LOCAL-LAB.md#trys-poros-viena-komanda).

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

Aktyvi kryptis — Claude prenumerata. Codex auth ir OpenRouter lenktynės atidėtos. [Vietinis paleidimas](LOCAL-LAB.md), [kalibravimo metodas](CALIBRATION.md), [Zero Lab modulis](ZERO-LAB.md).

## Trumpesnio katalogo kohorta

Kohorta `2026-10-16T20-12-56-653Z-01cd50ba05f8` baigė visas tris kaitaliojamas poras. Pradinis Zero: **3/3 PASS**, compact: **2/3 PASS**. Pirmos poros compact programa praėjo API ir SQLite, bet nepraėjo `desktop_runtime_errors` patikros. Programa, promptas ir tikrintuvas nepataisyti kohortos viduryje; nesėkmė išsaugota.

Visi tokenai: 1745005 → 1546847 (−11,36 %). Cache read: 1550961 → 1357330; cache creation: 106441 → 105210; output: 87499 → 84215. CLI API kainos ekvivalentai: 1,6111542 → 1,53464 USD; faktinis prenumeratos mokestis nežinomas. Tai visų bandymų apskaita, **ne pergalė esant vienodai kokybei**. Kohortos performance measurements lieka null.

Trečioje poroje nustatyta vykdymo pauzė: baseline CLI laikrodžio laikas 2313828 ms, monotonic coding laikas 355851 ms (skirtumas 1957977 ms). Laiko pranašumo neskelbiame. Vėlesniems bandymams vykdymo metu laikinai stabdomas automatinis host užmigimas.

Papildomas repeat agregatų patikslinimas: visų trijų coding laikų sumos 500444 → 523171 ms; trial sumos 565219 → 592750 ms. Nedidelis medianos sumažėjimas nereiškia mažesnio bendro darbo laiko. [Pilni abiejų kohortų sanitizuoti matavimai](../catalog/claude-cohort-results-2026-10-16.json).

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

Vienas frozen paruošimas kainavo 4547 ms ir 0,00013356 USD; abi sąnaudos pridėtos kandidatui vieną kartą. Ankstesni paruošimai ir diagnostika atskirai įtraukti į [bendrą kalibravimo apskaitą](../catalog/jev-preparations-2026-10-16.json): keturi API kvietimai, provider pateikta 0,000443394 USD suma, konservatyviai rezervuota 0,40 USD iš leisto 1 USD. Šio kombinuoto profilio bandymas neatskiria įrankių, konteksto ir bibliotekos individualios naudos; pilnas produkto runtime ir Auto nedalyvavo.

Toliau atskirai tikrinami [lean profiliai](LEAN-CALIBRATION.md); jų sisteminės instrukcijos, įrankiai ir effort skiriasi, todėl tai visos konfigūracijos palyginimas.
