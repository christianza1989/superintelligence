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
| MCP serverio protokolas | Serveris 0.4.0 / schema 1.4.0: trys numatyti discovery tools; operator-bound profilis prideda šešis prepare/job/artifact/cancel/verify/freshness tools per esamą API/worker. Freshness worker/API kontrolės 36/8 ir tikra native 0.4 CSV eiga PASS | Native 0.3 post-edit freshness FAIL išsaugotas; kitų profilių kvalifikacija atskira. [Atskiros epochos](experiments/MCP-PREVIEW-2026-10-17.md) |
| Native host ryšys | Naujas Codex desktop pokalbis per Windows–WSL bridge tikrai naudojo supakuotą 0.4 serverį: 14 MCP įvykių, backend available, devynios operacijos | Claude Code ir kitos OS NOT_RUN; platinamo plugin lifecycle atskiras. [Įrodymai](experiments/MCP-PREVIEW-2026-10-17.md) |
| Native komponentas / rezultatas / nauda | Tikras host integravo keturis pinned vendor failus; penkių failų Docker verify PASS, trys actual-use kontrolės, idempotency ir SHA grandinė. Po komentaro zero_freshness grąžino changed; istorinis receipt nepakito | Tai viena ribota CSV development eiga. Independent holdout, formalus A/B ir repeated-benefit nepriimti; kitų komponentų palaikymas neįrodomas |
| Naršyklė / PDF | Pirmas naršyklės procesinis rinkinys 38/38: 19 offline ir 19 real Chromium patikrų. Atskiras lengvas PDF profilis: 10/10 sintetinių failų, 56 skaitiniai langeliai ir page/bbox provenance; image 310 032 256 B | Naršyklės kernel resursų izoliacija ir abiejų profilių patvarus API/worker kelias dar nepriimti. Docling profilis viršijo G0 ir jo vykdymas FAIL; šie development rinkiniai neuždaro G2 |
| Papildiniai / svetainės prijungimas | Savarankiškas plugin numatytai discovery; 0.4 Linux operator opt-in turi atskirą execution bundle be DB/worker/verifier/native bibliotekų. Codex Windows 0.4 update/uninstall/reinstall su trimis naujų sesijų inventoriaus/tool patikromis PASS. Linux package/HTTP fixture ir Windows execution refusal PASS. Svetainėje STDIO vedlys | Platesnis execution lifecycle, Claude ir naujo žmogaus setup dar nepriimti; Copy command nėra connected |
| Platinimas / beta | Vietinio source paketo ir setup įrankiai yra | Naujo žmogaus MVP/beta, signed update/recovery ir native OS matrica |

## Patikros ir jų ribos

Astra šiame source snapshot pakartojo:

- `npm run test:foundation`: **98/98**.
- `node scripts/platform.mjs exec vitest run packages/testkit/src/history-context.test.ts packages/adapters/src/context-selection.test.ts packages/adapters/src/runtime-context.test.ts`: **49/49**, su vietiniu emuliatoriumi.

147 testų PASS neuždaro ankstesnės **53/54 history/context kvalifikacijos** nesėkmės ir neįrodo gyvo produkto kokybės. Ankstesnės DB/budget/UI/build patikros pažymėtos istoriniuose įrašuose, šiame audite jos nepaleistos iš naujo. Naujausių dokumentų/build patikrų rezultatai įrašomi [sutvarkymo ataskaitoje](DOCS-CLEANUP.md).

## Eksperimentų būklė

Claude prenumerata pasirinkta vietiniam coding Lab. Naujausi StockDesk bandymai naudojo oficialų CLI **2.1.301, Haiku 5.5/high** abiem pusėms; senesni Sonnet ir CLI 2.1.292 rezultatai turi atskirus profilius. Codex CLI auth ir pagrindinio coding modelio OpenRouter lenktynės atidėtos. Native Codex desktop MCP discovery ir ribotas 0.4 CSV execution profilis jau patikrinti su host paskyra, neperkeliant CLI auth. Formalus A/B bandymas dar NOT_RUN. Jev API turi atskirą anksčiau suteiktą bendrą 1 USD cap; ledger nėra atstatomas.

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

Toliau kvalifikuoti plugin update/uninstall ir palaikomo execution profilio lifecycle, sujungti izoliuotus browser/PDF profilius su tuo pačiu patvariu API/worker, išmatuoti bendrą G0 ir užbaigti G1 backup/retention kontrolę. Native CSV integracija priimta tik savo ribotai development apimčiai. P1E.10–P1E.11 formalus palyginimas, Library projekto sukūrimas, G2 ir naujo žmogaus MVP1 lieka atviri. [Profilių ribos](MCP-INTEGRATION.md#7-profilių-vartai-ir-įgyvendinimo-seka), [ROADMAP](../ROADMAP.md), [MVP-ROADMAP](../MVP-ROADMAP.md). Atviri vartai nežymimi PASS dėl maketo ar dokumentų sutvarkymo.
