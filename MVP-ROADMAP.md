# RepositoryZero MVP roadmapas

**Atnaujinta 2026-10-17.** Generuojama iš [ROADMAP](ROADMAP.md) tų pačių ID ir checkbox būsenų. Keisti pilną roadmapą ir paleisti `npm run docs:sync`; `npm run check:docs` aptinka neatitikimą. [Dabartinė būsena](docs/IMPLEMENTATION.md), [priimta architektūra](docs/DECISIONS.md).

Techninis preview = vienas tikras mažas worker pjūvis, leidžiant pažymėtą modelio emuliaciją. **Techninis MVP = vienas kvalifikuotas vietinis profilis su tikru modeliu ir pasirinktu Jev ToolSelector, savarankiška Library bei browser/research, PDF ir coding.** CSV demonstracija nepakeičia šių trijų gebėjimų.

## Techninis preview

TP0 yra pristatymo kontrolė; offline vertikalė gali būti kuriama lygiagrečiai observer ir Library. Emuliuotas modelis aiškiai pažymimas. Šis etapas neuždaro MVP.

- [ ] TP0 Root CI vykdo pasirinktus Zero offline/type/regression check be upstream publish/deploy ir be credentials. Dokumentų CI vienas to neuždaro.
- [ ] TP1 Vienas tikras esamo worker scenarijus: kontroliuojamas CSV input → tikras paruoštas komponentas → vykdymas → versijuotas artefaktas → atskiras validator. Emuliuotas modelis aiškiai pažymėtas; galima vykdyti lygiagrečiai OBS darbams.
- [ ] TP2 TP1 cancel/restart/timeout/duplicate atvejai nedubliuoja efekto, failed/blocked/unknown išsaugoti; nuo TP1. Tai siaura aprėptis, ne visas G1.

## Profilis, kontraktai ir G0

Rakazo jau pasirinktas. Lieka kvalifikuoti švarų Linux x86_64 profilį, tikrą model/auth, resursus ir iš anksto užfiksuotus fixtures. 2 GB bazės bei kiti G0 kriterijai nemažinami.

