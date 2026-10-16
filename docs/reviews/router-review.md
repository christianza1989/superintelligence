# Jev maršrutizavimo: oficialaus API, Pi, OpenCode ir MCP peržiūra

Data: 2026-10-16, Europe/Kiev. **Source-only / NOT_RUN.** Skaityti oficialių SDK ir bendruomenės wrapperių README, root licencijos, manifestai bei pasirinkti tikri API / adapterių entrypoints. Jokio login, API key naudojimo, modelio kvietimo, mokamos operacijos, install, kandidatų kodo paleidimo ar account konfigūravimo. Šaltinių snapshotai: `/workspace/research-superintelligence/router-agent.json`; tai nėra runtime rezultatų failas.

## 1. Galutinis vartotojo pasirinkimas ir išvada

**Sutartas MVP pasirinkimas:** Jev nuo pradžios naudojamas per vartotojo OpenRouter API key ir atskirai pasirinktą baigtinį task-routing biudžetą. Pagrindinis agentas po žemiau pateiktų šaltinių pasirinko dokumentuotą **System One** endpointą `https://openrouter.ai/api/v1/systemone` ir modelio ID **`typesafe/jev-1.13`** kaip pirmą integracijos kandidatą. Tai nėra bendras chat modelio pakeitimas ar `chat/completions` užklausa.

Deterministiniai hard filters, vietinis indeksas, leidimai, schema ir budget broker lieka privalomi. Be key / account prieigos / cap galimas tik aiškiai pažymėtas diagnostinis baseline arba blocked būsena; jos negalima vadinti veikiančia Jev integracija ar užbaigtu Jev MVP gate. Laya lieka vėlesnis pasirenkamas vietinis backend, ne tylus šio vartotojo pasirinkimo pakeitimas.

**Svarbi biudžeto riba:** viešų repo / video masinės mokamos atrankos pradinis cap lieka 0. MVP routing paskyra ir biudžetas automatiškai nesuteikiami public intake, marketingui ar kitų žmonių darbams. Donorystė ar vienas globalus „AI įjungta“ jungiklis šios ribos nepanaikina.

Rekomenduoju ploną `RoutingScorer` adapterį už jau suplanuoto Resolver ir brokerio: Jev siūlo sprendimą apie leistinus kandidatus; mūsų platforma sprendžia, ką galima vykdyti. Nereikia kartu priimti dar vieno scheduler, planner, modelių orchestrator ar compaction variklio.

## 2. Oficialus OpenRouter kontraktas: pavyko patvirtinti source

Vieši `openrouter.ai` / `docs.typesafe.ai` dokumentacijos puslapiai šiame host grąžino proxy 403. Tinklo politika neapeita. Tačiau npm SDK metaduomenys nukreipė į oficialius GitHub SDK šaltinius, ir ten patvirtintas tikras kontraktas.

**Patikrinta šaltinyje:** `OpenRouterTeam/typescript-sdk` SHA `4200d11265efd9e27916989f0ac013f64ef949d0`, package `@openrouter/sdk` **1.4.25**, root `LICENSE.md` Apache-2.0.

| Patikrintas failas | Tikras source faktas |
|---|---|
| `src/lib/config.ts` | Production server URL `https://openrouter.ai/api/v1`. |
| `src/funcs/systemOneCreate.ts` | `POST` path `/systemone`, JSON state / typed questions, OpenRouter API-key security. Sudėjus su default server gaunamas `https://openrouter.ai/api/v1/systemone`. |
| `docs/sdks/systemone/README.mdx` | Aiškiai dokumentuota: bare `jev-1.13` ir `jev-latest` mapinami į `typesafe/` namespace; tikrame SDK pavyzdyje `model: "typesafe/jev-1.13"`. |
| `src/models/decisionsrequest.ts` | `model`, struktūrinis `state`, vardiniai typed `questions`; tai decision request, ne bendras chat message formatas. |
| `src/models/decisionsresponse.ts` | Typed Choice / Noul / Score atsakymai, model, optional provider/id; usage input/output ir optional cost. SDK objektų camelCase ir JSON wire laukai normalizuojami adapteryje. |

