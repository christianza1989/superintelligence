# Pirmo MVP įgyvendinimo būsena

2026-10-16 UTC. **MVP pradėtas, pirmas UI/svetainės pjūvis veikia; pilnas techninis MVP dar nepriimtas.** Šis failas skiria realų įgyvendinimą nuo ankstesnių dizaino maketų ir source tyrimo.

**Aktualumo pastaba 2026-10-17:** žemiau išsaugotos pirmo MVP pjūvio patikros. Vėlesnės Claude kohortos ir atskiri gyvi Jev paruošimai jau atlikti; jų aktualūs faktai yra [SprintDesk](CLAUDE-CALIBRATION.md), [StockDesk](STOCKDESK-CALIBRATION.md) ir [viso projekto analizėje](PROJECT-ANALYSIS-2026-10-17.md). Pastaroji susieja dokumentų teiginius su kodu ir dabartinėmis regresijomis. Produkto workerio Zero selectors, bendro biudžeto ir pilno source/build ciklo integracija tebėra atvira.

## Priimti įgyvendinimo sprendimai

- Rakazo exact-pin `7d5e64c886da7d556673f99e4923b013315007a9` source adaptuojamas `platform/`, su upstream Apache-2.0 ir notices. Tai tikras produkto kodo pernaudojimas, o ne ekrano perpiešimas nuo nulio.
- React/Vite workspace ir esamas API/Graphile/PostgreSQL branduolys. OpenCode UX principai; antro OpenCode scheduler nepridedame. Ankstesnis minimalus Python variantas lieka fallback istorijoje.
- Bendri semantiniai UI tokens ir esamas appearance persistence/fallback; default juoda/salotinė. Light/System pasirinkimai išlieka, daugiau temų ateityje.
- Esama Astro svetainė adaptuota tam pačiam RepositoryZero identitetui ir tam pačiam source katalogui.
- Vietinė indeksinė repo paieška atskirta nuo serverio Jev tools selector. Pagrindinis reasoning/coding modelis yra atskira funkcija.

## Kas realiai yra

| Dalis | Dabartinis faktas | Riba |
|---|---|---|
| `/discover` web katalogas | Vietinė paieška, kategorijos, exact source SHA, licencijos pastabos, kandidato detalės ir sąžininga empty būsena |796 istorinio registro įrašai, ne796 integracijos; read-only source naršymas |
| Tema ir UI | Bendri Rakazo primitives ir naujas katalogo ekranas, juoda/salotinė default, tema išlieka po reload | Naujo ekrano English fallback; visų8locale naujų key vertimai dar nepriimti |
| Oficiali svetainė | Home/catalog/roadmap/changes/docs/support, source JSON iš bendro indekso, responsive vaizdai | Vietinis preview, ne public deployment; GitHub login dar nėra; donate NOT_CONFIGURED |
| Jev adapteriai | Bendras SystemOne choice/noul/score transportas; tools, model ir repo selectors; leidimai/reserve, bounded payload/body/deadline, abstain ir source/profile recheck | Offline PASS; gyvas repo preflight blocked dėl tinklo prieš model dispatch. Key yra tik privačioje ignoruojamoje jungtyje; modelio entitlement/kaina nepatvirtinti |
| Patvarus rezervų ledger | Atominis bendro account ir lane allocation nurašymas, kvietimų/USD micro/token ribos, unikalus invocation, išliekantis hold | Pirmas vienkartinio allocation pjūvis; tikras provider account susiejimas, periodai/reconciliation ir visų mokamų kelių prijungimas dar laukia |
| Agento repo paieška | `repository_search` įrankis esamame Rakazo executor; vietinis indeksas, iki5source kandidatų ir reuse instrukcija | Paieška neįdiegia kodo; pilnas tikslinio source gavimo ir izoliuoto build ciklas dar nepriimtas |
| Savo projekto reuse demonstracija | `npm run demo:reuse` kviečia tikrą paieškos funkciją, tikrina Rakazo source pin ir skaito7esamų komponentų manifestus | Scripted, žmogaus/agentų atranka; ankstesni testai atskirai datuoti, ne tariamai per šį demo vykdyti. [Eiga ir source palyginimas](SELF-REUSE.md) |
| Local profile | Pinned pnpm9.15, Node24, frozen scoped dependencies, nepriklausomi atsitiktiniai vietiniai secrets ir loopback PostgreSQL16 | Prisma generate, migracijos, API ir vieno Graphile workerio boot PASS; vystymo profilis, ne produkcijos acceptance |
| Zero Lab | Bendras offline planas ir A/B vietinis CLI runneris; atskiros darbo vietos, vienodi limitai, atomic JSON ataskaita, tikri usage, Docker API/SQLite/desktop/mobile/keyboard acceptance ir read-only reportų palyginimas | Importuota Claude v2 baseline/retrieval pora ir abi programos pervertintos: API/SQLite/UI PASS. Pilnas produkto runtime/Jev/Auto ir Lab UI nepriimti. [Modulio planas](ZERO-LAB.md) |
| Kalibravimo pakartojimai | `lab:cohort`:1–3poros, kaitaliojama eilė, source/prompt freeze, atskiri laikai, baigtiniai limitai ir pertrauktų bandymų apskaita; atskiras kompaktiško konteksto kandidatas |54offline testai PASS; realūs repeat/compact dry-run su0modelių. Naujas live preflight sustojo dėl trūkstamo Claude CLI; kokybės/tokenų nauda dar NOT_RUN. [Įrodymai](../catalog/claude-cohort-checks.json) |
| Izoliuotas reuse build | Hono pagrindo fixture, frozen paketas, build ir6funkciniai testai; negative control aptinka regresiją | Kontroliuojamas in-memory API be generuojančio modelio ir UI. [Įrodymai](../catalog/reuse-build-checks.json) |
| Codex CLI bridge | Oficialus exec/json kelias, fiksuotas pageidaujamas modelis/reasoning, env allowlist ir riboti procesai | Gyvas startup sustojo dėl read-only CLI būsenos. Auth status0 neįrodo modelio invoke. Credential failai nekopijuoti |
| Tikra darbo erdvė | Vietinė paskyra, modelio prijungimo atidėjimas, naujas agentas ir jo išlikimas po reload | Browser smoke be LLM; pokalbio modelio vykdymas dar nepatikrintas |
| Būsimi cloud projektai | Darbo vietos ir Google Drive saugyklos kontraktas aprašytas | Tikras remote/Drive OAuth dar neįgyvendintas |

