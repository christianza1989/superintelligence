# Dabartinė įgyvendinimo būsena

**Atnaujinta 2026-10-17.** Pradinio Astra audito atskaitos kodas `fe14bdd4fb9cd8805938e1169a4bd2d13961bb86`: tikslinės kodo vietos, 102 Markdown failų inventorius ir 147 offline patikros, ne viso kodo saugumo auditas. [Audito įrodymai](audits/2026-10-17-astra/EVIDENCE.json). Toliau pateikti vėlesnio įgyvendinimo faktai turi atskiras [MCP patikrų ribas](experiments/MCP-PREVIEW-2026-10-17.md); visas MVP dar nepriimtas.

| Sritis | Faktinė būsena | Kas dar nepriimta |
|---|---|---|
| Produkto bazė | Rakazo pasirinktas ir adaptuotas `platform/`; React, PostgreSQL/Graphile, API ir worker jau yra source | Pilnas Zero end-to-end reuse acceptance, G0/G1 ir švaraus host footprint |
| UI / svetainė | Savarankiška Library su filtrais, datuotais stars, indeksavimo rikiavimu, detalėmis ir Saved; desktop/mobile bei klaviatūros patikros PASS. Source vaidmuo ir projekto aprašas išsaugomi kaip nuosavas hash-checked artefaktas; atskiras Start planning task grąžina tikrą Graphile task/run receipt. Svetainėje klientų/OS STDIO vedlys | Handoff unit / PG bei mocked UI patikros PASS, tačiau jis dar nekvalifikuoja projekto sukūrimo ar integracijos; L5/P2.14 ir visi MVP srautai atviri |
| Katalogas / paieška | 796 source įrašai; 757 sourceAvailable, 756 pinned, 158 netuščios capability; katalogo runtimeTested ir licenseApproved žymų 0. Pridėtas ribotas LT/EN žodynas ir nepriklausomi hard constraints; [development rinkinyje 48/48](experiments/NEED-RETRIEVAL-2026-10-17.md) | Tai ne viso projekto testų nebuvimas ir ne bendras 100 % fit. Nematytas holdout bei paruoštų profilių paieškos sluoksnis atviri; source-only CSV no-fit nepanaikina atskiro kvalifikuoto d3-dsv preparer |
| Papildomi source faktai | Atskiras 2026-10-17 GitHub snapshot: 756 tikslios repo tapatybės, 39 not-found-or-inaccessible, 1 identity conflict; 725 žinomos pirminės kalbos. Visų 755 tinkamų exact-identity katalogo pins objektai rasti | Frozen katalogas / pins / benchmark neperrašyti. Objekto buvimas nėra kodo peržiūra, tinkamumas ar runtime patikra; 40 įrašų pin neturi, konfliktuojantis netikrintas |
| Populiarumas | `catalog/popularity.json` yra datuotas 18 šaltinių / 150 cumulative-stars / 45 trending observations tyrimas; Library canonical projekcijoje yra 89 repo stars su šaltiniu ir data | Ne visų 796 repo metadata; observations nėra unikalūs repo. Missing nėra 0; automatinis refresh dar neįgyvendintas |
| Jev | Tikras Graphile worker parinko CSV / JSON ir abstain: 3/3 live conformance PASS, 1261 input / 130 output tokenų, 0.000052962 USD provider usage. [Įrodymai](experiments/JEV-WORKER-2026-10-17.md) | J3 papildoma nauda, platesnė atranka/kalbos ir native Jev tool kelias neįrodyti; visas istorinis 1 USD cap šiuo metu rezervuotas |
| Usage / budget | Request-scoped observer, trusted stored Jev credential / operator payer mapping, atominis account/routing rezervas ir awaited onUsage sujungti; toks pats callId ir istoriniame ledger. Unknown hold, cap0 ir replay patikros PASS | Kitų provider/model profilių ir mokamų fallback/child kvalifikacija atskira; provider kaina / host usage nėra visuotinai Zero enforcement |
| Zero Lab | Oficialus Claude CLI, cohort/compact runner, API/SQLite/browser tikrintuvai, report comparison ir tikri pakartojimai | Lab UI, kelių užduočių produkto acceptance ir nepriklausomas holdout |
| REA / Treg | Šaltiniai ir profiliai ištirti; būtini vėlesniame produkto plane | Zero produkto tikri conformance/permissions/resource scenarijai. REA native Windows proceso capture šiame snapshot nepalaikomas; REA nėra sandbox |
| MCP serverio protokolas | Serveris 0.3.0 / schema 1.3.0: trys numatyti discovery tools, atskiri dated metadata; operator-bound profilis prideda prepare/job/artifact/cancel/verify per esamą API/worker. Visas STDIO/API/Graphile/Docker host fixture proof PASS | Naujas tikras native host execution bandymas dar nepriimtas; protokolo proceso proof jo neimituoja |
| Native host ryšys | Naujas Codex desktop pokalbis tikrai iškvietė visus tris discovery MCP tools per Windows–WSL bridge | Claude Code ir kitos OS NOT_RUN; execution/useful-result dar nepriimti. [Įrodymai](experiments/MCP-PREVIEW-2026-10-17.md) |
| Native komponentas / rezultatas / nauda | Bendras grant policy, sesijos API, Graphile/Artifact, paruošimas ir penkių failų Docker verify sujungti; proceso restart/reconnect, hash, idempotency, actual parser use, rezultatų / stale / revoke kontrolės PASS | Tikras native host actual-use/verified-outcome ir repeated-benefit dar nepriimti; fiksuotas kūrimo rinkinys nėra independent holdout |
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