Oficialus SDK taip pat turi **atskirą** `/api/alpha/decisions` API. Jo egzistavimas patikrintas source, tačiau jis nepasirinktas kaip MVP workaround. Bendruomenės tilde alias ar Vercel modelio ID nereikalingi, kai jau turime oficialiai dokumentuotą System One kelią.

### Du SDK, skirtinga base URL reikšmė

| Klientas | Base / server URL | Pridedamas path |
|---|---|---|
| `@openrouter/sdk` | `https://openrouter.ai/api/v1` | `/systemone` |
| `@typesafe-ai/sdk` su suderinamu OpenRouter endpoint | `https://openrouter.ai/api` | `/v1/systemone` |

Abu keliai gali adresuoti tą pačią dokumentuotą API formą; neteisingai sujungus galima gauti dvigubą `/v1`. `typesafe/jev-1.13` yra dokumentuotas modelio ID, o ne mūsų įrodytas nekintamas weights digest. `jev-latest` yra aiškiai kintamas alias; jį pasirinkus būtina registruoti actual returned model ir laiką.

**Neįrodyta šiandien:** vartotojo būsimos paskyros entitlement, balansas / tarifai / quota, konkretus modelio availability, API response ir sąskaita. Source kontraktas šiuos realius vartus sumažina, bet jų nepakeičia. API key dar nepateiktas ir nebuvo jo prašoma šios peržiūros metu.

## 3. Oficialus TypeSafe SDK: ką iš tiesų daro Jev

`typesafe-ai/typesafe-sdk-js` SHA **`b844cd1aca12855a5d24a2df52a1401c86e7d37a`**; npm `@typesafe-ai/sdk` **0.7.0**, MIT, Node **>=22**. `src/client.ts` realiai siunčia `POST /v1/systemone`, default TypeSafe base `https://api.typesafe.ai`, Bearer API key ir default model `jev-latest`. `src/resources/models.ts` turi `GET /v1/models`; šis metodas nebuvo kviestas.

Jev priima state ir typed klausimus: **Choice** grąžina pasirinktą label / kandidatą ir probabilities; **Noul** – yes/no tikimybės reikšmę; **Score** – pasirinktą / apskaičiuotą ordinal scale rezultatą pagal kontraktą. Tai ne įrankio vykdymas, savarankiškas kodo kūrimas ar savavališkų tool argumentų generavimo pakaitalas. Pagrindinis pasirinktas užduoties modelis ir domain validators vis tiek reikalingi.

Reported probability / confidence nėra patikimo grant, formalios teisingumo tikimybės ar saugumo įrodymas. Kalibraciją ir threshold tinkamumą reikia išmatuoti mūsų darbo profiliuose. Modelio tekstas negali būti vienintelis SAI acceptance testas.

**Svarbus SDK naujumo radinys:** README / source jau aprašo eksperimentinį PNG/JPEG image naudojimą su `TypeSafe-Danger-Zone-Images: true` ir `box` klausimu per `jev-preview`. Todėl senesnio wrapperio „Jev is text-only“ teiginys negali būti laikomas universalia dabartine tiesa. Tai ne mūsų patikrintas image palaikymas OpenRouter / pasirinktame `jev-1.13`, ne audio/video peržiūra ir ne pagrindas pasiskelbti „matėme visą YouTube video“. MVP router gali likti text-first.

**Patikrintas cost mechanikos faktas:** SDK 0.7.0 default `maxRetries: 2`, timeout **10 s vienam bandymui**, be bendro retry deadline. Taigi vienas `systemOne()` nebūtinai yra vienas HTTP dispatch. Brokeris turi arba išjungti vidinius retries, arba prieš kiekvieną bandymą skirti atskirą rezervą ir bendrą deadline. SDK typed usage gali būti null; jame nėra mūsų patvirtinto dabartinio kainoraščio ar nemokamos kvotos.

