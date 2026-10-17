# Zero Lab: daugkartinis kalibravimo modulis

> **Palaikomas runbook / metodika · peržiūrėta 2026-10-17.** Komandų paskirtį ir istorinius rezultatus skirti nuo pilno produkto acceptance. Ši antraštė nepervertina senų kohortų. Dabarties autoritetas: [būsena](IMPLEMENTATION.md), [priimta architektūra](DECISIONS.md), [roadmapas](../ROADMAP.md).

2026-10-17. **Veikia CLI runneris, izoliuoti API/SQLite/browser tikrintuvai, cohort/compact režimai ir reportų palyginimas. Atlikti Sonnet pakartojimai bei pirmi Haiku StockDesk bandymai; pilnas produkto worker reuse kelias, Jev ToolSelector ir Lab UI dar nepriimti.** [Dabartinis metodas ir rezultatų indeksas](CALIBRATION.md), [porinių bandymų taisyklės](PAIRED-BENCHMARK.md).

## Naudotojo eiga

**Pasirinkti užduočių rinkinį → baseline ir kandidatą → limitus → paleisti → palyginti → pakeisti profilį → kartoti.**

Istorinis SprintDesk baseline `claude-fixed-v1` ir kandidatas `zero-retrieval-claude-v1` naudoja tą patį Sonnet 5.5/high, papildant tik statiniu katalogo kontekstu. Vėlesni Jev/HTTP ir lean profiliai yra atskiros konfigūracijos; naujausi StockDesk bandymai — Haiku 5.5/high. Visi [rezultatai ir jų ribos](CALIBRATION.md#išsaugoti-rezultatai) atskirti; nė vienas nepatvirtina viso produkto pranašumo.

Vėlesniam UI numatyta viena Lab vieta darbo erdvėje: Suites, Profiles, Runs ir Compare vaizdai, naudojant bendrus UI primitives ir lokalizacijos keys. Naujas nepriklausomas agentų scheduler nekuriamas. UI siunčia pageidavimą; serveris tikrina teises, leistiną profilį ir likusį bendrą biudžetą. CLI ir UI naudoja tą patį būsimą eval servisą.

## Pernaudojamas jau esamas kodas

Rakazo adaptacijoje rasti konkretūs eval komponentai:

- `platform/packages/testkit/src/cli/evals.ts`: riboti trial/case/strategy parametrai, pasukama vykdymo tvarka ir išsaugoma ataskaita.
- `platform/packages/testkit/src/evals/report.ts`: `emptyTrial`, `summarize`, `validateControls`, klaidų kategorijos ir redaction.
- `platform/packages/testkit/src/evals/measurement.ts`: usage dedup, cache/operation apskaita, šaltinį turinčios kainos ir unavailable semantika.
- `platform/packages/testkit/src/evals/runner.ts`: tikro produkto trial principas su atskirais sintetiniais servisais ir finalizavimu.
- Esami SystemOne tools/model/repo selectors, source katalogas ir rezervų ledger; atskiri CLI adapteriai palieka OAuth oficialaus pasirinkto CLI valdomoje jungtyje.

Zero Lab realiai pernaudoja esamas report/controls funkcijas, katalogo paiešką ir oficialių CLI tiltus. Porinis `lab:run` sudaro dvi atskiras darbo vietas, išsaugo promptus ir ataskaitą prieš vykdymą, perduoda vienodas ribas ir renka faktinius CLI usage įvykius. Esamas eval produktų scenarijus ir naujos sugeneruotos programos testas turi skirtingus graders; jų nesuplakame į vieną PASS.

## Duomenų modelis

| Objektas | Paskirtis ir nekintami faktai |
|---|---|
| SuiteVersion | Užduočių ID, kalba, domenas, calibration/validation/holdout dalis, prompt ir acceptance digest; naujas turinys sukuria naują versiją |
| ProfileVersion | Sistemos/prompto versija, retrieval/ranking parametrai, Jev kriterijai ir modelis, konteksto politika, coding model/reasoning, delegavimas/cache/repair; secret reikšmių nėra |
| Experiment | Hipotezė, baseline/candidate profiliai, suites, vykdymo tvarka, kartojimai, laiko/compute/provider cap ir sprendimo kriterijai |
| Trial | Izoliuotas workspace, pin/digest, start/end, etapai, faktiniai usage įrašai, artefaktai, žmogaus įsikišimai, failure priežastis ir cleanup |
| Evaluation | Trusted suite/grader/image versija, API/build/restart/UI tikrinimai, kokybės kriterijų rezultatas; candidate pats negali keisti savo tikrintuvo |
| Comparison | Kokybės/griežtų vartų skirtumai, laiko ir kainos pasiskirstymas, coverage ir nežinomybės; jokio sumanyto laimėtojo |
| PromotionProposal | Siūlymas pakeisti numatytą profilį, įrodymai ir rollback; pirmame etape nepakeičia produkcijos automatiškai |

CLI tiltas dabar priima pilną 15 minučių coding limitą. 60 įrankių veiksmų slenkstis sustabdo procesą pagal jau pastebėtus CLI įvykius; tai nėra leidimų tikrinimas prieš kiekvieną veiksmą. Naujas workspace ir laikina CLI sesija nekontroliuoja provider prompt cache; registruojame tikrą cached usage.

Pradžioje sintetiniai artefaktai ir planai laikomi ignoruojamame `.artifacts/zero-lab/`. Vėliau metaduomenys bus esamoje PostgreSQL ir projekto artefaktų saugykloje su retention/size cap. Privati užduotis ir rezultatas viešai neskelbiami automatiškai. Tikri credentials saugomi per bendrą jungčių saugyklą, ne profilio JSON.

## Pirmas jau paleidžiamas pjūvis

```bash
npm run lab:plan
```

Skriptas skaito [versijuotą manifestą](../benchmarks/zero-lab.v1.json), tikrina baigtinius controls per esamą eval funkciją, skaičiuoja tikslių prompt/grader/katalogo/selector failų SHA256 ir sukuria keturių profilių **not-run** planą `.artifacts/zero-lab/plan.json`. `liveEnabled=false`, paid dispatch limit0; modelių nekviečia. Trūkstami tokenai/kaina lieka null. Tai patikrintas eksperimentų plano artefaktas, ne atliktos lenktynės.

Pirma [SprintDesk užduotis](../benchmarks/sprintdesk-v1/README.md) turi promptą ir nepriklausomą API kontrakto tikrintuvą. Nepriklausomas API ir tikro SQLite įrašo išlikimas po app konteinerio perkrovimo jau patikrinti kontroliuojamu fixture; tyčinė in-memory regresija aptikta. Prijungtas atskiras Docker desktop/mobile/keyboard grader: teigiamas UI fixture ir dvi tyčinės regresijos patikrinti. Bendras API/SQLite/UI pipeline taip pat PASS tam pačiam kontroliniam šaltiniui. Tai ribotas automatinis kontraktas, ne subjektyvus dizaino įvertinimas. Sintetinių candidate/metrikų palyginimų nevadiname tikru Codex ar RepositoryZero rezultatu.

## Įgyvendinimo roadmapas

- [x] **L0:** pakartotinio modulio paskirtis, duomenų kontraktai, esamo eval kodo inventorius ir kalibravimo taisyklės.
- [x] **L1a:** versijuotas manifestas, pirmas prompt/grader, offline `lab:plan`, digest ir not-run JSON ataskaita be modelių kvietimų.
- [x] **L1b:** oficialus Claude prenumeratos CLI baseline/retrieval, CLI modelio/effort ir usage įrašai, vienodos vietinio bandymo ribos. Bendras produkcinis account broker/cap lieka atskiras atviras vartas.
- [x] **L2:** importuota gyva Claude prompt-v2 pora atskiruose workspace; abi programos dar kartą patikrintos pagal tą patį source digest, API/SQLite/desktop/mobile PASS. Tai CLI katalogo konteksto, ne pilno produkto runtime bandymas.
- [ ] **L3:** kelių užduočių rinkiniai, kalbos, kartojimai, vykdymo eiliškumo kontrolė, cold/warm ir patvarios ataskaitos.
- [ ] **L4:** baseline/candidate palyginimas, regresijų priežastys, missing/abstain/unknown routing įrodymai, kokybės/laiko/kainos kompromisai ir naujas holdout tikrinimas.
- [ ] **L5:** Lab UI bendroje darbo erdvėje, eksportas ir tik pasirinktų nuasmenintų suvestinių rodymas oficialioje svetainėje.
- [ ] **L6:** ribotas periodinis regresijos darbas ir pasiūlymai dėl numatyto profilio. Nesibaigianti paid search ir automatinis prompt/grader vartų silpninimas neleidžiami.

Modulis priklauso bendrai MVP eval krypčiai. Po pirmos veikiančios programos pradedame kartoti šį ciklą, išsaugodami ir prastesnes versijas. Funkcija „kalibruoti viską“ tampa atsekamais konkrečių parametrų eksperimentais.

## Dabartinis paleidimas ir įrodymai

[Vietinis Claude/WSL2 kelias](LOCAL-LAB.md). `npm run lab:prepare -- --engine claude` tikrina pasirinktą CLI, Docker, pinned Node image ir naršyklės failus. `npm run lab:run -- --engine claude --prompt-version 2` paruošia A/B be modelių; tik pridėjus `--live --evaluate` vykdomos coding sesijos. Codex auth ir OpenRouter lenktynės šiuo metu atidėtos. Jev/Auto lane neprijungti; nėra tylaus fallback.

Ankstesnis cloud Codex preflight grąžino `local_state_unwritable`; tai istorinis aplinkos blokas. Dabartinė pasirinkta kryptis yra Claude prenumerata. [Importo santrauka](../catalog/claude-calibration.json) fiksuoja53paketo failų atitiktį,20round2source digest ir perskaičiuotą vienos poros rezultatą; abi tikros sugeneruotos programos papildomai perėjo API/SQLite/UI šiame checkout be naujų modelių kvietimų. [Pirmos poros nesėkmės ir ribos](experiments/CLAUDE-CALIBRATION.md) išsaugotos atskirai.

Pirmas evaluator priima prebuilt Node24 runtime be deklaruotų external npm priklausomybių. Source ir grader atskirti, 64MiB invocation-only tmpfs, non-root, network none, jokių modelio raktų ar host socket konteineriuose. Tikras SQLite row tikrinamas po app stop; v2 SQLite/WAL/journal iki64MiB kopijuojami į atskirą ribotą tmpfs, kad WAL recovery nekeistų originalaus read-only tūrio. Tai nėra VM hostile-code ar host power-loss patvarumo acceptance. Atskiras API/persistence evaluator išlieka partial; bendras evaluator patikrina abiejų source snapshot digest ir prideda desktop/mobile UI. Jo automatedContractComplete/qualityComplete reiškia tik deklaruoto automatinio kontrakto atitiktį; visualQualityAssessed=false. UI regresija turi atskirą quality_failed baigtį; unsupported, cancellation ir cleanup error nesumaišomi su kokybės balu.

## Veikiantis palyginimo CLI

`npm run lab:compare -- --report /absolute/report.json` palygina A/B iš vieno ataskaitos failo; `--candidate-report` leidžia antrą failą, jeigu kontrolinės sąlygos sutampa. Tikrinami modelis/reasoning/auth, aplinka/CLI versija, užduoties ir grader hash bei tikra Chromium/Playwright assets versija. Dry-run ir injected vykdymas nepriimami kaip modelių lenktynės. Faster failure nesukuria greičio pergalės; nepilna kokybė, nežinomi tokenai/kaina ir visi bandymai lieka matomi. Prenumeratos kainai nesugalvojamas API tarifas.

Laiko palyginimas apima retrieval paruošimą, CLI vykdymą ir acceptance per trial. Bendras install, preflight ir eksperimentų promptų užfiksavimas nėra priskiriami kiekvienam profiliui; visas eksperimento elapsed išsaugomas atskirai. Vieno atvejo kryptinis skirtumas nėra pasaulinis pranašumas ir nekeičia numatyto profilio automatiškai.

Naršyklės13scenarijų rinkinys turi12offline kontrakto ir prerequisite patikrų bei1tikrą Docker atvejį su sėkme bei klaviatūros/mobile regresijomis. [Naršyklės įrodymai](../catalog/zero-lab-browser-checks.json), [bendro pipeline įrodymai](../catalog/zero-lab-acceptance-checks.json). Papildomi4offline testai tikrina bendrą Docker/image/browser preflight, pasirinktą Claude prenumeratą be Codex state ir sustojimą prieš modelius. Tikslūs naujausi regression skaičiai pateikiami [implementation registre](../catalog/implementation-checks.json).

## Pirma tikra Claude pora ir kitas etapas

Pakartojimų kodas jau veikia: `lab:cohort` paruošia1–3poras, `-- --live` vykdo, kaitaliodamas profilius ir stabdydamas source drift ar bendrą prerequisite gedimą. Medianos atskiria coding/grading/trial, o visų bandymų tokenai lieka matomi. Ankstesnėje cloud aplinkoje CLI nebuvo; vėliau vietiniame WSL atliktos visos trys catalog poros (6/6 PASS), atskiras compact etapas (5/6 bendras, compact 2/3) ir kiti datuoti profiliai. Tai jau atlikti eksperimentai, ne dabartinis aplinkos blokas. Atskiras `--mode compact` profilis patikrina trumpesnį katalogo kontekstą nepakeisdamas seno profilio. [Paleidimas ir ribos](LOCAL-LAB.md#trys-poros-viena-komanda), [offline/dry-run įrodymai](../catalog/claude-cohort-checks.json). L3 kelių užduočių ir patvarios produkcinės istorijos vartas lieka atviras.

Prompt-v2 poroje visas trial266351→200449ms (−24,74%), coding200251→162656ms (−18,77%), tokenai376019→355181 (−5,54%). Gradinglatency skyrėsi28286ms. Tai vieno atvejo kryptinis rezultatas su nekontroliuotu provider cache ir nežinoma prenumeratos kaina. [Išsamūs rezultatai, source kilmė, v1 nesėkmės ir trijų papildomų porų planas](experiments/CLAUDE-CALIBRATION.md).
