# MCP discovery preview ir pirmas native Codex ryšys

2026-10-17. Įgyvendintas vietinis read-only serveris ir tikrais naujo Codex pokalbio MCP kvietimais patvirtintas discovery ryšys. Tai nėra viso MVP, komponento integracijos ar palyginamo greičio/kainos įrodymas.

## Faktiniai įrodymai

| Patikra | Rezultatas ir riba |
|---|---|
| Native kliento kvietimai | zero_status, zero_search ir zero_inspect įvykdyti kaip MCP tools; shell/SDK imitacija nenaudota |
| Status probe | Serveris repositoryzero 0.1.0, schema 1.0.0; nonce grąžintas identiškas, checkedAt 2026-10-17T13:48:07.233Z |
| Katalogas | 796 įrašai, 2026-10-16 snapshot; SHA256 2938ad320a4ea4af68d4177fc5cb09fe40f505431c666c854b1a8a1f51011f15 |
| Search ir inspect | playwright → microsoft/playwright; source pin e139b837c20440925dafe0ca91735a003517a3bc; source-only, licenseApproved=false, runtimeTested=false |
| Host profilis | Windows desktop → WSL Linux STDIO; lokaliai stebėtas OpenAI.Codex paketas 26.1007.9446.0 ir Node 24.19.0. Tai vienas development profilis, ne visų versijų/OS palaikymas |
| Modelio naudojimas | Naujam pokalbiui pasirinktas GPT-6.1-sol/high; provider model receipt, tokenai ir tikslus prenumeratos mokestis neišgauti, todėl unknown |
| Darbo riba | Serveris discovery-only, execution backend unavailable. Projekto failų, paruošimo ar verify įrankių šis serveris neteikia |

Native įvykių ataskaitoje trijų tool kvietimų trukmės buvo 27/11/8 ms. Tai konkrečių tool įvykių metrika, ne bendras setup/modelio/workflow laikas ir ne greičio palyginimas. Pirmame probe negotiated protocol neišgautas; serverio SDK pin 1.30.0 nėra protocol version.

Po WSL aplinkos persikrovimo ankstesnio pokalbio trys kvietimai grąžino Transport closed. Šis FAIL išsaugotas; ankstesnis PASS nėra dabartinio transporto veikimo garantija. Aplinkos persikrovimo priežastis nenustatyta.

Atskirame naujame Codex pokalbyje visi trys tikri MCP kvietimai vėl PASS: serveris **0.1.1**, schema **1.1.0**, tikras initialize metu sutartas **protocol 2025-06-18**, checkedAt **2026-10-17T14:07:09.676Z**, tas pats katalogo hash ir 796 įrašai. Naujo nonce sutapimas patvirtintas. Tool įvykių trukmės 263/224/26 ms; tai nėra palyginamas modelio ar projekto laikas. Seno pokalbio transportas automatiškai neatkurtas; išbandytas naujas procesas, ne patvaraus job restart recovery.

Prijungimas yra projekto vietinėje konfigūracijoje, ne globalus kitų projektų pakeitimas. Privatūs keliai, sesijos duomenys ir visas pokalbio trace į Git neperkelti. Viešam A/B vis tiek reikia patikrinti A startup inventorių ir iš tiesų išjungti Zero metadata.

## Regresijos ir rastos klaidos

SDK transporto bei tikro proceso testai tikrina initialize/list/call, griežtą įvestį, visus katalogo ID, UTF-8 atsakymų ribas, source/no-fit faktus, EOF ir klaidingus paleidimo argumentus. Papildoma peržiūra aptiko ir regresijomis uždengė:

- klaidingo JSON atveju likusį atvirą stdin;
- stdout EPIPE, kuris anksčiau galėjo išspausdinti vietinių kelių stack;
- SDK nežinomo ilgo tool vardo atspindėjimą už atsakymo ribos;
- operatoriaus snapshot root /mnt leidimą, apeinant deklaruotą Windows mount ribą.

Nesėkmingi kūrimo bandymai išsaugoti vietiniuose vykdymo įrašuose. Pataisos nekeičia užšaldytų ankstesnių CLI kohortų. Naujas request-scoped observer turi atskirą 125 testų conformance: vienas callId prieš dispatch ir usage, lygiagrečių runs atskyrimas, onUsage apskaitos autoritetas, denial=0 dispatch. Tai OBS1, ne OBS2 trusted-account/budget integracija.