Pradinis806/757tyrimo snapshot neperrašytas į tariamus runtime benchmarkus. Rakazo web build ir mūsų UI/adapterio testai turi atskirą įrodymų sluoksnį. Nei browser/PDF/coding30užduočių acceptance, nei SAI/desktop/update vartai šiuo pjūviu nepriskiriami PASS.

## Paleidimas

Iš repo šaknies, su palaikomu Node/npm:

```bash
npm run setup
npm run dev
```

`npm run dev` paleidžia pirmą web UI pjūvį: `http://127.0.0.1:5173/discover`. Katalogas veikia be mokamo modelio ir be API paskyros. Workspace pokalbio vykdymui būtinas paruoštas backend; vien web serveris jo nepaleidžia.

Svetainė atskirame terminale:

```bash
npm run dev:site
```

Adresas `http://127.0.0.1:4321/`. Production domain `PUBLIC_SITE_URL` ir app nuoroda `PUBLIC_APP_URL` nustatomi atskirai; numatyto neegzistuojančio domeno nėra.

Backend paruošimas:

```bash
npm run init:local
npm run db:up
npm run db:generate
npm run db:migrate
```

Tada atskiruose terminaluose `npm run dev:api` ir `npm run dev:worker` bei web UI. `init:local` neperrašo esamos `.env`, nerašo modelio key ir nespausdina secrets. Duomenų volume neištrinamas kaip rutininė stop komanda. Tai vystymo profilis su `SANDBOX_PROVIDER=none`, ne hostile-code vykdymo ar produkcinis multi-tenant profilis.

Modelio key buvimas savaime nesuteikia neriboto spend. Globalus Rakazo `OPENROUTER_API_KEY` gali įjungti pagrindinį modelį; jo nelaikome Jev-only grant. Tikro rakto neprašome viešame pokalbyje ir nepridedame į source. Dabartinis coding eksperimento profilis yra oficialus Claude CLI su prenumerata, Sonnet5.5/high; Codex auth ir OpenRouter lenktynės atidėtos. Jev vienkartinio repo smoke kelias turi atskirą1call ledger ir jokių retry, bet šiame paleidime sustojo tinklo preflight prieš modelį. Tai dar nėra produkcinis account brokeris ar patikrintas invoice cap.

## Patikra

