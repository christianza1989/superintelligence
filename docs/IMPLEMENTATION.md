# Dabartinė įgyvendinimo būsena

**Atnaujinta 2026-10-21.** Pradinio Astra audito atskaitos kodas `fe14bdd4fb9cd8805938e1169a4bd2d13961bb86`: tikslinės kodo vietos, 102 Markdown failų inventorius ir 147 offline patikros, ne viso kodo saugumo auditas. [Audito įrodymai](audits/2026-10-17-astra/EVIDENCE.json). Toliau pateikti vėlesnio įgyvendinimo faktai turi atskiras [MCP patikrų ribas](experiments/MCP-PREVIEW-2026-10-17.md); visas MVP dar nepriimtas.

| Sritis | Faktinė būsena | Kas dar nepriimta |
|---|---|---|
| Produkto bazė | Rakazo pasirinktas ir adaptuotas `platform/`; React, PostgreSQL/Graphile, API ir worker jau yra source | Pilnas Zero end-to-end reuse acceptance, G0/G1 ir švaraus host footprint |
| UI / svetainė | Savarankiška Library su filtrais, datuotais stars, indeksavimo rikiavimu, detalėmis ir Saved. Paruošto CSV profilio faktai rodomi atskirai nuo 796 repo; raktai dešimtyje esamų locale. Desktop/mobile, klaviatūra, RU ir filtrų atskyrimas patikrinti su production build. Source vaidmuo ir projekto aprašas išsaugomi kaip hash-checked artefaktas; atskiras Start planning task grąžina tikrą Graphile task/run receipt. Svetainėje klientų/OS STDIO vedlys | Handoff unit / PG bei mocked UI patikros PASS, tačiau jis dar nekvalifikuoja projekto sukūrimo ar integracijos; L5/P2.14 ir visi MVP srautai atviri. Naujos CI browser kontrolės atskiros nuo vietinės vizualios patikros |
| Katalogas / paieška | 796 source įrašai; 757 sourceAvailable, 756 pinned, 158 netuščios capability; katalogo runtimeTested ir licenseApproved žymų 0. Ribotas LT/EN žodynas ir hard constraints; [development rinkinyje 48/48](experiments/NEED-RETRIEVAL-2026-10-17.md). Atskiras vieno paruošto CSV profilio paieškos sluoksnis core/MCP su ribomis, source SHA ir scoped conformance faktais | Tai ne bendras 100 % fit. Nematytas holdout atviras; profilio faktai nepatvirtina viso repository, dabartinio grant ar projekto integracijos. Frozen katalogas nepakeistas |
| Papildomi source faktai | Atskiras 2026-10-17 GitHub snapshot: 756 tikslios repo tapatybės, 39 not-found-or-inaccessible, 1 identity conflict; 725 žinomos pirminės kalbos. Visų 755 tinkamų exact-identity katalogo pins objektai rasti | Frozen katalogas / pins / benchmark neperrašyti. Objekto buvimas nėra kodo peržiūra, tinkamumas ar runtime patikra; 40 įrašų pin neturi, konfliktuojantis netikrintas |
| Populiarumas | `catalog/popularity.json` yra datuotas 18 šaltinių / 150 cumulative-stars / 45 trending observations tyrimas; Library canonical projekcijoje yra 89 repo stars su šaltiniu ir data | Ne visų 796 repo metadata; observations nėra unikalūs repo. Missing nėra 0; automatinis refresh dar neįgyvendintas |
| Jev | Tikras Graphile worker parinko CSV / JSON ir abstain: 3/3 live conformance PASS, 1261 input / 130 output tokenų, 0.000052962 USD provider usage. [Įrodymai](experiments/JEV-WORKER-2026-10-17.md) | J3 papildoma nauda, platesnė atranka/kalbos ir native Jev tool kelias neįrodyti; visas istorinis 1 USD cap šiuo metu rezervuotas |
| Usage / budget | Request-scoped observer, trusted stored Jev credential / operator payer mapping, atominis account/routing rezervas ir awaited onUsage sujungti; toks pats callId ir istoriniame ledger. Unknown hold, cap0 ir replay patikros PASS | Kitų provider/model profilių ir mokamų fallback/child kvalifikacija atskira; provider kaina / host usage nėra visuotinai Zero enforcement |
| Zero Lab | Oficialus Claude CLI, cohort/compact runner, API/SQLite/browser tikrintuvai, report comparison ir tikri pakartojimai | Lab UI, kelių užduočių produkto acceptance ir nepriklausomas holdout |
| REA / Treg | Šaltiniai ir profiliai ištirti; būtini vėlesniame produkto plane | Zero produkto tikri conformance/permissions/resource scenarijai. REA native Windows proceso capture šiame snapshot nepalaikomas; REA nėra sandbox |
| MCP serverio protokolas | Source 0.7.1 / schema 1.7.0: trys discovery tools, 22 operator-bound su CSV, PDF/HTML, approved URL tyrimu ir PDF CSV. [162 ankstesnės fokusinės regresijos ir proceso/HTTP fixture PASS](experiments/SCOPED-RESEARCH-AND-PDF-CSV-2026-10-21.md); [planavimo / paieškos pataisos ir 82 regresijos](experiments/NATIVE-VALUE-PILOT-2026-10-22.md) | Tai transporto ir development patikros; native 0.7 neperima 0.4 priėmimo, kuris išlieka atskiras. Hook trust, automatinis MCP naudojimas ir visas Jev kelias atskiri |
| Native host ryšys | Naujas Codex desktop pokalbis per Windows–WSL bridge tikrai naudojo supakuotą 0.4 serverį: 14 MCP įvykių, backend available, devynios operacijos | Claude Code ir kitos OS NOT_RUN; platinamo plugin lifecycle atskiras. [Įrodymai](experiments/MCP-PREVIEW-2026-10-17.md) |
| Native komponentas / rezultatas / nauda | Tikras host integravo keturis pinned vendor failus; penkių failų Docker verify PASS, trys actual-use kontrolės, idempotency ir SHA grandinė. Po komentaro zero_freshness grąžino changed; istorinis receipt nepakito | Tai viena ribota CSV development eiga. Independent holdout, formalus A/B ir repeated-benefit nepriimti; kitų komponentų palaikymas neįrodomas |
| Naršyklė / PDF | [Sujungtas PDF/HTML API/PG/Graphile/Docker 19/19, PDF CSV 37/37 ir URL tyrimo 11/11 PASS](experiments/SCOPED-RESEARCH-AND-PDF-CSV-2026-10-21.md). Atskiras [captured original-URL profilis: 14 offline ir 7 tikros naršyklės kontrolės PASS; jo API/worker source turi 163 offline patikras ir tipų PASS](experiments/URL-DOCUMENT-PROFILE-2026-10-21.md). PDF CSV page/bbox provenance ir dabartinių leidimų tikrinimas | Kontroliuojami development fixtures; naujo captured replay API/worker gyvas bandymas dar NOT_RUN, nėra live TLS ar originalo tikslumo teiginio. Docling ir Chromium limitų nesėkmės išsaugotos. Frozen 30 užduočių rezultatai nepakeisti; ne G2 PASS |
| Fiksuotas programos receptas | [CSV išlaidų peržiūros source/build/browser profilis: 14 offline ir 29 tikros Docker/naršyklės patikros PASS](experiments/RUNTIME-AND-APPLICATION-2026-10-21.md). Esamas API/Graphile kelias: 148 offline ir 21 tikra API/PostgreSQL/worker/Docker patikra PASS; hash-checked privatus workspace/receipt, atšaukimas, revocation ir bendra darbų kvota | Tai vienas fiksuotas receptas. Library/MCP prijungimas, bendras AI parašytų programų tikrinimas, tikslaus CSV failo atsisiuntimas ir coding/G2 dar nepriimti |
| Perkeltas runtime paketas | [Stage 6 sealed paketas 393 455 596 B, neįskaitant Docker images ir DB; 9/9 tikros perkėlimo patikros PASS](experiments/RUNTIME-AND-APPLICATION-2026-10-21.md). 103 migracijos, API/worker, bendras web, Graphile CSV ir abiejų procesų graceful-stop su kodu 0. 50 runtime ir 30 worker regresijų PASS; ankstesnės nesėkmės išsaugotos | Tai host package feasibility, ne visas runtime acceptance. Švaraus host, viso profilio RAM/diskas, pilnas UI, trys gebėjimai ir native host nepriimti. Paketas local-only; platinimo licencijų vartai ir visas G0/G1 lieka atviri |
| Atsarginė kopija / atkūrimas | [Quiesced native helper](experiments/NATIVE-BACKUP-2026-10-17.md): 8/8 tikrų PG/Compose kontrolės, 103 canonical migracijos, DB ir susieto blob round-trip; 32 offline testai. Foreign scope, pakeistas blob ir nepatikimas manifestas atmesti | Sintetinė instaliacija; live/off-host, storage retention, fizinis disk-full ir pilnas G1 dar nepriimti. Writer restart reikalauja perkurti bind konteinerius |
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

Toliau kvalifikuoti palaikomo execution profilio lifecycle ir bendrą perkeltą runtime paketą, išmatuoti visą G0 ir užbaigti likusias G1 retention / gedimų kontroles. Numatyto Codex Windows discovery plugin update/uninstall/reinstall jau patikrintas; browser/PDF API/worker development kelias sujungtas. Native CSV integracija priimta tik savo ribotai development apimčiai. P1E.10–P1E.11 formalus palyginimas, Library projekto sukūrimas, G2 ir naujo žmogaus MVP1 lieka atviri. [Profilių ribos](MCP-INTEGRATION.md#7-profilių-vartai-ir-įgyvendinimo-seka), [ROADMAP](../ROADMAP.md), [MVP-ROADMAP](../MVP-ROADMAP.md). Atviri vartai nežymimi PASS dėl maketo ar dokumentų sutvarkymo.
