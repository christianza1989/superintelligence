# Dabartinė įgyvendinimo būsena

**Atnaujinta 2026-10-17.** Pradinio Astra audito atskaitos kodas `fe14bdd4fb9cd8805938e1169a4bd2d13961bb86`: tikslinės kodo vietos, 102 Markdown failų inventorius ir 147 offline patikros, ne viso kodo saugumo auditas. [Audito įrodymai](audits/2026-10-17-astra/EVIDENCE.json). Toliau pateikti vėlesnio įgyvendinimo faktai turi atskiras [MCP patikrų ribas](experiments/MCP-PREVIEW-2026-10-17.md); visas MVP dar nepriimtas.

| Sritis | Faktinė būsena | Kas dar nepriimta |
|---|---|---|
| Produkto bazė | Rakazo pasirinktas ir adaptuotas `platform/`; React, PostgreSQL/Graphile, API ir worker jau yra source | Pilnas Zero end-to-end reuse acceptance, G0/G1 ir švaraus host footprint |
| UI / svetainė | Savarankiška Library su detalėmis ir vietiniu Saved, desktop/mobile bei klaviatūros patikromis; svetainės klientų/OS prijungimo vedlys su tikrais STDIO šablonais | Library kalbos / indeksavimo datos dar papildomos; projekto handoff, visi MVP srautai ir jų vertimai nepriimti |
| Katalogas | 796 source įrašai; 757 sourceAvailable, 756 pinned, 158 netuščios capability; katalogo runtimeTested ir licenseApproved žymų 0 | Tai ne viso projekto testų nebuvimas. Reikia geresnės poreikių paieškos ir paruoštų profilių; image editor/CSV užklausos audito probe grąžino tuščią sąrašą |
| Populiarumas | `catalog/popularity.json` yra datuotas 18 šaltinių / 150 cumulative-stars / 45 trending observations tyrimas; Library canonical projekcijoje yra 89 repo stars su šaltiniu ir data | Ne visų 796 repo metadata; observations nėra unikalūs repo. Missing nėra 0; automatinis refresh dar neįgyvendintas |
| Jev | Source/tool/model selectors ir bounded atsakymai offline testuoti; standalone Lab API kvietimai ir sąnaudos registruoti | Pasirinkto Jev ToolSelector gyvas esamo worker kelias bei papildoma nauda neįrodyti |
| Usage / budget | Request-scoped observer ir vienas beforeCall/usage callId, concurrent isolation bei denial=0 dispatch patikrinti; atominiai budget primityvai yra | OBS2 trusted account + reserve/receipt sujungimas, likusi visų palaikomų mokamų fallback/child kvalifikacija |
| Zero Lab | Oficialus Claude CLI, cohort/compact runner, API/SQLite/browser tikrintuvai, report comparison ir tikri pakartojimai | Lab UI, kelių užduočių produkto acceptance ir nepriklausomas holdout |
| REA / Treg | Šaltiniai ir profiliai ištirti; būtini vėlesniame produkto plane | Zero produkto tikri conformance/permissions/resource scenarijai. REA native Windows proceso capture šiame snapshot nepalaikomas; REA nėra sandbox |
| MCP serverio protokolas | Serveris 0.2.0 / schema 1.2.0: numatyti trys discovery tools; pasirenkamas operator-bound profilis prideda prepare/job/artifact/cancel per esamą API/worker | Autentifikuoto paruošimo realus STDIO/API/DB proceso bandymas PASS; zero_verify dar neprijungtas. Naujas native host execution bandymas nepriimtas |
| Native host ryšys | Naujas Codex desktop pokalbis tikrai iškvietė visus tris discovery MCP tools per Windows–WSL bridge | Claude Code ir kitos OS NOT_RUN; execution/useful-result dar nepriimti. [Įrodymai](experiments/MCP-PREVIEW-2026-10-17.md) |
| Native komponentas / rezultatas / nauda | Bendras grant policy, sesijos API, Graphile/Artifact ir bounded CSV paruošimas sujungti; proceso restart/reconnect, artefakto hash, idempotency ir revoke patikrinti. Atskiras penkių failų Docker verifier turi teigiamas / neigiamas patikras | Verifier dar jungiamas prie to paties patvaraus job kelio. Native host actual-use/verified-outcome/repeated-benefit NOT_RUN; jokio procentinio pažado |
| Papildiniai / svetainės prijungimas | Generuojamas savarankiškas discovery plugin su pinned launcher, trumpa skill ir portable/Codex/Claude manifestais; Linux/Windows proceso bei Claude manifest validator patikros PASS. Svetainėje veikia vietinio STDIO vedlys | Native plugin install/cache/new-session/uninstall ir vykdymo profilio lifecycle dar nepriimti; Copy command nėra connected |
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

Toliau sujungti project snapshot/verifier su patvariu API/worker/MCP keliu, patikrinti tikrą host integraciją ir lifecycle pagal P1X.4–P1X.8. Vienos vertikalės native pilotas P1E.10–P1E.11 gali vykti prieš visą MVP. Lygiagrečiai užbaigti Library L1–L5 ir OBS2; Zero mokamiems profiliams tikra apskaita ir J1/J2. [Profilių ribos](MCP-INTEGRATION.md#7-profilių-vartai-ir-įgyvendinimo-seka). Detalūs reikalavimai ir priklausomybės [ROADMAP](../ROADMAP.md), ribotas kelias [MVP-ROADMAP](../MVP-ROADMAP.md). Atviri vartai nežymimi PASS dėl maketo ar dokumentų sutvarkymo.
