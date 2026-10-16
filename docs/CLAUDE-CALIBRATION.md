# Claude prenumeratos kalibravimas: pirmas patikrintas A/B

2026-10-16. **Importuotas vietinis Claude CLI bandymas, perskaičiuotas palyginimas ir pakartotinai patikrintos abi sugeneruotos programos.** Tai to paties Claude CLI su statiniu Zero katalogo kontekstu ir be jo palyginimas. Pilnas RepositoryZero runtime, Jev ir Auto šiame bandyme nedalyvavo.

Mašininė santrauka: [catalog/claude-calibration.json](../catalog/claude-calibration.json). Naudotas `claude-sonnet-5-5`, effort `high`, oficialus Claude CLI2.1.292 su first-party prenumeratos prisijungimu, Node24/Linux x64. CLI įrašytas modelis nėra nepriklausoma provider attestation.

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

- [ ] Su ta pačia nauja source/grader versija atlikti3papildomas v2 poras: baseline→Zero, Zero→baseline, baseline→Zero. Daugiausia6naujos coding sesijos; kiekvienai15minučių ir60stebimų tool veiksmų slenkstis. Šis planas modelių pats nepaleidžia.
- [ ] Prieš pirmą naujos kohortos sesiją užfiksuoti source/prompt/profile hash; tarp porų nekeisti routerio, prompto ar graderio. Visi failure/cancel/unsupported įrašai paliekami. Naujo CLI parserio hardening naudos senieji skaičiai nematuoja.
- [ ] Kodavimo, tikrinimo ir viso trial laikus, cache read/write bei faktinės kainos nežinomybę analizuoti atskirai. Naujo adapterio/grader hash nesutampančių kohortų nelyginti apeinant comparator vartus.
- [ ] Parengti kitą užduotį: vietinis CSV importas, validacija, dublių aptikimas, SQLite išlikimas ir export. Pirma patvirtinti užduoties tekstą, nepriklausomą graderį ir jo negative control, tik tada generuoti abi programas.
- [ ] Kelių užduočių validavimas ir atskiras holdout prieš bendresnį kokybės/greičio teiginį.

[Vienos komandos paleidimas ir atskiras compact etapas](LOCAL-LAB.md#trys-poros-viena-komanda). Naujos kohortos gyvas statusas **NOT_RUN**: cloud neturi Claude CLI, todėl pirmas preflight sustojo su0coding/modelio kvietimų. Reikia vykdyti paruoštame naudotojo WSL. [Paruošimo įrodymai](../catalog/claude-cohort-checks.json).

Aktyvi kryptis — Claude prenumerata. Codex auth ir OpenRouter lenktynės atidėtos. [Vietinis paleidimas](LOCAL-LAB.md), [kalibravimo metodas](CALIBRATION.md), [Zero Lab modulis](ZERO-LAB.md).