- [ ] P0.0 Kvalifikuoti pasirinktą Rakazo adaptaciją tais pačiais vertikaliais fixtures: visas footprint, artifact/effect/lease atkūrimas, policy/grant ir restart-persisted budgets, hostile lane, licenses bei upstream priežiūros kaina. Bazė pasirinkta (ADR34/A01); buvęs reikalavimas dar kartą rinktis Python ar Rakazo pakeistas, kvalifikacijos vartai nesumažinti. Jei pasirinktas profilis netinka, naujas ADR su faktiniais alternatyvų matavimais.
- [ ] P0.1 Paskirti maintainer, įgyvendinimo ir nepriklausomų patikrų atsakomybes; patvirtinti palaikomą pirmą platformą Linux x86_64.
- [ ] P0.2 Užfiksuoti branduolio licenciją, priklausomybių platinimo scope ir source/model/data atskyrimą.
- [ ] P0.3 Suformuoti 30 nekintamų testinių užduočių: po 10 browser/research, PDF ir coding; synthetic fixtures su expected outputs. Tai kūrimo ir provisional produkto vartų rinkinys. Atskirai paskirti maintainer valdomą, agento kūrimo procesui neprieinamą holdout duomenų ir grader versiją viešiems palyginimams.
- [ ] P0.5 Užfiksuoti ModuleManifest, ToolCall, ToolResult, TaskEvent, ArtifactRef, EffectIntent ir ImprovementProposal schemas.
- [ ] P0.6 Pasirinkti leidimų modelį: failų šaknys, tinklo tikslai, paskyros, side effects, pinigų rezervas ir atšaukimas.
- [ ] P0.7 Švariame host pamatuoti pasirinkto Rakazo web/API/worker/PostgreSQL profilio pilną įdiegimo delta: runtime, DB, images, browser, cache, steady ir peak diską bei RAM. Alternatyvų matavimai tik naujam ADR, jei profilis netinka.
- [ ] P0.8 Atskira maža Docling spike: 10 sintetinių PDF, lentelių skaičiai, pirmas modelių download, diskas ir peak RSS.
- [ ] P0.9 Atskira Playwright spike: vienas browser, 10 savo bandomųjų puslapių, offline fixtures, trace, download limitai.
- [ ] P0.10 Kodo workerio spike: disposable VM prieinamumas, rootless trusted lane ir aiškus hostile lane atsisakymas jei VM nėra.
- [ ] P0.12 Esamos PostgreSQL/Graphile DB kvalifikacija: vienas autoritetingas scheduler, 2 workeriai, lease lenktynės, crash tarp event/outbox, disk-full ir koordinavimo semantika.
- [ ] P0.13 Pasirinkti vieną modelį ir kainos šaltinį / lokalų endpoint; patikrinti jau turimas credential bindings neatskleidžiant reikšmių.
- [x] P0.14 Paskelbti priimti architektūros sprendimai ir pakeistų alternatyvų ribos: [DECISIONS](docs/DECISIONS.md). Tai dokumentinis vartas, ne G0/G1 runtime PASS.
- [ ] P0.23 Intake/BudgetReservation ADR: globalūs faktinių dispatch attempts/total$ + lane/token/compute/concurrency rezervai, SDK retry, dienos apibrėžimas, metaduomenų quotas, cache coverage ir baigtinis queue/storage; no-budget režimas be mokamų kvietimų.
- [ ] P0.25 Kategorijų/capability/skill/resolver kontraktai: canonical IDs/semantika/schemos, sritis→gebėjimas→receptas, small-set/lazy-schema, hard filters ir resultref≠grant; nested skill/child tool cap ir revocation/schema recheck.
- [ ] P0.26 [MVP router spike](docs/ROUTER-EVALUATION.md): naudotojo pasirinktas Jev/OpenRouter official SystemOne route ir dokumentuotas `typesafe/jev-1.13` su actual secret/entitlement/rate/cap; baseline palyginimas, EN/RU ir pasirinktos kalbos, confidence/context/cold/warm/cost/dispatch testai. Laya vietinis profilis vėliau, ne MVP blocker.
- [ ] P0.27 Lokalizacijos ADR:8locale UI keys, EN/RU technical docs ir kitų quickstart aprėptis, locale/fallback/Unicode/plural/date/currency, stable English contracts ir atskira AI input/voice kalbų matrica.
- [ ] P0.28 Kvalifikuoti pasirinktą Rakazo React UI reuse ir OpenCode UX idėjas: trys vienodi srautai, source inventorius, vienas runtime/transportas, notices, locale/theme mapping ir išmatuota fork kaina. Visą OpenCode UI adaptavimą svarstyti nauju ADR tik esamam keliui netikus.
- [ ] P0.29 [Reuse-first projekto ADR](docs/PROJECT-CREATION.md): brief → viena bazė/papildymai; bendruomenės įrodymų source/versija/data, mūsų integracijos statusas, licencijų/API/duomenų suderinamumas ir vienas candidate/child/retry biudžetas.

## Vienas patvarus vykdymas ir G1

Esami primityvai turi veikti vienoje worker grandinėje. G1 išlaiko 50 fault vykdymų, backup/reconnect/cancel ir resursų matavimą. OBS3 būtinas tik jei leidžiami fallback/paid child; iki tol tie keliai išjungti.