## Vėlesnis autentifikuoto paruošimo proceso bandymas

Serverio 0.2.0 / schema 1.2.0 pasirenkamas operator-bound profilis prideda zero_prepare, zero_job, zero_artifact ir zero_cancel. Numatytasis serveris ir generuojamas savarankiškas plugin išlieka discovery-only. Application principal kyla iš tikros BetterAuth sesijos ir operatoriaus grant, o ne iš tool argumentų; privatus binding ir policy perskaitomi iš naujo. Tai Zero sesija, ne host prenumeratos auth eksportas.

2026-10-17 15:26 UTC atskirame PostgreSQL 18.6 fixture paleistas `test:csv:mcp`: tikras STDIO procesas → loopback HTTP API → esamas Graphile worker → Artifact. Pateikus job iki worker start, uždaryti ir iš naujo paleisti API bei MCP procesai; tas pats patvarus job sėkmingai užbaigtas. Dvi artefakto puslapio dalys sujungtos ir SHA-256 sutapo; pinned d3-dsv 3.0.1 rezultatas bei atskiras parserio palyginimas PASS. Pakartotas idempotency key grąžino tą patį job; atšaukus jau baigtą darbą išliko tikroji succeeded būsena ir vienas terminal receipt. Atšaukus grant, naujas status probe rodė blocked, o job skaitymas atmestas. Modelio dispatch ir UsageRecord: **0**. Tai proceso proof su sintetiniu account, ne native Codex tool įvykis ar host projekto verify.

Papildomai toje pačioje izoliuotoje DB praėjo **13 worker ir 7 autentifikuoto API patikros**. Offline: **12 MCP execution schema/bounds patikrų, 32 application client patikros ir 30 operator policy patikrų** PASS. Rasta ir pataisyta ISO offset su nebaigtine data priėmimo klaida; neigiama kontrolė atmeta įvestį iki artifact lookup / dispatch. Šie skaičiai nėra bendras nepriklausomų produkto užduočių skaičius.