- 98 deterministiniai unit testai10failų: katalogas, agento paieškos įrankis, neaktyvaus Jev adapterio ribos, susijusios temos/locale ir runtime tool schema; PASS.
- 3 Playwright naršyklės scenarijai: source evidence be install, empty state, temos persistence ir tikros vietinės paskyros/agento išlikimas po reload be modelio key; PASS naudojant sistemos Chromium. Sintetinė workspace paskyra pašalinama autentifikuotu API keliu.
- Web production build ir TypeScript check; PASS. Visas `@rakazo/adapters` TypeScript check ir naujo serverio Jev failo atskiras strict check; PASS.
- Prisma generate, vietinės bazės migracijos, API capabilities atsakymas ir vieno Graphile workerio ready; PASS.
- 4 esami executor kritinių būsenų testai su tikra PostgreSQL vienkartine baze: concurrent claim, expired lease/higher fence, uncertain external effect be replay ir terminal commit race; PASS. Vienkartinės bazės migracija ir pašalinimas PASS, pagrindinė bazė/volume nepaliesti.
- 6 nauji rezervų ledger scenarijai su tikra vienkartine PostgreSQL baze: bendras concurrent cap, account/lane rollback su SQL gedimu, globaliai unikalus invocation, hold/reconnect, nuliniai/netinkami allocation ir pinigų riba; PASS. DB bei adapterių TypeScript patikros PASS. [Aprėptis ir ribos](BUDGET-FOUNDATION.md).
- Astro svetainės build; PASS. Desktop/mobile vizualinė peržiūra ir katalogo paieška; peržiūrėta, be pastebėto overflow ar JS klaidų. Marketing puslapiams atskiri unit/e2e testai nekuriami pagal upstream instrukciją.
- Katalogų/JSON/schema/CSV/Markdown originalių planų nuoseklumo patikra atskirai `catalog/document-validation.json`.

`npm run test:foundation` vykdo šiuos98unit testus. `npm run test:durability` sukuria savo vienkartinę loopback PostgreSQL bazę, pritaiko migracijas, vykdo tik4nurodytus esamus executor testus ir pašalina tik savo bazę. Vykdymo modeliai/įrankiai tame teste yra deterministiniai fake, provider keys neperduodami. Tai ribota tikros DB patvarumo patikra, ne Graphile multiprocess restart, realių išorinių efektų ar pilnas saugumo auditas.

`npm run test:budgets` tuo pačiu izoliuotu keliu vykdo tik6naujo ledger scenarijus. Rezervavimo sumų ribos nėra įrodymas apie tikrą provider sąskaitą; mokami modeliai lieka neaktyvūs.

## Kas dar nepriimta

Ankstesnis `binaries.prisma.sh` proxy403 blokas išspręstas po naudotojo tinklo nustatymo pakeitimo. Oficialus Prisma engine gautas įprastu keliu; generate, migracijos ir API/worker boot tikrai atlikti. TLS ar checksum ribos neapeitos. Tai nepatvirtina visų kitų išorinių domenų prieinamumo.

Dar reikia pilno API+Graphile recovery pjūvio, patvaraus globalaus grant/account biudžetų brokerio, tikrų provider usage/requestID kvitų, gyvo Jev ir atskiro pagrindinio modelio patikros bei norminių30užduočių. Šiame cloud integravimo etape naujų modelių kvietimų0; importuotos Claude sesijos turi atskirą kilmę. Pilnas produkto vykdymo ciklas, Google Drive, bendras provider OAuth brokeris, REA/Treg, GitHub portalas, autonominiai PR ir signed updates turi savo dar atvirus [MVP](../MVP-ROADMAP.md) bei [viso roadmapo](../ROADMAP.md) vartus.

Projekto source ir dokumentacija versijuojami [GitHub saugyklos `main` šakoje](https://github.com/christianza1989/superintelligence/tree/main). Pradinis įkėlimas į tuščią saugyklą nėra software release; domenas/hostingas/donate nepublikuoti. [Antro agento įgyvendinimo peržiūra](reviews/mvp-feasibility-review.md).

## Daugkartinis kalibravimas

`npm run lab:plan` PASS:4profilių planas, tikslių šaltinių SHA256, attempted0 ir nežinoma kaina null. [Zero Lab](ZERO-LAB.md), [metodas](CALIBRATION.md), [užduotis](../benchmarks/sprintdesk-v1/README.md). Gyvo Codex startup blokas yra vietinė read-only CLI state vieta, o OpenRouter turi atskirą tinklo403; nerodome nei vieno kaip modelio kokybės rezultato.

Atskirai `npm run test:codex-bridge`:17deterministinių native Node scenarijų PASS (argv/env, JSONL usage, cancellation/output/time ir nesėkmingas startup). Tai CLI tilto kontrakto patikra, ne Codex modelio palaikymo ar sukurtos programos PASS.

Integruotas Claude adapteris, versionuotas promptas v2 ir WAL kopijos tikrintuvas. Runnerio13, comparison12, bendro acceptance6 ir pasirenkamo CLI paruošimo4offline scenarijai PASS. Tikri Docker rinkiniai: API/SQLite14/14 (įprastas SQLite, WAL ir in-memory regresija), browser13/13 (desktop/mobile ir dvi UI regresijos). Abi importuotos sugeneruotos programos pakartotinai praėjo bendrą API/SQLite/UI kontraktą pagal tą patį source digest, be naujų modelių kvietimų. [Tikros poros metrikos ir jų ribos](CLAUDE-CALIBRATION.md), [vietinis Claude kelias](LOCAL-LAB.md).