- [ ] OBS1 Request-scoped observer per AgentRunRequest; tas pats callId beforeCall/usage/reservation. Du lygiagretūs runs nesumaišo observer, atsisakymas duoda 0 dispatch. Jokio global mutable currentRun ar DB migracijos vien dėl jungties.
- [ ] OBS2 Vieno live profilio trusted connection/account mapping ir atominis account + routing lane rezervas. Vienas callId, existing onUsage autoritetas; unknown hold, cap0 neleidžia dispatch. Priklauso nuo OBS1; mokami fallback/child išjungti iki OBS3.
- [ ] OBS3 Jei profilis leidžia fallback/paid child, kiekvienas actual target turi teisingą account/model/callID ir rezervą, įskaitant helpers/repair. Iki kvalifikacijos šie keliai turi būti išjungti, o ne tyliai paveldėti primary account.
- [ ] P1.1 Pasirinktos bazės repo struktūra ir upstream tracking; aiškūs core/API/UI/contracts/adapters/evals sluoksniai. Rakazo variante pirmiausia pernaudoti ir tikrinti esamus sluoksnius; lockfiles ir pinned build toolchain.
- [ ] P1.2 Projekto, užduoties, žingsnio ir attempt duomenų modelio trūkstamos dalys su migracijomis; Rakazo Artifact/ExternalEffect/Lease modelius pirmiausia pernaudoti ir fault-testinti.
- [ ] P1.3 Event/outbox sandoris, vienas scheduler, lease/fence ir atskira effect ledger būsena.
- [ ] P1.4 Riboto dydžio struktūrinis planas; vienas Pi/modelių adapterio kelias pagal bazę; aiškus invalid-output retry ir patvarus visos užduoties tool-call limitas.
- [ ] P1.5 Gebėjimų registras ir deterministinė atranka pagal schemas, leidimus, platformą ir resursų rezervą.
- [ ] P1.6 Subprocess Tool RPC su timeout, stdout/stderr limito, cancellation ir exit-code kontraktu.
- [ ] P1.7 Artefaktų versijos, turinio digest, owner/ACL, provenance ir saugi preview peržiūra.
- [ ] P1.8 Biudžeto rezervavimas ir settlement; nežinomo išorinio efekto sąnaudas laikyti potencialiai išleistomis.
- [ ] P1.9 SSE progresas, reconnect pagal event_seq, užduoties atšaukimas ir tęstinumas po UI restart.
- [ ] P1.10 Vienas end-to-end vertikalus pjūvis per fake deterministinį įrankį; klaida turi matomą paaiškinimą.
- [ ] P1.11 Backup/restore bandymas su DB ir artefaktų nuorodomis; neteisingo projekto prieigos testas.
- [ ] P1.12 Bazinio cold-install ir idle atminties ataskaita švariame host.
- [ ] P1.13 Localhost launcher, loopback session auth, Origin/Host/CSRF, port/single-instance ir aiškus foreground/background/autostart; duomenų ir app katalogų atskyrimas.
- [ ] P1.14 Vienas veikiantis ModelAdapter ir credential brokeris; renderer/agent gauna tik binding metadata; budget/expiry/refresh/account switch ir leakage canary testai.
- [ ] P1.15 Provider/model capability matrica ir projektui leistini failover keliai; nėra išorinio veiksmo pakartojimo dėl modelio pakeitimo.
- [ ] P1.16 Pernaudotas realus pasirinkto UI workspace/composer ir task/tool/artifact projection; vienas autoritetingas runtime, be dubliuoto auth/agent scheduler.
- [ ] P1.17 Preview/Changes/Checks, Stop/blocked/unknown/reconnect ir accessibility; juoda/salotinė default su semantiniais tokens, theme registry/persist/fallback ir testine alternatyva, daugiau išbaigtų temų vėliau.
- [ ] NEED1 Poreikių ir fit/no-fit retrieval rinkinys su hard constraints bei LT/EN sinonimais. Užfiksuoti dev/holdout atskyrimą; 48 užklausos (24/24) pradinis pasiūlymas, o ne įrodytas optimumas. Singleton netinkamas source negali būti rekomenduotas vien dėl to, kad vienintelis.
- [ ] PREP1 Vienas ribotas source/package preparer su exact pin/lock, source kilme, tikru entrypoint/runtime/license/permissions patikrinimu ir reuse receipt. Inspectable ir execution-ready atskiri; neprivalomas didelis universalus variklis.
- [ ] TRACE1 Backend runner ir verifier susieja poreikio/atrankos/paruošimo/invocation/artifact revision/verification receipts; pradžiai bounded JSON artefaktai. Nepriklausomas panaudojimo ir outcome įrodymas, modelio PASS nepakanka.

