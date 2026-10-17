# MCP, papildiniai ir prijungimas iš įprasto coding kliento

**Priimta įgyvendinimo kryptis · 2026-10-17 · discovery runtime įgyvendintas, execution dar nepriimtas.** [Sprendimai A13–A16](DECISIONS.md), [ROADMAP P1X](../ROADMAP.md#p1x-mcp-ir-native-klientai--mvp-dalis), [faktinė būsena](IMPLEMENTATION.md). Priimtas ir kritiškai patikslintas Astra pasiūlymas; peržiūrėtas source pagrindas 01645b085ed6f592cd450ee06537dfb958cc9c94. Žemiau esantys kontraktai yra visos integracijos reikalavimai. Dabartinis serveris teikia tris discovery tools; [tikro Codex ryšio ataskaita](experiments/MCP-PREVIEW-2026-10-17.md) aprašo patikrintą ribotą profilį.

Tikslas — žmogui likti savo Codex ar Claude Code, o RepositoryZero naudoti komponentų paieškai, paruošimui ir patikrai. Pirmas klientas — Codex desktop su dabartine naudotojo paskyra. Claude Code kvalifikuojamas atskirai. [Native palyginimo protokolas](NATIVE-CODEX-BENCHMARK.md) atskirtas nuo [istorinio Claude CLI Lab](LOCAL-LAB.md).

## 1. Priimta kryptis ir autoriteto riba

Priimta MCP įtraukti į MVP nuo pradžių kaip trečią įėjimą greta savarankiškos Library ir Zero darbo aplinkos. Žmogus gali kurti originaliame Codex arba Claude Code, o Zero pateikia savo įrankius. MCP serveris nėra naujas pagrindinis agentas ir neperima host pokalbio.

| Sritis | Autoritetas | Kas dalijama |
|---|---|---|
| Pokalbis, pagrindinis modelis, jo kontekstas, native failų redagavimas ir shell | Host Codex / Claude Code, pagal jo naudotojo nustatymus | Zero gauna tik konkrečiam tool pateiktą užklausą ir suteiktą projekto apimtį; ne visą pokalbio istoriją |
| Repo discovery, evidence, receptų/profilių pasirinkimas | Tos pačios Zero core funkcijos, naudojamos Library ir own-app | Vienas katalogas, canonical IDs, source/pin/profiliai ir paieškos taisyklės |
| Zero preparation / verification job | Esamas Zero application/worker sluoksnis ir Graphile/PostgreSQL | Tie patys grant/budget/effect/lease/artifact/receipt principai, vienas patvarios būsenos autoritetas |
| Galutinis host projekto pakeitimų priėmimas | Host / žmogus | Zero pateikia paruoštą komponentą, integravimo faktus ar patch artefaktą; native host jį peržiūri ir pritaiko |
| Viešas leidimas, merge, platesnė autonomija | Esami atskiri produkto vartai ir operatoriaus politika | MCP prieiga jų automatiškai nesuteikia |

Taigi yra du aiškiai apriboti darbai: host kuria projektą, Zero vykdo konkrečias jo užsakytas pagalbines operacijas. Nėra dviejų scheduler, konkuruojančių dėl to paties coding darbo. Zero job ID yra ne host pokalbio ID; host pateiktas conversation ID gali būti tik neautoritetinga koreliacijos žyma.

Plonas STDIO procesas gali tiesiogiai kviesti read-only core funkcijas. Ilgos preparation/verification operacijos turi būti pateiktos esamam Zero job sluoksniui per mažą vietinį application API; MCP procesas neturi savo antros eilės, retry scheduler ar atskiros billing DB. Worker darbai turi turėti aiškų preparation/verification handler, nekuriant dirbtinio Pi coding run vien tam, kad pasiektume eilę. Zero UI ir MCP skaito tuos pačius job/artefaktų faktus.

Host coding autentifikacija lieka host. Šiame profilyje Zero nekviečia antro coding modelio ir neprašo eksportuoti Codex/Claude prenumeratos OAuth. Tai architektūros savybė, ne pažadas apie neribotą ar nemokamą host naudojimą. Jev ir kiti Zero inicijuoti mokami API yra atskiri pasirinkti profiliai su savo realia autentifikacija ir cap.

**MVP ribos lieka:** G0/G1, browser/research + PDF + coding, G2 30 užduočių, Library L1–L5 ir naudotojo pasirinktas Jev J1/J2. MCP coding scenarijus įrodo vieną įėjimą bei vieną gebėjimą. Jis neuždaro visų šių vartų ir nepakeičia own-app adapterio/modelio kvalifikacijos. Native host profilį reikia atskirai įrašyti supported matricoje; jo modelio kvietimų negalima įrašyti kaip praėjusių Zero ModelCallObserver. Tačiau own-app coding adapterio neužbaigimas neturi blokuoti native deterministic vertikalės, kuri tokio adapterio visai nekviečia.

### Norminių vartų taikymas pagal profilį

A15 priima šį vartų taikymą pagal profilį. `host-managed / netaikoma šiam kvietimų keliui` nėra `[x]` bendram standalone darbui. Mišrių vartų kriterijai vertinami pagal profilį, išlaikant originalų ID ir likusius darbus.

| Esamas vartas | Native Codex + deterministic Zero | Native + Zero-owned Jev | Standalone Zero app |
|---|---|---|---|
| P1.14 pagrindinio modelio adapteris ir credentials | Primary model/auth host-managed. Patikrinti native host prieinamumą ir ribas; Zero nekopijuoja OAuth ir neemuliuoja jo budget | Host primary kaip kairėje; Zero saugo tik savo atskirą Jev binding pagal konkretų autorizuotą profilį | Visas originalus Zero primary adapter/credential broker vartas lieka atviras, kol įrodytas |
| OBS1 / OBS2 / P1.8 | Zero job resursai/grants ir baigtiniai limitai privalomi. Modelio dispatch = 0, todėl joks fiktyvus modelio rezervas nereikalingas; host usage tik stebimas | Zero Jev actual account, dispatch/retries, routing lane + account cap ir usage receipt privalomi. Naudoti realaus transporto rezervavimo jungtį, ne tariamą Pi observer, jei tas transportas jo nekviečia | Originalus request-scoped primary observer ir account mapping lieka savo scope; native įrodymas jo neuždaro |
| OBS3 / P1.15 | Host fallback valdo host; fiksuoti faktinį modelį. Zero mokami helper/fallback išjungti | Zero helper/fallback išjungti arba atskirai kvalifikuoti su actual account | Originalūs įjungti Zero keliai kvalifikuojami visi |
| P1D.8 | Zero tools turi enforcement; host shell/kitų tools negalima skelbti valdomais Zero | Ta pati riba; Jev pasirinkimas nesuteikia host-wide enforcement | Taikomas originalus valdomo kliento/enforcement kriterijus |
| G0/G1 ir TP1/TP2 | Realūs Zero backend/worker/jobs/permissions/restart/resursų vartai taikomi. Native host yra deklaruota priklausomybė, ne kitas Zero scheduler | Tie patys + mokamo Zero profilio gedimai | Originalus visas deklaruotas produkto runtime |
| P1.16/P1.17 ir Library | Native progress/receipts patikra atskira nuo own-app UI. Library L1–L5 išlieka; native langas savaime neuždaro Zero UI checkboxų | Tas pats | Own-app srautai tikrinami savarankiškai |
| J1/J2 | `NOT_RUN / atskiras pasirinktas MVP darbas`, ne PASS. Neprivalo blokuoti šios vienos deterministic vertikalės tyrimo | Tikras pasirinktas Jev per bendrą worker → leistinas actual tool use ir receipts | Tikras palaikomas darbo profilis; negalima priskirti automatiškai pagal MCP connection |
| G2 / MVP1 | Vienas CSV bandymas nėra 30 užduočių ar pilnas trijų sričių MVP | Taip pat; J1/J2 nepakanka G2 | Tie patys išsaugoti priėmimo kriterijai |

Footprint turi rodyti ir Zero papildomą paketą/resursus, ir visos deklaruotos aplinkos priklausomybes. Negalima tyliai išmesti anksčiau į 2 GB metodą įtrauktų dalių; profilio matavimo pakeitimas reikalauja aiškaus ADR. Native-only priėmimas vadinamas konkretaus profilio priėmimu, o ne viso standalone produkto užbaigimu.

## 2. Ką dabar galima pernaudoti

Tiesiogiai perskaitytas kodas šioje peržiūroje:

- `platform/packages/adapters/src/zero-repository-tools.ts`: `repositorySearchTool` ir `repositorySearchFromTool`, ne daugiau kaip 5 source kandidatai, query ≤256, kategorių tikrinimas, aiškiai read-only. Tai tinkamas pirmojo export pagrindas.
- `platform/packages/core/src/zero-catalog.ts`: lexical AND paieška. Jos žinomos poreikio/fit spragos išlieka; transporto pakeitimas jų netaiso.
- `platform/packages/adapters/src/mcp-transport.ts`: importuoja SDK Client ir client transportus. Tai MCP klientas, ne Zero serverio įgyvendinimas.
- `platform/packages/adapters/package.json`: deklaruoti tikslūs `@modelcontextprotocol/sdk` 1.30.0 ir `zod` 4.6.2. Serverio suderinamumas dar nebandytas.

Pirmo serverio pakeitimo failų ratas: vienas serverio registravimo modulis adapters pakete, atskiras plonas STDIO entrypoint tame pačiame pakete, siauras package export/start script ir tikslinės serverio transporto patikros. Registravimo funkcija atskirta nuo `connect` side effect. Jei dabartinė build sistema reikalauja app entrypoint, tai tik composition shell, ne naujas produkto core. Neimportuoti viso executor į discovery-only serverio startup.

Paruošimo handler, job prieigos ir verifier jungtys ateina vėlesniais mažais PR. Nereikia dabar naujo universalaus kontraktų paketo, vector DB, plugin framework ar naujos schemos kiekvienam receipt. Viešus tipus iškelti tik atsiradus realiems bendriems vartotojams.

## 3. Minimalūs tools ir tikras end-to-end kelias

Toliau numatomi v1 vardai ir apimtys; jų runtime schemos dar neįgyvendintos. Pirmajame serverio pakeitime užrakinti vieną versijuotą kontraktą. Modeliui nereikia dešimčių vienas kitą dubliuojančių search įrankių.

| Įrankis | Discovery preview | Pilnas vietinis MCP kelias | Ribos |
|---|---|---|---|
| `zero_search` | Taip | Taip | Vietinis katalogas, ribotas query, kategorija/poreikio filtrai; daugiausia 5 kandidatai. Nevykdo install ar mokamo rerank |
| `zero_inspect` | Taip | Taip | Canonical candidate/profile/recipe ID → turimi pin, source, readiness, licencijos faktai, entrypoint ir ribos. Ne bendras URL fetch ar filesystem reader |
| `zero_status` | Taip | Taip | Serverio/schema/catalog versijos, aktyvus execution profilis, turimų operacijų ir backend būsena. Jokių keys, account PII ar visų vietinių projektų sąrašo |
| `zero_prepare` | Ne | Taip | Kandidatas/profilis + scope + idempotency key → job. Tik fiksuotas leistinas preparer, pin/lock, izoliuotas smoke, paruoštas artefaktas ir integration receipt |
| `zero_job` | Ne | Taip | To paties principal/scope job būsena, event cursor ir ribota ataskaita; galima surasti pagal idempotency key po prarasto submit atsakymo |
| `zero_artifact` | Ne | Taip | Tik leidžiamo job artefakto ID/revision; ribotas tekstas ar manifestas ir patikrinama lokali pristatymo vieta. Ne bet koks agento nurodytas kelias |
| `zero_verify` | Ne | Taip | Užfiksuotas projekto snapshot + operatoriaus leistinas verifier profile + tikrintina užduoties specifikacija → job; nepriklausomai atkuriamas rezultatas ir receipt |
| `zero_cancel` | Ne | Taip | Patvarus konkretaus job stop prašymas, idempotent, galutinė būsena atskirai; ne „stop visus worker“ |

Atskiras `zero_apply` ar bendras shell tool pirmajam keliui nereikalingas. Host savo native įrankiais pritaiko komponentą ir kodą. Tai sumažina concurrent-writer problemą: Zero dirba izoliuotoje staging vietoje, o host valdo originalų darbo medį.

Minimalus pilnas scenarijus:

1. Host iš vartotojo užduoties suformuoja trumpą poreikį, kviečia search/inspect.
2. Pasirenka tinkamą profilį arba sąžiningai nustato no-fit. Readiness ir leidimai tikrinami serveryje.
3. Prepare sukuria pinned komponento artefaktą ir integravimo manifestą; host mato job eigą.
4. Host peržiūri ir integruoja komponentą į savo projektą, parašo trūkstamą kodą.
5. Verify pats užfiksuoja konkretų projekto turinį, paleidžia apibrėžtus testus izoliuotoje aplinkoje ir pateikia bound receipt.
6. Žmogus gauna paleidžiamą rezultatą ir aiškų paaiškinimą, kas tikrinta, kas panaudota ir kas dar unknown.

Search/details/status įrodymas yra **discovery preview**. Serverio prisijungimas, tool call ar paruoštas paketas savaime neįrodo penkto ir šešto žingsnių.

## 4. Kontraktas ir prieigos ribos

### Versijos ir riboti atsakymai

Atskirti MCP negotiated protocol version, Zero server semver, tool schema version, catalog snapshot, recipe/profile revision ir artefakto digest. SDK versija nėra protocol version. Pirmajam release kvalifikuoti faktinę SDK/host porą; neįjungti nepalaikomų MCP Tasks, sampling ar elicitation vien dėl to, kad egzistuoja specifikacijoje.

Kiekvienas input tikrinamas serverio pusėje: required laukai, enum/ID, `additionalProperties: false`, ribos. Adapterio deklaracija savaime neįrodo, kad visos runtime validacijos jau įjungtos. Candidate ID nėra savavališkas repo URL, verifier ID nėra shell komanda, scope ID nėra laisvas filesystem kelias.

V1 atsakymų limitai, kuriuos įgyvendinant reikia patikrinti: query 256 simboliai; search ≤5 rezultatų; search/status JSON ≤16 KiB; inspect/job/artifact tekstinis puslapis ≤32 KiB; atskirai fiksuoti visos operacijos file/byte/time/concurrency limitai. Didesni dokumentai pateikiami per ribotą artefakto skaitymą su cursor, digest ir `truncated`, o ne tyliai nukerpami svarbūs faktai. Dideli source/binary failai nekeliauja kaip bazinis prompt tekstas.

MCP `structuredContent` ir `outputSchema` leidžia patikrinti serverio rezultatą; suderinamumo tekstinis atvaizdas turi būti to paties riboto turinio, ne antra pilna dokumentų kopija. `readOnlyHint` ir kitos annotations padeda host, tačiau nepakeičia serverio autorizacijos. [MCP Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

### Evidence nėra viena didėjanti patikimumo žyma

Pateikti atskirus faktus, o ne globalų „repo verified“:

| Faktas | Privaloma aprėptis |
|---|---|
| Source-only / inspectable | Repo, revision jei turima, šaltinio/metaduomenų nuskaitymo data, žinomi trūkumai; nėra execute grant |
| Prepared | Package/source/lock digests, preparer revision, runtime/OS, entrypoint, smoke ir licencijos/permitted-use faktai |
| Used | Konkretaus projekto snapshot ir invocation/build/runtime įrodymas; modelio „panaudojau“ ar import eilutė nepakanka |
| Verified result | Konkretaus input/artifact snapshot, verifier/suite revision, vykdytojo kilmė, pass/fail/unknown ir aprėptis |
| Beneficial | Atskiro palyginimo protokolas ir kohorta, kokybė/laikas/kaina/neapibrėžtumas; ne išvestinė vien iš PASS |

Pavyzdžiui, tas pats komponentas gali būti prepared vienam Linux profiliui, source-only kitam, used viename projekte ir neturėti jokio palyginimu įrodyto pranašumo. Host vėliau pakeitus failus, senas verifier receipt lieka apie seną revision.

### Project scope, grants ir privatumas

Vietinį projekto binding sukuria naudotojo patvirtintas launcher/setup, ne modelis, pateikęs `root=/`. Pirmajam profiliui pakanka vieno projekto ir vieno naudotojo. Scope siejamas su tikra OS/Zero tapatybe, kanoniniu root, leistinomis operacijomis, galiojimu ir policy revision. Įrankis gali prašyti scope ID, tačiau serveris visada tikrina, ar jis priklauso šiam klientui. Žinoti job/artifact ID nepakanka prieigai.

Jeigu host palaiko MCP roots, naudoti jų ir operatoriaus suteiktos apimties sankirtą. Jei nepalaiko, naudoti aiškiai sukonfigūruotą root; jokio fallback į visą home ar serverio cwd. Roots yra protokolo duomenys, ne OS sandbox. [MCP Roots](https://modelcontextprotocol.io/specification/2025-11-25/client/roots).

Visus kelius tikrinti po canonicalization, įskaitant `..`, encoded traversal, symlink/junction, Windows case/UNC/drive ribas ir pakeitimą tarp patikros bei kopijavimo. Vykdymui naudoti snapshot, ne gyvą vartotojo medį. Minimaliai kopijuoti tik leistinus projekto failus; `.env`, credential stores, `.git` istorija, už projekto ribų esantys symlink targets ir kiti privatūs katalogai pagal nutylėjimą neįtraukiami. Nereikia uploadinti viso repo vien dėl search.

Grąžintas tool rezultatas patenka į host modelio kontekstą. „Vietinis MCP“ nereiškia, kad kiekvienas jo grąžintas tekstas lieka tik diske. Inspect/artefaktų atsakymuose pateikti tik užduočiai reikalingą turinį; paaiškinti šią duomenų ribą setup ir supported-profile apraše. Jev ar kitas išorinis Zero API gauna tik atskirai leistą minimalų turinį; nėra numanomo visų projektų siuntimo.

Repo README, comments, source ir package metadata yra nepatikimi duomenys. Juose esantys „ignore rules“, tool instrukcijos ar config pakeitimai neperkelia grants, nekeičia serverio tools ir nepaleidžia komandų. Pirmam prepare leisti tik peržiūrėtus pinned receptus; naujas source-only kandidatas gali baigtis `needs_review`/`unsupported_profile`. „Universalus bet kurio repo install“ nėra šio MVP užduotis.

Host ir Zero teisių ribos atskiros. Serveris turi gintis net jei host tool approval išjungtas. Tačiau jei native host shell pats gali vykdyti veiksmus už Zero ribų, negalime skelbti viso host enforcement. ROADMAP P1D.8 turi aiškiai taikyti enforcement Zero valdomiems dispatch; native kelias žymimas kaip host-managed, o ne tariamai saugomas Zero brokerio.

## 5. Patvarūs jobs, receipts ir sąnaudos

Prepare/verify tool grąžina accepted job ID greitai, o ne laiko vieną kelių minučių MCP request. V1 naudoti paprastą `zero_job` polling su cursor ir ribotu laukimu; native MCP Tasks mapping pridėti tik patikrinus abiejų host palaikymą. Tai Zero application jobs, ne savadarbis MCP protokolo fork.

Job būsenos turi mapinti esamą patvarią būseną: queued/running/cancel_requested/succeeded/failed/cancelled/unknown. `job=succeeded` reiškia, kad operacija baigta; verification outcome gali būti `fail`. Atskirti schema/protocol klaidą, domain `blocked/unsupported`, verifier FAIL ir infrastructure UNKNOWN.

Mutation idempotency key siejamas su principal, project scope, operation, input snapshot, profile ir parametrų digest. Tas pats key ir tie patys parametrai grąžina tą patį job; skirtingi parametrai su tuo pačiu key atmetami. Jei atsakymas prarastas, host pakartoja tą patį key arba gauna status pagal key. JSON-RPC request ID nėra patvarus idempotency key. Key galiojimo/retention riba dokumentuojama; pasibaigęs key negali tyliai tapti nauju brangiu darbu.

Timeout ar STDIO disconnect savaime nereiškia nei failure, nei naujo leidimo retry. Worker lease/fence ir effect reconciliation nustato, kas įvyko. MCP procesui mirus patvirtintas job lieka esamame backend; jo runtime/deadline/resource limitai lieka baigtiniai. Cancel po commit neapsimeta rollback: grąžinama tikra būsena, likę efektai ir artefaktai. MCP request cancellation ir patvaraus job cancellation yra skirtingi lygiai. [MCP Cancellation](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation).

Minimalus receipt naudoja esamus ID ir bounded JSON: operation/job/attempt, request digest, input snapshot, component/package/lock/profile pins, artifact revision/digest, verifier/suite/image revision, outcome/coverage, start/end, resursai, žinomos ir nežinomos sąnaudos, producer identity ir ankstesnių receipt ryšiai. Serveris pats skaičiuoja ar patikrina snapshot; vien host pateikto hash nepriima kaip turinio įrodymo. Receipt rašo trusted runner; kandidato kodas negali pakeisti policy/suite ar pasirašyti savo PASS.

Nepriklausomumas turi būti realus: atskiras procesas tame pačiame neapribotame OS naudotojuje nepaslepia grader. Benchmark holdout ir verifier policy laikyti už host/kandidato failų bei vykdymo grant ribų, atskiroje kontroliuojamoje aplinkoje. Jei to neįmanoma užtikrinti pasirinktame native profilyje, rezultatus vadinti development checks, ne nepriklausomu holdout. Produkto `zero_verify` feedback ir galutinis A/B holdout yra atskiri dalykai.

Sąnaudas rodyti trimis atskiromis dalimis:

1. **Zero valdomos:** Jev/provider dispatch, CPU/RAM/diskas/network/worker, preparation ir verification. Visi mokami Zero keliai per esamą account/lane rezervą, SDK retries įskaičiuojami, unknown lieka hold.
2. **Host stebimos:** native model/effort/model receipt, wall time, usage/cache/limits tiek, kiek host oficialiai pateikia. Nepilni duomenys yra unknown; prenumeratos naudojimas nėra 0 USD ar tikra per-call API sąskaita.
3. **Žmogaus ir priežiūros:** setup, approvals, intervention, komponento/recepto paruošimas ir atnaujinimai. Nepriskirti jau anksčiau paruošto recepto kainos nuliui cold palyginime.

Zero negali patikimai sustabdyti visų native host model calls, jo shell ar kitų MCP tiekėjų. Todėl nereklamuoti viso projekto bendro spend cap, jei prižiūrima tik Zero dalis. Native allowance limitus ir overall stop taiko host/operatorius; ataskaita nurodo matomumo spragas. Pirmas deterministic MCP preview gali veikti be jokio Zero mokamo API; tai neuždaro Jev J1/J2.

## 6. STDIO, WSL/Windows ir platinimas

Oficialūs Codex dokumentai aprašo vietinį STDIO bei Streamable HTTP ir projekto konfigūraciją. Desktop setup nurodo restart; dabartinio aktyvaus pokalbio hot-load nežadėti. [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). Claude Code taip pat dokumentuoja STDIO ir HTTP bei projekto roots; vieno host veikimas nepatvirtina kito host conformance. [Claude MCP](https://code.claude.com/docs/en/mcp).

Pirmas execution profilis: **Linux x86_64/WSL, ir projektas, ir Zero worker tame pačiame Linux filesystem**. Windows desktop paleidžia pinned vietinį STDIO entrypoint per fiksuotą WSL distribution/user ir absoliučius vykdomojo failo argumentus, be interpoliuojamos shell eilutės. Tai priimtas pirmo bridge projekto profilis; Windows Codex → WSL discovery ryšys patikrintas realiais tools; execution roots mapping ir patvaraus darbo lifecycle dar turi atskirus vartus.

`C:\...`, `/mnt/c/...`, WSL `/home/...` ir UNC keliai nėra tarpusavyje keičiami vien string replace. V1 palaiko vieną aiškų mapping; kitus roots atmeta su aiškia priežastimi. Host prieiga prie paruošto artefakto turi būti patikrinta realiu file read/hash, o ne vien gražiu `file://` link. Jei host ir worker skirtinguose hosts, reikia atskiro content transfer profilio; nuotoliniam serveriui nepaduoti tariamai vietinio kelio.

STDIO stdout skirtas tik protokolo pranešimams; diagnostika eina į ribotą redaguotą stderr. Launcher neturi spausdinti npm bannero/progress į stdout. Naudoti jau paruoštą pinned build, ne runtime `npx latest`/install. EOF, signalai ir WSL process tree turi tvarkingai nutraukti MCP wrapper; patvaraus worker nelaunchinti atskirai kiekvienam host pokalbiui. [MCP Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

Pirmam prijungimui pakanka direct MCP; plugin nėra protokolo priklausomybė. Vėliau vienas provider-neutral skill aprašo inspect → prepare → host integrate → verify ir honest no-fit. Jame nėra private paths, raktų ar antro scheduler instrukcijų. Ploni host manifestai tik supakuoja tą patį serverį ir skill. Claude manifest formatas ir OpenAI portable/compatibility formatas turi atskiras packaging patikras; nelaikyti jų identiškais. [OpenAI packaging](https://developers.openai.com/plugins/build/plugins), [Claude plugins](https://code.claude.com/docs/en/plugins).

Vietinis/personal/repo marketplace bandymas yra atskiras nuo viešo OpenAI katalogo publikavimo: local MCP submissions šiuo metu reikalauja approved-partner/allowlist kelio. Tai neturi blokuoti direct local MCP bandymo. Public directory konversijoje hooks šalinami; MVP neturi priklausyti nuo hooks, tariamai suvaldančių visus host veiksmus. [Desktop-only submission](https://developers.openai.com/plugins/deploy/desktop-only), [Claude plugin conversion](https://developers.openai.com/plugins/guides/submit-claude-plugin).

HTTP ateina vėliau su savo conformance: Streamable HTTP, TLS, Origin/Host kontrolė, tenant/project ACL, input quotas, session≠identity ir serverio auditorijai skirti tokenai. Loopback nėra pakankama autentifikacija. OAuth suteikia teises į Zero, ne prieigą prie Codex/Claude modelio prenumeratos; jokio credential proxy/token passthrough. Hosted variantui reikalingas aiškus projektų upload/snapshot ir retention profilis. [MCP Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

### Svetainės „Prijungti prie Codex“ / „Prijungti prie Claude Code“ eiga

Svetainėje turi būti aiškus pasirinkimas pagal klientą, OS ir execution vietą, pateikiant vieną trumpiausią tam profiliui patikrintą kelią. „Vienu paspaudimu“ reiškia oficialaus app diegimo srauto pradėjimą. Trust, consent, workspace ir connector pasirinkimai lieka pačiame host. Svetainė tyliai nerašo local config, neskenuoja disko ir neprašo coding prenumeratos tokeno.

**Codex:** dokumentuotas `codex://plugins/install/<plugin-name>?marketplace=<marketplace-name>` veikia jau žinomam marketplace; nežinomas nukreipia į bendrą Plugins. Jis neužregistruoja naujo GitHub marketplace. `codex://new?prompt=<URI-encoded-text>` paruošia composer, automatiškai prompto nesiunčia; tikras available plugin mention gali tęsti host install/connect eigą. Naudoti tik tikrus release/marketplace/plugin ID. [Oficiali deep-link nuoroda](https://learn.chatgpt.com/docs/reference/commands).

Pirmam pilotui mygtukas atveria trumpą vedlį: (1) patikrintas vietinis paketas/prerequisites; (2) official marketplace registration arba direct MCP Copy command; (3) app install/restart kur reikia; (4) Verify in Codex. Jei marketplace jau žinomas, pirmi žingsniai gali būti praleisti ir rodomas oficialus install link. Vienas universalus link negali pakeisti dar neįvykusio pirmo vietinio setup. Public katalogo „Install“ badge nenaudoti iki tikro priėmimo.

**Claude Code:** šioje peržiūroje universalus browser install URI nepatvirtintas. Rodyti dokumentuoto native komandų kelio trumpą vedlį/Copy command. Development bandymui dokumentuoti `--plugin-dir` ir `--plugin-url` reiškia vienos sesijos plugin loading; tai ne įrodymas, kad jis įdiegtas visoms kitoms sesijoms. Konkrečias marketplace/install komandas ir palaikomas versijas užrakinti pagal oficialų host dokumentą prieš publikuojant vedlį. Neatspėti `claude://...` schemos. [Claude plugin development](https://code.claude.com/docs/en/plugins/create).

Copy command turi būti pateiktas atitinkamai PowerShell arba Linux shell, su fiksuotais argumentais ir patikrintu paketu; ne „curl | shell“, ne modelio sukonstruota komanda. Rodyti, ką ji pakeis ir kokį projekto scope naudos. Kopijavimas nėra vykdymas ar prisijungimas. Vedlys prisimena pasirinkimą naršyklėje tik kaip preference, ne kaip auth ar connection faktą.

Local install ir vėlesnis remote OAuth turi skirtingus ekranus. Local nurodo, kur vyksta darbai, prerequisites ir projekto binding. Remote nurodo Zero paskyrą, scopes ir kokie projekto duomenys perduodami serveriui; po OAuth dar tikrinami tools ir pasirinkto projekto access. OAuth redirect success pats savaime nėra prepared/verified ar native local failų prieiga.

**Tikra verification:** host sesijoje atliekamas initialize/tools discovery ir `zero_status` arba nekenksmingas bounded probe su šviežiu nonce. Rodomi faktiškai gauti server/schema/profile/capability ir laiko duomenys, bei to host tool įvykis. `clientInfo.name` nėra kriptografinis host identity įrodymas. Status UI skiria „host gali kviesti discovery“ ir „execution backend pasiekiamas“; paprastas healthcheck nepakeičia abiejų.

Pirmam local pilotui connection patvirtinimas gali likti host/Zero local UI. Vieša svetainė neturi automatinės teisės žinoti STDIO būseną. Jei nėra aiškaus autorizuoto proof-return mechanizmo, jos būsena lieka „Patikrinkite programoje“ arba „Nežinoma“, net jei naudotojas grįžo iš app. Vėlesnis opt-in vienkartinis challenge/receipt callback turi būti susietas su serverio tapatybe, klientu, versija, galiojimu ir nonce; neperduoti private paths/projekto turinio. Savavališkas `connected=true` URL ar localStorage reikšmė nėra patikra.

Reikalingos būsenos ir veiksmai: `not configured → setup started → trust/consent required → restart/reconnect required → checking → connected (profile, checkedAt)`; taip pat app-not-found, unknown marketplace, unsupported version/OS, backend unavailable, expired/revoked auth, schema mismatch ir stale verification. Vieno veiksmo fallback: atverti teisingą instrukciją, nukopijuoti komandą arba pakartoti patikrą. Nerodyti „Connected“ pagal click, timeout ar user-agent spėjimą.

Disconnect pašalina arba išjungia host binding ir atšaukia Zero project grant; jei job jau vyksta, žmogui aišku, ar jis atšaukiamas, ar baigsis pagal esamą deadline. Tai nėra duomenų ištrynimas. Remote disconnect turi ir token/session revocation. Update rodo installed/available/verified versijas, išsaugo aktyvių jobs pins, prašo naujo trust tik pakitus atitinkamoms teisėms ir reikalauja pakartotinės compatibility patikros. Revoked profilis blokuoja naujus jobs; automatinis rollback į revoked versiją neleistinas. Šiems vietinio piloto veiksmams nereikia kurti naujo visų OS auto-updater.

### Dabartinė support matrica — discovery ir execution vertinami atskirai

| Klientas / OS / execution | Transportas ir setup | Versijos faktas | Priėmimo riba |
|---|---|---|---|
| Codex desktop Windows → WSL Linux x86_64 projektas | Vietinis STDIO per fiksuotą WSL launcher; direct setup arba žinomo marketplace install flow | OpenAI.Codex 26.1007.9446.0; Node 24.19.0; server 0.1.1 / schema 1.1.0; protocol 2025-06-18 | Discovery PASS 2026-10-17; [įrodymai](experiments/MCP-PREVIEW-2026-10-17.md). Execution roots ir useful-result NOT_RUN |
| Codex desktop Linux, vietinis projektas | STDIO; native setup | Exact desktop build + server/SDK/protocol prieš kvalifikaciją | Atskira eilutė, nepaveldi Windows/WSL PASS |
| Codex desktop macOS, vietinis projektas | Potencialus STDIO setup, tik po realios patikros | Minimum version nenustatyta | Planuojama, ne skelbiamas support |
| Codex CLI Windows/WSL/Linux | STDIO, dokumentuotas `mcp add` | Windows CLI 0.159.3 ir MCP add help patikrinti; Zero connection/auth nebandytas | CLI nėra desktop A/B pakaitalas; OAuth bandymai tebėra atidėti |
| Claude Code Linux/WSL | STDIO, direct MCP arba plugin/session loading | Exact installed CLI + server/protocol patikrinti atskirai; senas Lab CLI receipt nėra šio serverio conformance | NOT_RUN, atskiras host connection/useful-result |
| Claude Code native Windows/macOS | Vietinis STDIO su konkretaus OS launcher | Minimum version nenustatyta | NOT_RUN; neperkelti WSL path/signal prielaidų |
| Codex / Claude Code su Zero remote | Streamable HTTP + Zero OAuth | Host/server/auth versijos būsimo P5.15 profilyje | Ne lokalūs filesystem roots; atskiras snapshot transfer |
| Web/cloud surface | Tik jai realiai palaikomas remote/plugin kelias | Surface ir policy turi būti kvalifikuoti | Vietinio STDIO pariteto nepažadėti |

Matricos leidimo įrašas turi turėti client/build, OS/arch, transport, execution location, server/plugin/schema/protocol versijas, supported operations, test date ir evidence refs. „Dokumentuota upstream“ ir „mūsų patikrinta“ turi likti atskiri stulpeliai. Vien minimalios versijos spėjimo nepakanka.

## 7. Profilių vartai ir įgyvendinimo seka

| Profilis / teiginys | Privalomas priėmimas | Ko šis profilis neuždaro |
|---|---|---|
| Discovery preview | P1X.2 ir tikras Codex P1X.3 | Prepare, verified outcome, Jev ir MVP |
| Deterministic MCP vertikalė | TP1/TP2 + NEED1/PREP1/TRACE1 ir P1X.4–P1X.8 taikoma apimtis + P1X.10 Codex eilutė | Visų trijų gebėjimų, standalone modelio adapterio ar Jev |
| Native modelis | Host model/auth/allowance ir matomumo ribos P1X.8 | P1.14, OBS1–OBS3 Zero primary adapterio kvalifikacijos; jie lieka atviri |
| Zero mokamas Jev profilis | J0/J1/J2, realaus Jev transporto OBS2 rezervavimo/usage jungtis, trusted account ir cap; OBS3 jei Zero child/fallback įjungti | Native host visų modelio/shell veiksmų spend ar permissions kontrolės |
| Platinamas vietinis MVP plugin | P1X.9–P1X.12 + G0/G1/G2, trys moduliai, L1–L5, pasirinktas Jev, UI/locale ir MVP1 | Viešos beta, visų OS ar viešo plugin directory priėmimo |
| Pirma native A/B pora | Pilna deterministic vertikalė, P1X.8 limitai, P1X.10 Codex ir P1E.10 preflight | Bendro pranašumo ar viso MVP priėmimo |
| Pakartojama nauda | P1E.12; papildoma Jev nauda atskirai J3 B/C | Platesnių užduočių ar klientų be matavimo |

G0/G1 resursų, grant, effect, backup ir fault reikalavimai nesumažinami. Native profilyje host-owned modelio eilutė žymima host-managed, ne klaidingu PASS Zero observer ar credential brokeriui. Zero-owned dispatch reikalavimai lieka vykdomi serveryje. Own-app ir native profilių priėmimo įrodymai kaupiami atskirai. P2.5 Python MCP adapterio conformance nepakeičiamas TypeScript export serverio patikra.

Mažų pakeitimų seka: P1X.1 dokumentai → P1X.2 offline discovery → P1X.3 tikras Codex ryšys → P1X.4 scope/snapshot ir P1X.8 limitai → P1X.5 esamo worker job → P1X.6 komponentas → P1X.7 patikrintas rezultatas → P1X.10 Codex profilis → P1E.10–P1E.11 native pilotas. Limito ir autorizacijos patikros turi būti prieš vykdomą prepare/verify, o ne pridedamos po bandymo. Library ir offline worker gali būti kuriami nepriklausomai.

Direct MCP discovery ir vienos vertikalės pilotas gali vykti prieš plugin pakavimą. Platinamam MVP papildiniui ir svetainės diegimo keliui reikia P1X.9/P1X.11/P1X.12. Claude connection ir useful-result turi savo P1X.10 eilutę; jų NOT_RUN nestabdo pirmo Codex piloto ir nesuteikia teisės reklamuoti Claude support. P5.15 remote HTTP ir P4D.7 viešo platinimo kanalai vėlesni.

Oficialios sąsajos tikrintos 2026-10-17. MCP 2025-11-25 nuorodos yra konkretus versijuotas šaltinis; SDK versija nėra protocol version ir neįrodo visų specifikacijos funkcijų palaikymo. Prieš kiekvieno kliento leidimą iš naujo patikrinti oficialias schemas ir tikrą suderinamumą. Datuotas [tyrimas](research/MCP-AND-PLUGINS-2026-10-17.md) nėra runtime autoritetas.
