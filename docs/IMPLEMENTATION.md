# Dabartinė įgyvendinimo būsena

**2026-10-17 · patikrintas atskaitos kodas `fe14bdd4fb9cd8805938e1169a4bd2d13961bb86`.** Dokumentų sutvarkymas nekeičia produkto runtime. Astra auditavo tikslines kodo vietas, inventorizavo 102 Markdown failus ir pakartojo 147 offline patikras. Tai nėra viso kodo saugumo auditas ar visų katalogo repo patikrinimas. [Įrodymai](audits/2026-10-17-astra/EVIDENCE.json).

| Sritis | Faktinė būsena | Kas dar nepriimta |
|---|---|---|
| Produkto bazė | Rakazo pasirinktas ir adaptuotas `platform/`; React, PostgreSQL/Graphile, API ir worker jau yra source | Pilnas Zero end-to-end reuse acceptance, G0/G1 ir švaraus host footprint |
| UI / svetainė | Foundation puslapiai, katalogo paieška, appearance ir 8 locale foundation yra kode; ankstesni build/smoke įrodymai išsaugoti | Nauja 7 ekranų kryptis, savarankiška pilna Library, visi MVP srautai ir jų vertimai |
| Katalogas | 796 source įrašai; 757 sourceAvailable, 756 pinned, 158 netuščios capability; katalogo runtimeTested ir licenseApproved žymų 0 | Tai ne viso projekto testų nebuvimas. Reikia geresnės poreikių paieškos ir paruoštų profilių; image editor/CSV užklausos audito probe grąžino tuščią sąrašą |
| Populiarumas | `catalog/popularity.json` yra datuotas 18 šaltinių / 150 cumulative-stars / 45 trending observations tyrimas | Ne visų 796 repo metadata; observations nėra unikalūs repo. Library projekcija ir refresh neįgyvendinti |
| Jev | Source/tool/model selectors ir bounded atsakymai offline testuoti; standalone Lab API kvietimai ir sąnaudos registruoti | Pasirinkto Jev ToolSelector gyvas esamo worker kelias bei papildoma nauda neįrodyti |
| Usage / budget | Request-scoped observer ir vienas beforeCall/usage callId, concurrent isolation bei denial=0 dispatch patikrinti; atominiai budget primityvai yra | OBS2 trusted account + reserve/receipt sujungimas, likusi visų palaikomų mokamų fallback/child kvalifikacija |
| Zero Lab | Oficialus Claude CLI, cohort/compact runner, API/SQLite/browser tikrintuvai, report comparison ir tikri pakartojimai | Lab UI, kelių užduočių produkto acceptance ir nepriklausomas holdout |
| REA / Treg | Šaltiniai ir profiliai ištirti; būtini vėlesniame produkto plane | Zero produkto tikri conformance/permissions/resource scenarijai. REA native Windows proceso capture šiame snapshot nepalaikomas; REA nėra sandbox |
| MCP serverio protokolas | Įgyvendinti griežti bounded zero_search/zero_inspect/zero_status, tiesioginis STDIO launcher ir offline/proceso regresijos | Tik discovery; prepare/verify nėra šio serverio įrankiai. Root CI vykdymo patvirtinimas atskiras |
| Native host ryšys | Naujas Codex desktop pokalbis tikrai iškvietė visus tris discovery MCP tools per Windows–WSL bridge | Claude Code ir kitos OS NOT_RUN; execution/useful-result dar nepriimti. [Įrodymai](experiments/MCP-PREVIEW-2026-10-17.md) |
| Native komponentas / rezultatas / nauda | Linux scoped snapshot pagrindas ir atskiras bounded CSV job per esamą Graphile/Artifact; tikri DB paruošimo testai | Sesija autentifikuota application API patikrinta su tikra DB; operatoriaus policy ir MCP execution autoritetas dar nesujungti; host actual-use/verified-outcome/repeated-benefit NOT_RUN; jokio procentinio pažado |
| Papildiniai / svetainės prijungimas | Patikrinti oficialūs galimi keliai; priimta setup/probe/lifecycle specifikacija | Manifestai, install mygtukai ir connected verification dar neįgyvendinti |
| Platinimas / beta | Vietinio source paketo ir setup įrankiai yra | Naujo žmogaus MVP/beta, signed update/recovery ir native OS matrica |