## Pasirinktas Jev profilis ir atskiras matavimas

J0–J2 reikalingi naudotojo pasirinktai gyvai integracijai. J3 yra atskiras naudos tyrimas; jo atlikimas gali parodyti ir neigiamą rezultatą. Baseline ar visų užduočių abstain neuždaro J2.

- [ ] J0 Pasirinkto ToolSelector adapterio offline conformance ir worker kontraktas; esami offline primitives tik dalis vartų.
- [ ] J1 Užrakintas ir realiai pasiekiamas pasirinktas Jev API/model/auth/connection profilis su baigtiniu cap; nuo OBS2.
- [ ] J2 Gyvas Jev per esamą worker teisingai pasirenka ir realiai panaudoja leistiną tool, no-fit abstain ir schema/timeout/grant/cap atvejai turi receipts. Baseline ar visi abstain neuždaro; nuo J0/J1 ir veikiančio tool.
- [ ] J3 Atliktas užšaldytas B prieš tą patį B+Jev C palyginimas: kokybė, aprėptis, klaidingi pasirinkimai, visas laikas/kaina ir sąžininga išvada. „Atliktas“ nereiškia „nauda įrodyta“; nuo J2/NEED1.
- [ ] P1D.7 Keičiamas ToolSelector adapteris baseline+MVP Jev/OpenRouter pagal P0.26, vėlesniam Laya paliekant tą patį kontraktą; shortlist IDs/abstain, secret/schema/policy CAS, pasirinktas routing cap atskirai nuo public masinio intake0.

## Savarankiška žmogaus Library

MVP reikalauja L1–L5. Paieška veikia be AI užduoties ir mokamų LLM; Compare, Trending ir Collections nėra šio etapo priklausomybė. L5 priklauso nuo P2.14.

- [ ] L1 Nuolatinis Library navigacijos įėjimas be AI užduoties; paieška pagal repo/paskirtį/aprašą/capability, filtrai kategorijai, žinomai kalbai, licencijos faktams ir patikros būsenai. Unknown ir archived matomi, search/filter išlieka grįžus; 0 mokamų LLM.
- [ ] L2 Tikri stars su source ir nuskaitymo data; „Daugiausia stars“ / „Neseniai įtraukta į mūsų indeksą“. Missing nėra 0, aprėptis nėra visas GitHub. Esamą popularity snapshot susieti canonical repo ID ir timestamp offset, nesėkmingas refresh neapsimeta nauju.
- [ ] L3 Repo detalės rodo panaudojimą/upstream/license source/metadata datą ir atskirus source/pin/tested/runtime-ready faktus. Source-only gali būti naršomas; populiarumas nėra patikros ženklas.
- [ ] L4 Vietinis Saved išlieka tarp sesijų; browse/save nieko neįdiegia ir nereikalauja cloud paskyros.
- [ ] L5 Start project perduoda konkretų repo ir faktus esamam project srautui kaip foundation/component/reference; source-only pirma tiriamas ir paruošiamas. Ne vien tuščias composer; priklauso nuo projekto kelio P2.14.

## Trys gebėjimai, UI kalbos ir naujas naudotojas

Browser/research, PDF lentelės ir coding su mažu naujo projekto reuse keliu. Išlieka G2: 24/30 ir ≥7/10 kiekvienoje srityje, visos nesėkmės bei privalomi permissions/budget/cancel/restart atvejai. Tai dev acceptance, ne nepriklausomas pranašumo benchmark. 8 locale foundation kode savaime neuždaro visų srautų vertimo.