CI [39045943940](https://github.com/christianza1989/superintelligence/actions/runs/39045943940) ant commit ef1b361 patvirtino abu offline ir real PostgreSQL jobs, įskaitant naują 0.2.0 API/MCP restart paruošimo proceso proof bei savarankiško discovery plugin proceso proof. Vėlesnių commit patikros atskiros.

Library pridėta savarankiškai naršyti, peržiūrėti detales ir saugoti canonical repo ID lokaliai. Papildžius kalbas ir indeksavimo datas: 43 focused unit patikros, pilnas web/core typecheck ir 8 desktop/mobile/keyboard browser scenarijai PASS; šaltinių žvaigždės rodo datą, nežinomos nėra 0. Atskira GitHub patikra rado 755 exact-identity katalogo pin objektus; jokio runtime PASS iš to nesuteikta. Svetainės client/OS STDIO vedlio Astro build/check ir vizualinė peržiūra PASS. Library projekto handoff atskiras; vedlio Copy command neįrodo ryšio.

## 0.3.0: patvarus host fixture tikrinimas

2026-10-17 16:01 UTC serveris 0.3.0 / schema 1.3.0 papildytas zero_verify ir atskirais datuotais source metadata. Numatytasis serveris išlaiko tik tris read-only discovery tools; operator-bound kompozicija turi aštuonis tools. Actual status profilis gaunamas iš autorizuoto API, ne iš naršyklės paspaudimo.

Tikras STDIO → HTTP API → Graphile → Docker bandymas PASS: API/MCP restart išlaikė prepare job, host fixture perskaitė dvi base64 dalis, patikrino SHA-256 ir pats integravo grąžintus vendor failus. zero_verify susietas su tuo pačiu preparation artifact SHA, patikslintu penkių failų snapshot ir exact vietiniu image ID. Trijose fiksuotose užduotyse užfiksuota po vieną realų parserio kvietimą ir teisingą rezultatą; freshness=unchanged, receipt be privačių kelių. Dubliuotas verify idempotency key nesukūrė antro job, revoke atmetė tolesnį skaitymą, paidModelCalls=0. Tai host fixture proceso proof, dar ne tikras native Codex coding pokalbis ar independent holdout.

37 discovery/proceso ir 46 execution/client patikros bei adapter-kit/adapters typecheck PASS. Atskiri worker PG/Docker scenarijai apima unused / tamper / stale / cancel / revoked-before-private-read / staging cap; API kvalifikacija ir Jev turi savo vardiklius. Vėlesnė shared CSV/Jev transporto integracija dar tikrinama naujame head CI.

Vietinis repositoryzero0.2.0 discovery plugin taip pat tikrai įdiegtas per Codex CLI, užkrautas naujame desktop pokalbyje su reuse skill ir atlikti trys native MCP kvietimai. Server/schema/protocol=0.2.0/1.2.0/2025-06-18, source-only,796records, nonce sutapo. Plugin install/new-session discovery yra atskiras PASS; jis nepakeičia 0.3.0 native execution ar plugin update/uninstall vartų.

## 0.3.0: tikras native host ir rasta freshness spraga

2026-10-17 16:54:53–16:57:47 UTC naujas Codex desktop pokalbis per tikrus atskiro operator-bound serverio status/prepare/job/artifact/verify MCP įvykius atliko komponento integraciją. Patvirtintas serveris 0.3.0 / schema 1.3.0, backend available, csv-preparation-and-verification profilis ir šviežias sutampantis nonce. Host per įprastus failų įrankius pats įrašė keturis iš artefakto gautus vendor failus ir mažą app.mjs į naują tuščią operatoriaus patvirtintą Linux projektą; produkto source nekeistas, kodas host aplinkoje nevykdytas.

| Faktas | Rezultatas |
|---|---|
| Preparation artefaktas | 8 241 B, 3 puslapiai, viso SHA-256 patikrintas; worker vykdymas 256 ms |
| Verification artefaktas | 4 440 B, 2 puslapiai, viso SHA-256 patikrintas; worker vykdymas 2 206 ms |
| Faktinis panaudojimas ir rezultatas | Trims fiksuotiems atvejams po vieną parserio kvietimą, išvesties hash sutapo, nested verification.outcome=pass |
| Snapshot / idempotency | Penki tikslūs failai; preparation ir verification replay grąžino tuos pačius job ID |
| Sąnaudos | Zero paid model dispatch 0; host modelio tokenai/cache/kaina unknown; visas matomas srautas apie 174 s, ne palyginamas greičio įrodymas |
| Po host pakeitimo | Vien app.mjs komentaras pakeitė dabartinį snapshot, bet zero_job nesiūlė naujos freshness patikros. Immutable receipt teisingai liko apie originalų snapshot |

**Bendras šios native kvalifikacijos rezultatas FAIL:** trūko atskiro dabartinių failų palyginimo po jau užbaigto PASS. Funkcinis originalaus snapshot PASS nėra dabartinės projekto versijos garantija. Originalūs gauti puslapiai, receipt/hash grandinė, programos versijos, nesėkmė ir sintetinės DB kopija išsaugoti privačiai. Baigus bandymą grant atšauktas, tik jam skirtas API/worker ir DB sustabdyti, laikinas execution entry pašalintas iš host konfigūracijos išlaikant discovery. Tolesnė pataisa ir pakartojimas bus nauja versija / epocha; šis FAIL neperrašomas.

CI [39051581047](https://github.com/christianza1989/superintelligence/actions/runs/39051581047) ant be35124 patvirtino visus tris jobs: offline, real CSV/Library/Jev PostgreSQL/API ir atskirą 50 scenarijų + 1 expiry-lock patvarumo kontrolę. Ankstesnis [39051247161](https://github.com/christianza1989/superintelligence/actions/runs/39051247161) sustojo G1 dar prieš testus dėl švariame vykdytojuje neparuošto PostgreSQL image; du kiti jobs praėjo. Pridėtas aiškus image pull ir qualification JSON išsaugojimas CI, testų assertions nekeistos.

## 0.4.0: tikras native host ir atskira dabartinės versijos patikra

2026-10-17 17:28:27–17:33:34 UTC naujas Codex desktop pokalbis per tikrą supakuoto STDIO serverio MCP atliko naują development epochą. Serveris 0.4.0 / schema 1.4.0, protocol 2025-06-18, backend available, csv-preparation-and-verification ir devynios operacijos patvirtinti status nonce. Ankstesnio 0.3 FAIL įrašas išlieka.

| Faktas | Faktinis rezultatas |
|---|---|
| Native įvykiai | 14 tikrų status/prepare/job/artifact/verify/freshness įvykių; ne shell ar SDK imitacija |
| Paruošimas | 8 241 B, du puslapiai; visas SHA ir keturių vendor failų baitai patikrinti; worker 203 ms |
| Host integracija | Host pats įrašė keturis vendor failus ir app.mjs; produkto source ir host projekto kodas host aplinkoje nevykdyti |
| Docker rezultatas | Receipt 4 440 B, vienas puslapis, worker 2 143 ms, nested verification.outcome=pass; trys actualUse.calls reikšmės [1,1,1] |
| Idempotency | Prepare ir verify replay grąžino tuos pačius job ID |
| Dabartinė versija | zero_freshness prieš pakeitimą unchanged, po vien komentaro changed; originalaus job metaduomenys ir receipt baitai išliko identiški |
| Sąnaudos | Abu worker receipts: paidModelCalls=0; host model receipt, tokenai, cache, kaina ir infrastruktūros kaina unknown |
| Laikas | Visa matoma eiga 307,155 s; tai setup/host/tool darbo suma vienoje epochoje, ne palyginamas speedup matavimas |

Patikrinama hash grandinė: preparation receipt `ffde469224e0427e2235c7e4b3bbb64a8495ff7fe89bee4110cc7754687f92b2`; verification receipt `84425dca2e510a46740af896e58e5c30f18859b7b023ca3a56a9d6fb599abeaa`; verified snapshot `1d751022f1036d2bbc2e6110fdc1c577c9938553dccf45e4486b6db72da22a28`; current snapshot po komentaro `7e1c4642a5fc7f048ed6f6aa5c027da5d31c9a16c42b402d82ccfb773d825540`.

**Ribotos native CSV 0.4 kvalifikacijos rezultatas PASS.** Trys host įrankių klaidos išsaugotos: per ilga Windows proceso komanda, pagalbinio JavaScript top-level await atmetimas ir PowerShell pridėtas CR po sėkmingo penkių failų įrašymo. MCP produkto klaidų negauta. Šių host kliūčių taisymas ar viso srauto pagreitėjimas šiuo bandymu neįrodytas. Originalūs MCP atsakymai, abi app versijos, visos klaidos, hash ataskaitos ir sintetinės DB dump išsaugoti privačiai. Baigus bandymą grant atšauktas, tik jam skirtas API/worker sustabdytas, DB konteineris ir laikinas execution entry pašalinti.

Tai trijų fiksuotų development atvejų, vieno Linux projekto ir Windows–WSL host bridge įrodymas. Jis nėra independent holdout, plugin update/uninstall, visų host/OS profilių, viso MVP, formalios A/B poros ar pakartojamos naudos PASS.

## Likę vartai

Linux snapshotter sujungtas su patvariu operator-bound projekto verifier; ribota native CSV 0.4 eiga praėjo kartu su post-edit freshness. Read-only failų teisės nėra hostile same-user izoliacija.

CSV paruošimas turi operator policy ir MCP client jungtį; nepateikus privataus binding/policy, vykdymas neprieinamas. Atskiras Docker verifier tikrina tikslius penkis host failus, pinned vendor baitus, faktinį parserio kvietimą ir rezultatą; teigiamos bei unused/tamper/stale/cancel kontrolės praėjo su vietiniu exact image ID. Pilni crash/resource, staging retention ir naujo žmogaus setup vartai atviri; API/MCP proceso restart nėra worker crash recovery įrodymas.

Savarankiškas plugin paketas, jo native Codex 0.2 discovery install/new-session patikra ir svetainės STDIO vedlys įgyvendinti; 0.4 plugin update/uninstall, platesnis execution lifecycle, Claude Code ryšys, formalios native A/B poros ir pakartojama nauda dar neatlikti. [Vietinis setup](../MCP-SETUP.md), [MCP planas](../MCP-INTEGRATION.md), [native A/B metodas](../NATIVE-CODEX-BENCHMARK.md), [checkboxų būsena](../../ROADMAP.md).