## Patikros ir jų ribos

Astra šiame source snapshot pakartojo:

- `npm run test:foundation`: **98/98**.
- `node scripts/platform.mjs exec vitest run packages/testkit/src/history-context.test.ts packages/adapters/src/context-selection.test.ts packages/adapters/src/runtime-context.test.ts`: **49/49**, su vietiniu emuliatoriumi.

147 testų PASS neuždaro ankstesnės **53/54 history/context kvalifikacijos** nesėkmės ir neįrodo gyvo produkto kokybės. Ankstesnės DB/budget/UI/build patikros pažymėtos istoriniuose įrašuose, šiame audite jos nepaleistos iš naujo. Naujausių dokumentų/build patikrų rezultatai įrašomi [sutvarkymo ataskaitoje](DOCS-CLEANUP.md).

## Eksperimentų būklė

Claude prenumerata pasirinkta vietiniam coding Lab. Naujausi StockDesk bandymai naudojo oficialų CLI **2.1.301, Haiku 5.5/high** abiem pusėms; senesni Sonnet ir CLI 2.1.292 rezultatai turi atskirus profilius. Šiuo dokumentų tvarkymo metu gyvų lenktynių nevykdome. Codex CLI auth ir pagrindinio coding modelio OpenRouter lenktynės atidėtos. Native Codex desktop MCP discovery profilis jau patikrintas su host paskyra, neperkeliant CLI auth. Execution ir formalus A/B bandymas dar NOT_RUN. Jev API turi atskirą anksčiau suteiktą bendrą 1 USD cap; ledger nėra atstatomas.

[Sonnet / SprintDesk](experiments/CLAUDE-CALIBRATION.md), [lean profilis](experiments/LEAN-CALIBRATION.md), [Haiku / StockDesk](experiments/STOCKDESK-CALIBRATION.md), [dabartinis metodas](CALIBRATION.md). Senas NOT_RUN dėl CLI neprieinamumo yra istorinė aplinkos būsena. V2 StockDesk grader kontrolės nepaverčia v1 programų retrospektyviai praėjusiomis.

## Vietinis paleidimas

Naudoti tikrą Git checkout Linux x86_64 / WSL2 failų sistemoje ir palaikomą Node pagal root package.json. Iš šaknies:

```bash
npm run setup
npm run check:docs
npm run test:foundation
npm run dev         # frontend: http://127.0.0.1:5173/discover
npm run dev:site    # svetainė: http://127.0.0.1:4321
```

Backend kūrimui pirmiausia peržiūrėti `platform/.env.example` ir vietinę konfigūraciją. `init:local` sukuria vietinį failą, neperrašo esamo. DB komandoms reikia veikiančio Docker. Kiekvieną ilgai veikiantį serverį paleisti atskirame terminale:

```bash
npm run init:local
npm run db:up
npm run db:generate
npm run db:migrate
npm run dev:api
npm run dev:worker
```

`SANDBOX_PROVIDER=none` yra vietinio development parinktis, ne hostile kodo izoliacijos įrodymas. Neviešinti `.env`, connections ar privačių reportų. Lab nereikalauja paleisti viso API/DB: atskiras [LOCAL-LAB runbook](LOCAL-LAB.md). Paketui: `npm run package:local`, tik Linux; tai source export, ne native installer.

## Kas toliau

Pirma P1X.2/P1X.3 read-only MCP ir tikras Codex ryšys; prieš vykdymą P1X.4/P1X.8 scope/limitai, tada TP1/TP2 ir P1X.5–P1X.7 maža worker vertikalė. Vienos vertikalės native pilotas P1E.10–P1E.11 gali vykti prieš visą MVP. Lygiagrečiai Library L1–L5 ir OBS2; Zero mokamiems profiliams tikra apskaita ir J1/J2. [Profilių ribos](MCP-INTEGRATION.md#7-profilių-vartai-ir-įgyvendinimo-seka). Detalūs reikalavimai ir priklausomybės [ROADMAP](../ROADMAP.md), ribotas kelias [MVP-ROADMAP](../MVP-ROADMAP.md). Atviri vartai nežymimi PASS dėl maketo ar dokumentų sutvarkymo.