- [ ] P2.1 Playwright: browser/research adapteris, URL allowlist, šaltinių registras, screenshot, deterministic assertions.
- [ ] P2.2 Docling: PDF ArtifactRef į struktūrinį JSON/CSV, puslapių provenance, numerinių duomenų validatorius.
- [ ] P2.3 Kodo modulis: ribotas Git/diff/testų ciklas, test report, aplikacijos smoke ir išsaugotas workspace artefaktas.
- [ ] P2.4 Kiekvienam moduliui izoliuotas lock ir pin, healthcheck, conformance, resursų apskaita, cancel ir uninstall.
- [ ] P2.5 MCP Python SDK conformance pagal tikrintą v2 API; nesiremti pasenusiu FastMCP pavyzdžiu be versijos.
- [ ] P2.6 Artefaktų peržiūros: PDF+CSV, kodo diff+preview, šaltinių ataskaita; redagavimas su nauja versija.
- [ ] P2.7 Įgyvendinti `unknown_after_timeout` read-only reconciliation ir sustojimą, kai efekto negalima patikimai nustatyti.
- [ ] P2.8 Modulio diegimo UI rodo faktinį papildomą dydį, leidimus, modelių/duomenų poreikį ir kainos nežinomus.
- [ ] P2.9 Tuos pačius30 G0 užduočių vykdyti su užfiksuotu modeliu ir cap, saugant visus rezultatus, įskaitant failures.
- [ ] P2.14 [Naujo projekto reuse vertikalus pjūvis](docs/PROJECT-CREATION.md): brief → faktinis pagrindo/komponento pasirinkimas → izoliuotas pin/lock build → veikiantis app preview → nepriklausomas testas → perdavimas. Source-only/nesuderinamas profilis, missing ir cap0 turi aiškią baigtį; nėra pilnos ERP reikalavimo techniniam MVP.
- [ ] P1L.1 Translation keys ir8locale pagrindiniam UI: en/ru/es/zh-Hans/lt/de/fr/pt-BR, language picker/persistence ir EN fallback; neparengtas locale aiškiai preview.
- [ ] P1L.2 Parengti MVP UI/form/login/status/errors ir pagrindinių svetainės puslapių vertimai, Unicode/Cyrillic/CJK/escaping/plural/tekstų ilgio ir time/number/currency testai.
- [ ] P1L.3 EN/RU technical quickstart, kitoms trumpas palaikomo MVP guide su source revision ir aprėptimi; input/schema/capability/grant faktai nekeičia reikšmės vertime.
- [ ] P1L.4 UI locale neapsimeta modelio/voice kalbų palaikymu; router/search testai pagal realiai deklaruojamas input kalbas, lokalizuoti sinonimai nekviečia paid model po kiekvieno search.
- [ ] MVP1 Naujas žmogus be autoriaus pagalbos paleidžia palaikomą techninio MVP profilį, gauna vieną sutartą patikrintą artefaktą ir supranta failed/unknown bei tikrintuvo aprėptį. P4.1 penkių nepriklausomų beta naudotojų vartai lieka atskiri ir nepanaikinti.

## Po techninio MVP

Vieša beta turi platesnius vartus: likusį taikomą G2, REA static G3B, Treg P2.11–P2.13, shared improvement G3A, siaurą auto acceptance G3C, signed managed-local update G3D ir G4. Kelių desktop OS platinimas P4D atskiras. Svetainė, portalas, Video Hub, cloud/Drive ir platesnės sritys išlieka [pilname roadmape](ROADMAP.md); šis mažas kelias jų neatšaukia.

Zero Lab atlikti pjūviai yra ROADMAP P1E ir [istorinėse ataskaitose](docs/experiments/README.md). Jie neuždaro šio MVP vartų. Nebelieka fiksuoto 50% ar bendro pranašumo pažado; nauda skelbiama tik pagal atitinkamo profilio faktinius palyginimus.
