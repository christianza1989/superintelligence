# Vietinis Zero Lab su Claude prenumerata

2026-10-17. Aktyvus naujos užduoties pasirinkimas — **oficialus Claude CLI 2.1.301, Haiku 5.5/high ir Claude prenumerata**, vienodai abiem pusėms. [StockDesk eiga ir rezultatai](STOCKDESK-CALIBRATION.md). Ankstesni [Sonnet bandymai](CLAUDE-CALIBRATION.md) išsaugoti atskirai. Codex auth ir OpenRouter coding lenktynes praleidžiame; Jev atranka turi atskirą bendrą 1 USD biudžetą.

## Pradinės sąlygos

- Debian Linux x64 per WSL2, Node.js24/npm ir projektas Linux failų sistemoje, pavyzdžiui `~/projects/repositoryzero`.
- Docker Desktop su tos WSL distribucijos integracija; `docker info` turi veikti. Evaluator naudoja vietinį `/var/run/docker.sock`.
- Linux Chromium `/usr/lib/chromium/chromium`, glibc bibliotekos ir DejaVu Sans; naujausioje vietinėje regresijoje tikrintas Chromium 155.0.8059.79 ir Playwright 1.63.0. Debian paketus paruošia `sudo apt-get update` ir `sudo apt-get install chromium fonts-dejavu-core`. Windows Chrome ar Ubuntu Snap nėra šio profilio dalis.
- Oficialus Claude CLI tame pačiame WSL naudotojuje; vietiniame bandyme versija2.1.292. Prisijungimas per `claude auth login --claudeai`. Adapteris per oficialų `claude --safe-mode auth status` priima tik `claude.ai` first-party prisijungimą; credential failų neskaito ir jų neperkelia. API raktų nereikia.

CLI coding teisės `dontAsk` nėra OS izoliacija. Dvi coding darbo vietos atskiros, bet tas pats naudotojas gali jas perskaityti; abiem sesijoms galioja vienodas draudimas skaityti kitos pusės rezultatą. Generuotos programos vertinamos atskiruose non-root, network-none, ribotų resursų Docker konteineriuose. Chromium turi atskirą konteinerį ir nenaudoja host naršyklės; tai kontroliuojamo vietinio kodo profilis, ne hostile upstream PR izoliacija.

## Projektas ir patikros