## 4. Bendruomenės kodas: kas tinka kuriam integracijos keliui

Toliau – pasirinkti perskaityti kodo faktai, ne teiginys apie viso repo saugumą ar bandymų sėkmę. Visų septynių wrapperių root LICENSE perskaitytas: **MIT**. Tai ne modelių weights, hosted API ar visų jų dependencies teisių pakaitalas.

| Projektas / pinned SHA | Tikras entrypoint ir mechanizmas | Ribos mūsų planui |
|---|---|---|
| `TheoOliveira/pi-jev` · `c5b5847aa189fe5ffec52893b7051fe8f9e7a548` | `extensions/index.ts`; `src/router.ts` lexical shortlist iki 10 inactive tools → Noul klausimai per SDK → additively `pi.setActiveTools`. `src/skills.ts` ir `src/auto.ts` turi skill / per-prompt kelius. | Pi **coding-agent ExtensionAPI**, ne bet kurio Pi runtime garantija. `@typesafe-ai/sdk ^0.6.0`, Pi dev 0.85 šeima; mūsų Rakazo PiAgentRuntime extension suderinamumas dar neįrodytas. Session success counter nepakeičia patvaraus pre-call biudžeto. |
| `jackbarunz/jev-tool-router` · `2e0361133b26d504881d60bc6d95e4bf6ea55af4` | `src/server.mjs` yra stdio MCP surface; `router-core.mjs` naudoja AI SDK `experimental_evaluate`, Choice + `none_of_the_above`, bounded tournament ir lexical fallback. | **Vercel AI Gateway** default `typesafe-ai/jev` ir `AI_GATEWAY_API_KEY`, ne mūsų pasirinktas OpenRouter key kelias. Token working budgets yra wrapper guardrails, ne mūsų patikrinti Jev serverio limitai. `call_readonly_tool` remiasi upstream `readOnlyHint`; mūsų semantinio leidimo tai nepakeičia. |
| `ini8labs/jev-mcp-router` · `168bbce8112c5543243edd3fbd2ada2b71cace16` | `jevmcp/gateway.py` du MCP tools `jev_route` / `jev_call`; `jev.py` tiesioginis Bearer System One HTTP; `router.py` Noul per server/tool/skill ir dviejų pakopų atranka. | Vienas darbas skaidomas po 40 klausimų, chunkai lygiagretūs, iki 5 HTTP bandymų kiekvienam. `jev_call` perduoda katalogo tool į Hub; jo pasirinkimas nėra mūsų grant. Hardcoded `$0.042/MTok` fallback nėra šiandien patikrintas tarifas. |
| `BillionsBobby/JevRouter` · `b1cdf80593ee530cedd99728a938f4e74ddd556b` | `src/api.ts` `route/plan/evaluate`, `provider.ts` direct TypeSafe ir OpenRouter alpha adapteriai; SDK/CLI, HTTP `/route`, MCP `jev_route`. Decision-only, raw probabilities ir provenance receipts. | Geras sprendimo / receipt pavyzdys, tačiau `actor_permissions` optional, `require_verified_candidates` default false, saugūs kandidatai filtruojami ir po modelio rezultato. Mūsų hard filters turi vykti ir prieš cloud duomenų siuntimą. Jo `~typesafe/jev-latest` default neperimame. |
| `FrancoisChastel/jev-code` · `74a4569bfe8bb4ad0cc1ba74fa5867f09e267300` | `src/core/client.ts` + `providers.ts` + `wires.ts`; penki typed tools: classify/check/score/rank/ask; `src/mcp/server.ts` stdio MCP. Yra `integrations/pi/jev.ts` ir `integrations/opencode/jev.ts`. | Tinkamas plono įrankių facade adaptavimo pretendentas. OpenCode native tool importuoja legacy `@opencode-ai/plugin`, Pi dev 0.99.2; tai neįrodo suderinamumo su mūsų OpenCode v2 ar Rakazo versija. `jev_rank` yra Noul per kandidatą, ne globalus testais pagrįstas tool kokybės reitingas. |
| `aaronshaf/opencode-jev-orchestrator` · `ffe76fed66b3d544f218cacff1947fc191688c3a` | `src/index.ts`, `src/jev.ts`: OpenCode plugin, sticky parent, Jev tier sprendimai ir laikini child agents; SDK `^0.6.0`. | **Modelių / subagentų orchestrator**, ne tool-katalogo selector. Jo įtraukimas kaip privalomo resolver dubliuotų jau pasirinktą valdymą; OpenCode Go / modelių pavadinimai nėra mūsų paskyrų prieigos įrodymas. |
| `overbit/fast-jev-compaction-opencode` · `bb1448cf518f282a2664efc936e259e0129456b2` | `src/server.ts` → `src/plugin.ts`, tikras OpenCode v2 `@opencode/plugin` `Plugin.define` ir `ctx.session.hook('compaction', ...)`; hosted / local decision backend. | **Context compaction**, ne tool routing. Įrodo kitokį v2 hook kelią, bet nėra reikalingas šiam MVP sprendimui. `NOTICE` saugo upstream kilmę; local backend ar jo logprobs nėra Jev cloud modelio savybių garantija. |

