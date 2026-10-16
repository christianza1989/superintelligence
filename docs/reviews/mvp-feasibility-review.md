# Rakazo vietinio MVP paleidimo peržiūra

2026-10-16. Naudotojas autorizavo pradėti įgyvendinimą. Pasirinktas Rakazo source `7d5e64c886da7d556673f99e4923b013315007a9`, pernaudojamas kataloge `platform/`. Pradinės boot išvados paremtos kodo peržiūra. Paskutiniame skyriuje atskirti mano vėliau realiai atlikti4izoliuotos DB testai ir pagrindinio agento pateikti Prisma/API/worker rezultatai. Nekeičiu jo API/core/web konfigūracijų.

## Mažiausias prasmingas profilis

**Web + API + vienas Graphile worker + PostgreSQL**, vienas bendras data katalogas, vietinė password/session autentifikacija ir vietinis encrypted secret store. Rakazo Hono/Pi/Prisma/Graphile yra pasirinktos bazės dalys; FastAPI ar SQLite nepridedami kaip konkuruojantis vykdymo kelias.

- Source engines: Node `^22.22.2 || ^24.0.0 || >=26.0.0`, package manager `pnpm@9.15.0`. Root agentas turi patikrinti savo pnpm wrapper / lockfile atitiktį; svetainės agentas lygiagrečiai dependencies neinstaliuoja.
- `@rakazo/db`: `prisma generate`, po to `prisma migrate deploy` į paskirtą vietinę DB. Prisma7.10 PostgreSQL adapteris ir schema nepritaikomi SQLite vien pakeitus URL.
- API `apps/api/src/index.ts` → `createApp`; bind default `127.0.0.1:3100`. Web/auth default origin `http://127.0.0.1:5173`; išlaikyti nuoseklų cookie/CORS/proxy kelią.
- Worker `apps/worker/src/index.ts` visada reikalauja `DATABASE_URL`, kuria DB, realtime, secret store, runtime, connectors, executor, job handlers ir reconciler. Pirmam profiliui vienas worker, `GRAPHILE_WORKER_CONCURRENCY=1`; DB pool turi vietos Graphile LISTEN ir reconciliation advisory-lock ryšiams.
- API ir worker naudoja tą patį **absoliutų** `DATA_DIR`, encryption key ir DB; numatytas `./data` nuo skirtingų package cwd sukurtų skirtingas būsenos vietas.
- Pirmam UI/auth/DB boot galima `SANDBOX_PROVIDER=none`, `AGENT_RUNTIME=pi`, `WAKEUP_DRIVER=graphile`; computer veiksmai tada sąžiningai unavailable. Root `pnpm dev` aklai netinka šiam mažam profiliui: jis kartu paleidžia sandbox-supervisor.
- Tikram browser/code/computer pjūviui vėliau reikia tikro pasirinkto execution provider; `NoneSandboxProvider.provision/execute/observe` užsidaro su klaida. `none` nėra veikiantis sandbox ar MVP trijų modulių priėmimas.

`WAKEUP_DRIVER=memory` API viduje paleidžia ir handlers/reconciler; tai galimas vienprocesis diagnostinis boot, bet PostgreSQL vis tiek reikalingas. Atskirame API ir worker procese sukurtos dvi in-memory eilės nėra bendras transportas. Atminties eilė nepatenkina patvarių pending jobs atkūrimo vartų; jos diagnostinio demo nevadinti G1/M1 PASS.

## Paslaugos ir slapti prerequisites

| Sritis | Patikrintas source faktas | Pradinis pasirinkimas |
|---|---|---|
| Secrets | `SECRET_STORE` default `encrypted`; Infisical konfigūracija reikalinga tik jį pasirinkus. | Vietinis encrypted kelias, sugeneruoti pastovūs local secrets, ne jokie jau turimi paskyrų profiliai. |
| Auth | Password auth default on; OIDC optional, dalinė OIDC konfigūracija fail. | Vietinis account; jokio tariamai veikiančio svetainės GitHub OAuth. |
| Billing | Stripe tik kai sukonfigūruoti visi3laukeliai; dalinė konfigūracija startup fail. `SubscriptionGate` praleidžia kai billing off. | Visi Stripe credential laukai unset; nereikia Rakazo mokamos prenumeratos. |
| Integracijos | Composio, Pipedream, SMTP/OIDC, messaging ir remote computer account yra pasirenkami. | Neįjungiami pirmam boot; root source imports vis tiek gali turėti install dependencies. |
| Logging | Axiom optional; UI/API turi upstream telemetry/update/brand kelius, kuriuos reikia peržiūrėti. | Vietiniai logai, be išorinio telemetry credential. |
| Persist | LocalArtifactStore ir LocalAgentHomeStore, DB bei Graphile jau yra source. | Pernaudoti ir bandyti jų semantiką, o ne pridėti antrą autoritetingą ledger vien dėl kitokio pavadinimo. |

`BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `SCREEN_PROXY_SECRET` laikomi atskirais vietiniais secrets, ne tracked `.env` ar prompt tekstu. Docker vykdymui papildomai atskiras `SANDBOX_SUPERVISOR_TOKEN`. Encryption key negeneruojamas iš naujo kiekvieną startą; atkūrimas turi išsaugoti raktą ir duomenis. Pirmas deployment owner sukuriamas tik vietiniame nepublikuotame profilyje.

## Kritinės įgyvendinimo ribos

1. **Jev key nėra bendras modelių grant.** `deployment-model.ts` aptiktas globalus `OPENROUTER_API_KEY` įjungia main Pi fallback, default model `openai/gpt-6-luna`. Būsimo naudotojo Jev-only key neįrašyti kaip bendro deployment key, kol neįgyvendintas atskiras broker binding ir main-model/routing cap. Main model gali naudoti tą pačią paskyrą tik pagal atskirai pasirinktą profilį. Rakazo Jev auto-review yra kitas naudojimo vaidmuo nei mūsų tools shortlist.
2. **Esamas fuse nėra durable spend.** `MAX_TOOL_CALLS_PER_TURN` unset/0 reiškia unlimited, o skaitiklis proceso atmintyje. Pirminis baigtinis fuse naudingas, tačiau neatstoja DB reservation, global/task/lane count/token/$, SDK retry ir unknown spend apskaitos. Mokamas modelis lieka blocked iki tikro key ir cap.
3. **Autoritetas vienas.** Vienas Graphile jobs kelias, vienas worker pilotui, esamas Postgres reconciliation leadership. API frontend yra intent/state klientas; neprijungti dar vieno OpenCode serverio vien UI labui.
4. **Hostile code nėra įprastas localhost shell.** `none` yra fail closed, Docker trusted lane reikalauja sąmoningai pasirinkto supervisor; Docker socket nereikalingas API. Svetimam kodui būtinas atskiras mūsų griežtesnis VM execution profilis. Jokio automatinio host/provider credential paveldėjimo.
5. **Footprint dar nežinomas.** Source archive35MB nėra cold install, native dependencies, Postgres, Chromium, computer image ar steady/peak RAM suma. Rakazo web-only profilis turi būti pamatuotas; 2GB vartas dar nepraėjęs.

## Kas būtų pirmas realus įrodymas

- [ ] Web ir API pasiekiami viename vietiniame origin; vietinis account/session ir DB įrašas veikia.
- [ ] Viena tikra užduotis pereina Graphile worker, sukuria artefaktą ir atskirą validator baigtį; invalid/missing key/budget neapsimeta sėkme.
- [ ] Worker/API restart išsaugo pending darbą ir galimus išorinius efektus rodo `unknown`, aklai nekartoja.
- [ ] Vienas realus pasirinktas main model ir atskiras Jev/OpenRouter typed call tik gavus key/cap; fake runtime įrodo tik infrastruktūrą.
- [ ] Browser/PDF/code tikri scenarijai ir išmatuoti resursai; `none` boot ar Astro svetainė jų nepakeičia.

Svarbiausi perskaityti exact-pin failai: `AGENTS.md`, root/API/worker/db manifestai, `apps/api/src/index.ts`, `app.ts`, `env.ts`, `apps/worker/src/index.ts`, `secret-store.ts`, `packages/adapters/src/deployment-model.ts`, `sandbox-provider-env.ts`, `none-sandbox.ts`, `secret-store-factory.ts`, `pi-runtime.ts`, web `SubscriptionGate.tsx` ir `docs/self-host.md`. Jie yra konkretaus snapshot įrodymai, ne nepriklausomas viso produkto saugumo auditas.

## Pirmo įgyvendinimo pjūvio rezultatas

Man priskirtoje `platform/apps/www/` dalyje realiai adaptuoti Astro `BaseLayout`, `SiteFrame`, `HomePage`, Header/Footer/Logo ir išlaikytas Button komponentas. Veikia7statiniai puslapiai: homepage, source katalogas, roadmap, changes, docs, support ir404; papildomai generuojami6tikri repo Markdown dokumentai, viešas source JSON bei robots/llms tekstai. Bendri black/lime semantic tokens importuojami iš pernaudotos `ui-tokens` sistemos. Nukopijuotas ir aiškiai konceptu pažymėtas sutartas workspace vaizdas.

Svetainė ir programos `/discover` naudoja tą patį gryną `@rakazo/core/repositoryzero` source snapshot. Svetainės kataloge yra757prieinami unikalūs source kandidatai, lokali paieška, kategorija ir puslapiavimas; nėra download/activate/install mygtuko. Istorinio tyrimo0runtime tests nėra naujų kodo unit testų ar įgyvendinto produkto matas. Source license tekstas nėra mūsų integration/license approval. Dinaminis candidate tekstas rodomas kaip tekstas; į JSON HTML kontekste esantis `<` koduojamas.

**Mano atlikta patikra:** tiesioginis įdiegto Astro build baigėsi sėkmingai, po bendro catalog importo ir galutinių taisymų pakartotas. Chromium vizualiai peržiūrėti desktop/mobile ir katalogas; puslapio JS klaidų neužfiksuota, mobile horizontal overflow nėra, „docling“ filtras rodo1tikrą source įrašą. Stebėti tinklo requestai tik į vietinį svetainės origin. Marketingo unit/E2E suite nekurtas ir nevykdytas pagal upstream AGENTS taisyklę; browser naudotas vizualinei apžiūrai.

Svetainėje pašalinti seno produkto promo/download/payment/waitlist/analytics keliai ir nenaudojami public brand assets. GitHub nuoroda veda į šį projektą; donate **NOT_CONFIGURED**, nėra gavėjo ar mokėjimo surinkimo. Production app/domain neišgalvoti: app nuoroda konfigūruojama `PUBLIC_APP_URL`, dev tik loopback; canonical kuriamas tik turint tikrą `PUBLIC_SITE_URL`. Šis pirmas svetainės pjūvis yra English preview, ne užbaigtas8locale vartas. Public deployment, login/OAuth ir finansiniai veiksmai neatlikti.

Vietinis build preview paleistas `127.0.0.1:4321`. Vizualų failai: `/tmp/repositoryzero-site-hero.png`, `/tmp/repositoryzero-site-desktop.png`, `/tmp/repositoryzero-site-mobile.png`, `/tmp/repositoryzero-site-catalog.png`. Root npm scripts yra rekomenduojamas patvarus paleidimo kelias; aplinkos pnpm wrapper bandė auto-install ir sustojo prieš mano sėkmingą tiesioginį Astro build, todėl nebuvo vykdomas konkuruojantis dependency install.

## Naujo Jev adapterio ir root bootstrap kritika

Perskaityti pagrindinio agento `zero-tool-selector.ts`, grynas `zero-catalog.ts`, root package scripts ir `scripts/platform.mjs`, `init-local.mjs`, `local-db.mjs`. Pinned official SDK patvirtina naudojamą SystemOne `Choice.criteria` request ir `answers.tool.choice` response formą. Repo discovery ir Jev leistinų tools parinkimas kodo riboje išlieka atskirti.

Pirmoje kodo peržiūroje radau **major prieš mokamą aktyvavimą**: eligibility buvo tikrinama tik po modelio kvietimo, taigi revoke po snapshot galėjo nesustabdyti duomenų siuntimo. Pagrindinis agentas pataisė; pakartotinai perskaičiau naują kodą: po rezervavimo yra `authorizeDispatch` provider/account/data-recipient patikra ir kiekvieno profilio `stillEligible` prieš fetch, papildoma selected profilio patikra po atsakymo; config ir shortlist kopijuojami. Reserve/hold klaidos klasifikuojamos fail-closed, nėra retry/redirect, response dydis ribotas. Ši konkreti kritika source lygiu **ištaisyta**; aš realaus provider kvietimo neatlikau.

Naujų blocker šiam neaktyvuotam adapterio/nuoseklaus UI pjūviui neradau. **Neužbaigti aktyvavimo vartai:** patvarus bendro account/task/lane biudžetų ledger, usage/model/requestID receipts ir reconciliation, tikras key bei patvirtinti account/rates. Callback kontraktas nėra pats įgyvendintas account ledger; šiandien adapteris nėra billing-ready ar gyvai Jev patvirtintas. Root bootstrap pinina pnpm, generuoja atskirus atsitiktinius vietinius secrets tik į naują0600failą ir išlaiko esamą konfigūraciją; modelių key reikšmės paliekamos tuščios. Visa tai nepakeičia visų PostgreSQL/API/worker patvarumo ir3modulių acceptance vartų.

## Atnaujintas runtime įrodymas: keturi izoliuoti PostgreSQL scenarijai

**Aplinkos ir root agento pateiktas naujas faktas:** naudotojui įjungus Internet access All, oficialus Prisma schema engine tapo prieinamas ir `prisma generate` pavyko. Po to pagrindinis agentas pranešė apie sėkmingą pagrindinės vietinės DB migraciją, healthy API3100ir vieną Graphile worker. Tai atskiras dabartinis įrodymų sluoksnis, pakeičiantis ankstesnę403blokavimo būseną; aš nepriskiriu šių pagrindinio agento startų savo vykdytiems testams. Perskaitytas `docs/IMPLEMENTATION.md` teisingai atskiria pirmą UI pjūvį nuo viso techninio MVP; jo sena engine403pastraipa turi būti atnaujinta pagal šiuos naujus rezultatus.

**Mano realiai atlikta 2026-10-16 UTC:** suderinus su pagrindiniu agentu parašytas ir paleistas `platform/scripts/verify-zero-foundation.mjs`. Komanda iš repo šaknies:

```sh
node platform/scripts/verify-zero-foundation.mjs
```

Runner pats dependency install nevykdo. Jis iš vietinės konfigūracijos tik atmintyje paima autentifikuotą loopback PostgreSQL prisijungimą, sukuria atsitiktinę atskirą `repositoryzero_verify_…` bazę ir į ją pritaiko tikras esamas Prisma migracijas. Tada vykdo pasirinktus4esamo `executor-lifecycle.test.ts` scenarijus su `scripted` runtime, `fake` sandbox ir `memory` job host. Testinis env yra whitelist su naujais savarankiškais test secrets; modelių/provider keys nepaveldimi. Išvestis surenkama prieš DB password/URL redagavimą, todėl secret negali išsprūsti per dviejų chunk ribą. Sukurtos bazės vardas negali būti pateiktas per argumentą; cleanup naikina tik šio paleidimo sėkmingai sukurtą bazę, niekada pagrindinę DB ar volume.

| Tikslus esamas testas | Realus rezultatas | Ką patvirtina |
|---|---|---|
| `allows only one worker to claim a queued run` | PASS | Dvi concurrent `continueRun` užklausos palieka vieną completed Attempt su fence1. |
| `reclaims an expired running lease with a higher fence` | PASS | Pasibaigęs lease fence7atkuriamas kaip fence8ir užbaigiamas vienas Attempt. |
| `records an uncertain result without replaying an interrupted external effect` | PASS | PG įrašytas `executing` efektas tampa `uncertain`; emuliatoriaus destination įrašų nedaugėja, yra vienas reconciliation įvykis. |
| `fences concurrent terminal commits so only one final message is durable` | PASS | Dvi terminal finalization operacijos palieka vieną galutinį pranešimą ir vieną terminal įvykių seką. |

**Visas šio runner rezultatas: exit0, izoliuotos bazės migracija PASS, tiksliai4passed/0failed ir savo sukurtos DB pašalinimas PASS.** JSON report tikrinamas pagal passed skaičių, todėl skipped ar susiaurėjęs0testų rinkinys negauna PASS. Developer duomenys, pagrindinė DB ir jos veikiantis API/worker nepaliesti. Mokamų modelių ar Jev kvietimų nebuvo.

**Aprėpties ribos:** du claim bandymai vyksta viename test app procese su skirtingais worker IDs; tai nėra atskirų OS workerių crash/restart bandymas. `memory` job host nepatvirtina Graphile queue atkūrimo po proceso žūties. Aukštesnio fence testas savaime nepatvirtina kiekvieno seno workerio vėlyvo write atmetimo. Destination yra emuliatorius; realaus išorinio tiekėjo exactly-once ar rollback neįrodome. Uncertain efekto fixture leidžia Run būseną completed, todėl ši baigtis neprilyginama patikrintam išoriniam rezultatui ar teisingam visų UI unknown būsenų atvaizdavimui. Tai prasmingas siauras tikros PostgreSQL būsenos įrodymas, ne viso M1,3modulių ar Jev/main-model acceptance PASS. Istorinis research katalogas dėl šių testų neperrašytas į tariamai patikrintas integracijas.