Naudok [saugyklos `main` šaką](https://github.com/christianza1989/superintelligence/tree/main) su integruotais Claude pakeitimais arba šaltinio paketą. Git checkout turi versijų istoriją. Atskiras šaltinio paketas turi `SOURCE-MANIFEST.json`, licencijas ir sibling `.sha256`; `node_modules`, raktai ir Git istorija į paketą neįtraukiami. Pirmajam CLI eksperimentui nereikia paleisti RepositoryZero API/PostgreSQL.

```bash
npm run setup
npm run lab:prepare -- --engine claude
npm run test:claude-bridge
npm run test:lab
npm run test:lab-compare
npm run test:lab-context
npm run test:lab-cohort
npm run test:lab-prepare
npm run lab:run -- --engine claude --prompt-version 2
```

Paskutinė komanda yra **dry-run**: paruošia du promptus ir not-run ataskaitą, modelių nekviečia. `lab:prepare -- --engine claude` patikrina pasirinktą prenumeratos CLI, vietinį Docker, pinned Node image ir naršyklės failus. Prireikus atsisiunčia tik pinned image; modelio nekviečia. Trūkstant CLI/auth/Docker/image/browser, gyvas runneris sustoja prieš coding kvietimą. Naudojant Claude šiam keliui nereikia Codex writable state ar Codex prisijungimo.

Auth prerequisite PASS patvirtina prenumeratos prisijungimą, tačiau negarantuoja prieigos prie pasirinkto modelio. 2026-10-16 du ankstesni gyvi etapai sustojo su `model_unavailable`; jų nesėkmės išsaugotos. Vėliau tas pats Sonnet 5.5 veikė ir naujoje pakartojimų kohortoje užbaigtos visos 3 poros, 6/6 PASS. [Naujausi rezultatai ir ribos](CLAUDE-CALIBRATION.md#trys-naujos-poros-katalogo-kontekstas).

Failų prerequisite PASS dar neįrodo, kad Node/Chromium image iš tikro veikia. Vienkartinės runtime regresijos be modelių:

```bash
npm run test:lab-docker
npm run test:lab-browser-docker
```

Pirmoji patikrina įprastą SQLite, WAL ir tyčinį duomenų praradimą; antroji — tikrą desktop/mobile klaviatūros srautą bei dvi tyčines UI regresijas. Nei viena nešalina svetimų Docker duomenų.

## Nauja gyva A/B pora

Pakartojimams rekomenduojamas žemiau aprašytas `lab:cohort`: jis pats kaitalioja eilę ir išsaugo bendrą suvestinę. Ši komanda skirta vienai atskirai porai.

```bash
npm run lab:run -- --engine claude --prompt-version 2 --profiles claude-fixed-v1,zero-retrieval-claude-v1 --live --evaluate
```

Tai aiškiai įjungia daugiausia dvi coding sesijas: baseline ir tas pats Claude CLI su statiniu Zero katalogo kontekstu. Modelis `claude-sonnet-5-5`, effort `high`; kiekvienai15minučių ir60stebimų tool veiksmų slenkstis. Slenkstis gali sustabdyti tik jau pastebėtą veiksmą, todėl tai nėra strict pre-dispatch cap. Papildomi agentai, customizations ir MCP šiam profiliui išjungti. Jev/Auto ir pilnas RepositoryZero runtime nedalyvauja.

Kitoje poroje sukeisk tik `--profiles` tvarką į `zero-retrieval-claude-v1,claude-fixed-v1`. Nekeisk užduoties/graderio tarp tos pačios kohortos bandymų. Pradiniame manifeste viena pora; pakartotinai paleista komanda kuria naują run ir naujas sesijas. [Kito etapo limitai](CLAUDE-CALIBRATION.md#kitas-ribotas-etapas).

Runtime paketas turi būti prebuilt Node24 su `npm start`, be deklaruotų external npm dependencies; subundlintas kodas su notices leidžiamas. Nėra dependency install/build. Nepalaikomas artefaktas yra unsupported. API/SQLite restart ir desktop1440×900/mobile390×844 keyboard/create/move/API readback/reload/overflow/runtime patikros yra ribota automatinė atitiktis; subjektyvi kokybė nevertinama. SQLite WAL/journal tikrinami iki64MiB kopijoje atskirame tmpfs, originalus tūris lieka read-only. App restart nėra host/daemon power-loss patvarumo įrodymas.

Naršyklės assets šioje cloud aplinkoje užima574600816baitų (~548MiB) papildomų testavimo priklausomybių; tai nėra core footprint ar į šaltinio archyvą įtraukti failai.

## Trys poros viena komanda

```bash
npm run lab:cohort
npm run lab:cohort -- --live
```

Pirma komanda yra dry-run. Antra paleidžia tris naujas Claude prenumeratos poras: baseline→Zero, Zero→baseline, baseline→Zero. Daugiausia6coding sesijos, po15minučių ir60stebimų tool veiksmų; visa kohorta ribota2valandomis. `--pairs 1` arba `--pairs 2` sumažina porciją, bet neprideda trūkstamų kartojimų. Kiekvienas paleidimas sukuria naują kohortą; automatinio retry ar kito etapo paleidimo nėra.

Source, promptų ir profilių hash užfiksuojami prieš darbą. Pasikeitę šaltiniai, shared auth/model/network/protokolo gedimas, sugriuvęs tikrintuvas arba Ctrl+C sustabdo tolesnį vykdymą. Kokybės nesėkmės lieka ataskaitoje. Kodavimo, tikrinimo ir bendro trial medianos atskiros; visi baigti mokami bandymai įtraukiami į tokenų sumą. Kohortos laiko skirtumas yra dviejų profilių medianų skirtumas; kiekvienos poros deltos saugomos greta. Trūkstami tokenai ir prenumeratos mokestis lieka null. Pertrauktai, nepilnai ar kokybės nepraėjusiai kohortai greičio pergalė neskaičiuojama.

Ataskaita `.artifacts/zero-lab/cohorts/<id>/cohort.json` nurodo visų porų JSON, promptų ir artefaktų vietas. Išsaugok visą kohortos aplanką. Jos nemaišyk su ankstesne importuota pora: runnerio/adapterio hash pasikeitė. Trys to paties darbo kartojimai dar nėra kelių užduočių pranašumo įrodymas.

## Atskiras trumpesnio konteksto bandymas

Po pakartojimų peržiūros galima atskirai palyginti seną Zero kontekstą su nauju kandidatu:

```bash
npm run lab:cohort -- --mode compact
npm run lab:cohort -- --mode compact --live
```

Čia abu variantai gauna tą patį Claude modelį ir užduotį: `zero-retrieval-claude-v1` prieš `zero-compact-claude-v1`. Senasis profilis ir prompto baitai nepakeisti. Kandidatas naudoja tas pačias tris paieškas, bet riboja rinkinį iki5kandidatų ir3000baitų; išsaugo SHA, licencijas, būsenas, šaltinių kilmę ir originalias instrukcijas. Tai deterministinė atranka/formatas; Jev nedalyvauja.

Dabartinis katalogo payload3614→2234baitai (−38,18%), kandidatai6→5. Tiems patiems likusiems kandidatams formatas3202→2234baitai (−30,23%). Tai baitai, **ne išmatuotas modelio tokenų ar laiko sutaupymas**. Pakeistas ir rinkinio dydis, ir formatas, todėl jų atskiros naudos iš šio A/B neišvesime. Ankstesnis `compact` bandymas sustojo su `model_unavailable`. Nauja atskira trijų porų kohorta užbaigta: pradinis Zero 3/3 PASS, compact 2/3 PASS, todėl našumo pergalės nėra. Visų tokenų suma mažesnė 11,36 %, tačiau kokybės nesėkmė ir vykdymo pauzė neleidžia skelbti pagreitėjimo. Niekas automatiškai nepakeičia numatyto profilio.

## Ataskaitos ir palyginimas

Kiekvieno run JSON, promptai, workspace ir screenshotai saugomi `.artifacts/zero-lab/runs/`. Runneris išspausdina konkretaus reporto kelią. Naudok jo absoliutų variantą:

```bash
npm run lab:compare -- --report /absolute/path/to/report.json --baseline claude-fixed-v1 --candidate zero-retrieval-claude-v1
```

Palyginimas modelių nekviečia. Tikrina vienodą užduotį, prompto versiją, grader/CLI šaltinių hash, modelį/reasoning/auth, aplinką bei tikrus browser assets. Failures ir incomplete išlieka matomi; greitai sugedusi programa negauna greičio pergalės. Viena pora žymima exploratory.

Claude necache input, cache creation ir cache read normalizuojami po vieną kartą. API kainos ekvivalentas laikomas estimate; faktinė prenumeratos kaina lieka null. Visas trial apima retrieval, coding ir acceptance; bendras setup/preflight saugomas eksperimento elapsed atskirai. Provider cache nekontroliuojamas.

## Tęsti kitoje vietinėje coding sesijoje

Atidaryk sesiją su aktualiu WSL projekto katalogu ir pateik:

> Tęsk RepositoryZero iš šio katalogo. Perskaityk platform/AGENTS.md, docs/LOCAL-LAB.md ir docs/STOCKDESK-CALIBRATION.md. Naujam StockDesk bandymui naudok oficialų Claude CLI 2.1.301 ir vienodą Haiku 5.5/high abiem pusėms; modelio, pastangų ir įrankių Jev nekeičia. Codex auth ir OpenRouter coding atidėti. Patikrink regresijas bei Docker/Chromium, tada tęsk atskirą lab:stockdesk etapą su aktualiu frozen paruošimu iš bendro 1 USD Jev ledger. Nemaišyk pirmos CLI 2.1.292 poros ar atrankos su nauju patvirtinimu. Išsaugok nesėkmes ir nežinomą prenumeratos kainą. Senieji lab:cohort režimai tebėra SprintDesk/Sonnet eksperimentai; pilnas produkto runtime ir Auto šiuo CLI bandymu nepatvirtinami.

Cloud sesija turi savo vykdymo aplinką; Full access pats nesukuria Windows/WSL komandos vykdymo kanalo. Importuoti vietiniai reportai ir šioje cloud aplinkoje pakartotos artefaktų patikros turi atskirą kilmę. [Zero Lab](ZERO-LAB.md), [palyginimo protokolas](PAIRED-BENCHMARK.md).

## Naujausias patvirtintas opt-in variantas

`npm run lab:cohort -- --mode lean-low --live` palygina pradinį Sonnet 5.5/high su Sonnet 5.5/low, trumpu fiksuotu sisteminiu promptu ir keturiais vietiniais įrankiais. Naujoje trijų porų kohortoje 6/6 PASS: trial laikų suma −61,61 %, trial mediana −48,95 %, CLI API kainos ekvivalentas −68,69 %. Tai vienos SprintDesk užduoties visos konfigūracijos matavimas, ne prenumeratos sąskaitos ar individualios Jev/reuse naudos įrodymas. Numatytoji repeat konfigūracija nepakeista. [Protokolas](LEAN-CALIBRATION.md), [visi rezultatai ir nesėkmės](CLAUDE-CALIBRATION.md).

Paskutinį kombinuoto Jev/bibliotekos/low patvirtinimą nutraukė generacijų klaidos; vėlesnė diagnostika patvirtino Claude sesijos kvotą (CLI nurodė 00:40 UTC; pagal diagnostikos laiką kitas atsinaujinimas yra 2026-10-17). Adapterio klaidos klasifikacija ir stop-after-first taisyklė ištaisyta; nauja gyva kohorta po taisymo dar nevykdyta. Prieš vėlesnį Jev bandymą paruošti naują planą aktualiems source hash ir naudoti tą patį bendrą biudžeto ledger.

## StockDesk su vienodu Haiku

[Užduoties tekstas](../benchmarks/stockdesk-v1/PROMPT.md), [protokolas ir komandos](../benchmarks/stockdesk-v1/README.md), [matavimai](../catalog/stockdesk-results-2026-10-17.json). Įgyvendinti atskiri API/CSV, tikro SQLite restart ir desktop/mobile darbo eigų tikrintuvai bei septyni tyčiniai gedimai. Testai praėjo prieš modelių generavimą. Pirmoje A/C poroje abu programų variantai PASS; tai viena atranka su senesniu CLI 2.1.292, ne pakartojamas Jev pranašumas. Jev neparinko bibliotekų. Šios poros kainos įvertis nevaliduotas, nes oficialus Haiku 5.5 atpažinimas atsirado CLI 2.1.293. Po poros įdiegtas ir naujiems etapams fiksuojamas 2.1.301, tikrinamas versioned executable SHA256. Prieš naują etapą reikia naujo frozen paruošimo, naudojant tą patį 1 USD ledger; senos kohortos neperrašomos ir nesujungiamos su naujos CLI rezultatais. [Detali analizė ir kokybės ribos](STOCKDESK-CALIBRATION.md).