`pi-jev` žodžiu „activate“ įtraukia tool į Pi matomą rinkinį; tai nėra mūsų sistemos leidimų suteikimas. `jev-code` OpenCode setup pagal nutylėjimą įrašo MCP konfigūraciją; optional native custom tool yra kitas kelias. „OpenCode integration“ negalima sutapatinti su vienu universaliu plugin formatu ar esamu mūsų kode įdiegtu adapteriu.

Wrapperių setup gali keisti host konfigūraciją, įrašyti skill ar skaityti aplinkos/profile key. Tų komandų nevykdėme. Mūsų produktas naudoja atskirai vartotojo pasirinktą credential broker binding, ne automatiškai perima Pi / OpenCode profilius ar `.env`.

## 5. Siūlomas integracijos variantas

1. **Pirmiausia hard filters ir vietinis indeksas:** leistini canonical capability ID, schema, OS, trust/revoke, auth, data recipient ir spend profilis. Jev nemato viso katalogo, visų paslapčių ar visų privataus projekto dokumentų.
2. **Plonas optional-call sluoksnis, privalomas pasirinktam Jev MVP profiliui:** `RoutingScorer` gauna ribotą task state ir mažą priimtų kandidatų snapshot; kreipiasi į dokumentuotą OpenRouter System One API per brokerį. TypeSafe / OpenRouter SDK ar mažas tiesioginis HTTP klientas parenkamas pagal P0 bazę ir užrakinamas su dependencies.
3. **Typed sprendimas:** Choice / Noul / Score ir aiškus abstain / no-match. Grįžęs ID privalo būti iš šio konkretaus kandidato rinkinio. Trūkstamas, NaN, neleistinas ar pasenęs atsakymas atmetamas, o reported probability neišplečia leidimų.
4. **Lazy schema ir vykdymas:** modelis gauna tik pasirinktų tools schemas; brokeris dar kartą patikrina tikslų ref/schema/grant/budget/lease/revocation. Router atsakymas nėra bearer token ar savavališkų args validacija. Main task model ir validator lieka atskiri.
5. **Būsena ir kilmė:** registry/candidate/schema/policy/profile/model/config revisions, request/response IDs kai pateikti, actual model, decision basis, usage ir estimated/reported/uncertain cost. Cache siejamas su šiais pins ir galiojimu; typed cloud API negalime paversti nekintamu weights snapshot.

**SDK viduje** paprasčiausia įtraukti vieną mažą scorer už esamo brokerio. **MCP facade**, pavyzdžiui adaptuojant `jev-code`, tinka kaip bendra harness sąsaja, jei protocol ir host versijos patikrintos. **OpenCode inline tool/plugin** tinka tik konkretų v2/legacy API įrodžius; nereikia dėl to perrašyti RepositoryZero valdymo. **Localhost proxy** reikalingas tik aiškiam deployment / local backend poreikiui: proxy adresas pats nesuteikia nemokamo ar self-hosted Jev modelio.

Laya ar kitas suderinamas serveris gali priimti tokį pat JSON, bet tai neįrodo vienodos tikimybės kalibracijos, modelio kokybės, latency ar licencijos. Jo source / weights / hardware peržiūrą atskirai atlieka pagrindinis agentas; šis review neskelbia jų runtime palaikymo.

## 6. Kaina, privatumas ir claims

Jev yra papildomas modelio / inferencijos kvietimas, net jei atsakymas trumpas ir negeneruoja prose. „Be atskiro generatyvaus reasoning call“ nėra „be modelio / tokenų / API išlaidų“. MVP „vienas modelis“ turi reikšti vieną pasirinktą pagrindinį reasoning modelį **ir atskirą Jev decision scorer**, abiejų naudojimas apskaitomas.

Kiekvienas dispatch, chunk, coarse/final stage, SDK retry ir repair turi atskirą brokerio rezervą; ne vien vieną aukšto lygio router job skaitiklį. Jev outage / timeout gali reikšti jau apmokestintą užklausą, todėl uncertain spend lieka held. Trūkstamas cost / usage nėra nulis. Tiekėjo current rates / account quota ir input dydžio ribos patvirtinami prieš mokamą aktyvavimą; proxy, alias ar kitas wrapper neapeina user cap.

Tool/skill aprašai ir task state gali atskleisti privatų projektą net be API rakto. Viešam cloud routing reikia tikro leistino data-recipient profilio ir mažiausios būtinos medžiagos. Naujas base URL neturi gauti kito host key. Receipts / debug logging neperduoda nepatikrinto raw prompt į viešą svetainę; vietinė istorija turi limits/retention, o `.gitignore` nėra šifravimas.

**Autorių teiginiai, ne mūsų rezultatai:** wrapperių „32x cheaper“, „37% faster“, „95% needed tools“, sub-second / calibrated ir kiti benchmark skaičiai. Jų užduočių rinkinys, warm connection, kandidatų inventorius, promptai ir kainos neįrodo mūsų end-to-end naudos. Vien ordinal ranking ar tool selection teisingumas neįrodo užduoties sėkmės; SAI gate negali būti pakeistas vien Noul tikimybe.

## 7. MVP ir aktyvavimo vartai

- [ ] Užrakinta pasirinkta produkto bazė, vienas scheduler/UI ir `RoutingScorer` kontraktas; Jev neprideda antro orchestrator.
- [ ] OpenRouter System One source pin ir `typesafe/jev-1.13` dokumentuotas modelio ID užfiksuoti. Gavus atskirą vartotojo key + cap patikrinami account entitlement, tikri rates ir mažiausias leistinas typed call; šiandien **NOT_RUN**.
- [ ] Modelio atsakyme žinomi candidate IDs, no-match, response schema, reported model/usage; false-confidence / malicious descriptions / unknown-ID / NaN / truncation ir stale policy neigiami testai.
- [ ] Atomic global + user/task/lane count/token/$/concurrency rezervai; retries0 arba per-attempt brokeris, deadline, cancel, unknown-spend ir restart/race testai. Mass intake paid0 nepasiskolina MVP key/cap.
- [ ] LT/EN ir būsimų pasirinktų kalbų / workload routing corpus, relevant recall/precision/abstention, kalibracija, main-model task success, realus cost/latency; vienodas kandidato rinkinys ir įranga lyginant baseline.
- [ ] Jev iš tikro parenka tool mažam browser / PDF / code scenarijui, vykdymas patikrinamas domain validator; be key neveikia slapta mokama schema ir nedeklaruojamas Jev MVP užbaigimas.
- [ ] Source/package lock ir tarball / provenance atitiktis patikrinta prieš diegimą. Npm package versijos sutapimas su Git manifest savaime neįrodo published artifact mapping.

Privalomas REA, Treg ir platesnė provider conformance viešai beta lieka jų ankstesniuose vartų etapuose. Mažas vidinis MVP, vieša beta ir visa dokumentacijos V1 vizija nėra ta pati parengtis. Daugiakalbis UI atskirai nereiškia visų modelių, TTS/STT ar Jev darbo kokybės visomis kalbomis; tam reikia konkrečių testų, ne locale failo buvimo.

## 8. Tikslūs svarbiausi šaltiniai

- [OpenRouter System One docs / model alias](https://github.com/OpenRouterTeam/typescript-sdk/blob/4200d11265efd9e27916989f0ac013f64ef949d0/docs/sdks/systemone/README.mdx), [server URL](https://github.com/OpenRouterTeam/typescript-sdk/blob/4200d11265efd9e27916989f0ac013f64ef949d0/src/lib/config.ts), [tikras POST](https://github.com/OpenRouterTeam/typescript-sdk/blob/4200d11265efd9e27916989f0ac013f64ef949d0/src/funcs/systemOneCreate.ts), [Decisions response](https://github.com/OpenRouterTeam/typescript-sdk/blob/4200d11265efd9e27916989f0ac013f64ef949d0/src/models/decisionsresponse.ts), [LICENSE](https://github.com/OpenRouterTeam/typescript-sdk/blob/4200d11265efd9e27916989f0ac013f64ef949d0/LICENSE.md).
- [TypeSafe SDK klientas](https://github.com/typesafe-ai/typesafe-sdk-js/blob/b844cd1aca12855a5d24a2df52a1401c86e7d37a/src/client.ts), [retry defaults](https://github.com/typesafe-ai/typesafe-sdk-js/blob/b844cd1aca12855a5d24a2df52a1401c86e7d37a/src/retry.ts), [typed kontraktai](https://github.com/typesafe-ai/typesafe-sdk-js/blob/b844cd1aca12855a5d24a2df52a1401c86e7d37a/src/types.ts), [image eksperimento aprašas](https://github.com/typesafe-ai/typesafe-sdk-js/blob/b844cd1aca12855a5d24a2df52a1401c86e7d37a/README.md), [LICENSE](https://github.com/typesafe-ai/typesafe-sdk-js/blob/b844cd1aca12855a5d24a2df52a1401c86e7d37a/LICENSE).
- [pi-jev realus tool router](https://github.com/TheoOliveira/pi-jev/blob/c5b5847aa189fe5ffec52893b7051fe8f9e7a548/src/router.ts), [SDK klientas](https://github.com/TheoOliveira/pi-jev/blob/c5b5847aa189fe5ffec52893b7051fe8f9e7a548/src/jev.ts).
- [Codex MCP router core](https://github.com/jackbarunz/jev-tool-router/blob/2e0361133b26d504881d60bc6d95e4bf6ea55af4/src/router-core.mjs), [config](https://github.com/jackbarunz/jev-tool-router/blob/2e0361133b26d504881d60bc6d95e4bf6ea55af4/src/config.mjs), [Vercel reikalavimas README](https://github.com/jackbarunz/jev-tool-router/blob/2e0361133b26d504881d60bc6d95e4bf6ea55af4/README.md).
- [Python HTTP klientas / retry / price fallback](https://github.com/ini8labs/jev-mcp-router/blob/168bbce8112c5543243edd3fbd2ada2b71cace16/jevmcp/jev.py), [dviejų pakopų logika](https://github.com/ini8labs/jev-mcp-router/blob/168bbce8112c5543243edd3fbd2ada2b71cace16/jevmcp/router.py), [MCP vykdymo kelias](https://github.com/ini8labs/jev-mcp-router/blob/168bbce8112c5543243edd3fbd2ada2b71cace16/jevmcp/gateway.py).
- [JevRouter provider](https://github.com/BillionsBobby/JevRouter/blob/b1cdf80593ee530cedd99728a938f4e74ddd556b/src/provider.ts), [pasirinkimas ir optional permissions](https://github.com/BillionsBobby/JevRouter/blob/b1cdf80593ee530cedd99728a938f4e74ddd556b/src/router.ts), [default policy](https://github.com/BillionsBobby/JevRouter/blob/b1cdf80593ee530cedd99728a938f4e74ddd556b/src/manifest.ts).
- [jev-code tikras HTTP klientas](https://github.com/FrancoisChastel/jev-code/blob/74a4569bfe8bb4ad0cc1ba74fa5867f09e267300/src/core/client.ts), [providerių mapping](https://github.com/FrancoisChastel/jev-code/blob/74a4569bfe8bb4ad0cc1ba74fa5867f09e267300/src/core/providers.ts), [wire path](https://github.com/FrancoisChastel/jev-code/blob/74a4569bfe8bb4ad0cc1ba74fa5867f09e267300/src/core/wires.ts), [native OpenCode tool](https://github.com/FrancoisChastel/jev-code/blob/74a4569bfe8bb4ad0cc1ba74fa5867f09e267300/integrations/opencode/jev.ts), [MCP](https://github.com/FrancoisChastel/jev-code/blob/74a4569bfe8bb4ad0cc1ba74fa5867f09e267300/src/mcp/server.ts).
- [OpenCode orchestrator entry](https://github.com/aaronshaf/opencode-jev-orchestrator/blob/ffe76fed66b3d544f218cacff1947fc191688c3a/src/index.ts), [Jev tier klientas](https://github.com/aaronshaf/opencode-jev-orchestrator/blob/ffe76fed66b3d544f218cacff1947fc191688c3a/src/jev.ts).
- [OpenCode v2 compaction plugin](https://github.com/overbit/fast-jev-compaction-opencode/blob/bb1448cf518f282a2664efc936e259e0129456b2/src/plugin.ts), [NOTICE](https://github.com/overbit/fast-jev-compaction-opencode/blob/bb1448cf518f282a2664efc936e259e0129456b2/NOTICE).

Visi šaltinių faktai šiame review riboti nurodytu snapshot. Jie nėra nepriklausomas saugumo auditas, runtime PASS, dabartinis kainoraštis ar būsimo modelio prieinamumo pažadas.

## 9. Galutinė MVP dokumentų peržiūra

Perskaityti repo šaknies `MVP-ROADMAP.md`, `docs/PROJECT-V1.md`, `docs/LANGUAGES.md`, `docs/ROUTER-EVALUATION.md` ir susiję pakeisti PLAN / ROADMAP / agentų kontraktų sakiniai. Esminių architektūros blokų nerasta: mažas vidinis MVP turi vieną pagrindinį modelį ir atskirą privalomą Jev/OpenRouter scorer; vieša beta išlaiko REA, Treg, providerių ir release/recovery vartus. Rakazo arba minimalios bazės pasirinkimas laukia P0 įrodymų. MVP routing cap ir viešo masinio intake paid0 yra atskiri. Aštuoni UI locale ir EN/RU dokumentacija yra įgyvendinimo tikslai, ne dabartinis runtime ar visų modelių kalbų palaikymas.

Pagrindiniam agentui perduoti du teksto suderinimo punktai: `ROUTER-EVALUATION` §5 Laya checkpoint/strict darbus aiškiai atidėti kaip optional ir neleisti baseline laikyti užbaigtu Jev MVP; `AGENT-CAPABILITIES` sakinį apie įprastą nemokamą pasirinkimą apriboti vietiniam indeksui/hard filters, nes pasirinktas Jev scoring yra apskaitomas modelio kvietimas. Šie punktai nekeičia bendro pasirinkimo. Vykdymas, account entitlement ir mokamo request/billing patikra neatlikti. `router-agent.json` šaltinių snapshot užbaigtas; tai ne dabartinis kainoraštis ir ne įgyvendinta integracija.
