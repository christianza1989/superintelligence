# OpenCode UI pagrindo nepriklausoma šaltinių peržiūra

2026-10-16 · Europe/Kiev. Repo `anomalyco/opencode`, SHA **`a448d5b987d01887e1597269b57ae2f259f5725b`**, manifestų versija **2.0.30**. Tik source skaitymas; nėra install, build, paleistos programos, screenshot, mokamos API ar mūsų integracijos. Šaltinių snapshot: `/workspace/research-superintelligence/ui-agent.json`.

**Išvada:** OpenCode yra realus pernaudojamos sąsajos pretendentas. Jo dabartinis GUI naudoja **SolidJS**, desktop – **Electron**. Pernaudoti visą klientą, išskirti komponentus ir perimti visą OpenCode backend yra trys skirtingi sprendimai. Vien `baseUrl` pakeitimas nepadaro viso kliento suderinamo su Rakazo ar mūsų minimaliu branduoliu. P0 reikia vieno UI pernaudojimo sprendimo kartu su backend pasirinkimu; Rakazo-first build-vs-adapt vertinimas dėl šio tyrimo nepanaikinamas.

## 1. Kas patikrinta kode

| Sritis | Patikrintas faktas | Praktinė reikšmė / riba |
|---|---|---|
| Licencija | Pilnas root `LICENSE` – MIT; app, UI, session-ui, client ir desktop manifestai taip pat deklaruoja MIT. | Galimas source adaptavimas išlaikant notice. Tai nėra visų dependencies, fontų, ikonų, prekių ženklų ar modelių sąlygų auditas. |
| Web app | `packages/app` – SolidJS, Solid Router, Vite, Tailwind ir TanStack Solid Query. `entry.tsx` kviečia Solid `render`. | Tai nėra React komponentų paketas. Solid komponentų perrašymo į React nereikia vadinti tiesioginiu pernaudojimu. |
| Vieši app entrypoints | `src/index.ts` eksportuoja `AppBaseProviders`, `AppInterface`, `PlatformProvider`, `ServerConnection`; `desktop.ts` prideda tabs, locale, commands ir kitus hooks. | Egzistuoja tikros adaptavimo siūlės, bet jų buvimas dar neįrodo backend nepriklausomumo. |
| App kompozicija | `AppInterface` priima `servers`, `canonicalLocalServer`, pasirinktinį router; viduje sukuria Servers/Settings/Global/Tabs kontekstus ir OpenCode routes. | Visas UI remiasi OpenCode duomenų modeliu; vienas bendras universalus `TaskStore` adapteris šiame tyrime nerastas ar įrodytas. |
| Komponentai | `@opencode/ui` eksportuoja button/dialog/tabs/theme ir kitus primitives; `@opencode/session-ui` – timeline, message, markdown, file, review ir tool vaizdus. | Galima vertinti ribotų dalių adaptavimą. `session-ui` yra `private: true` workspace paketas ir priklauso nuo client/UI/util; jo negalima laikyti savaime savarankišku stabiliu npm produktu. |
| SDK / transportas | App `runtime/server/api.ts` kuria `OpenCode.make`; `client.tsx` importuoja `createClientConnection`, `createPtyClient`, `OpenCodeEvent`. | Serveris turi atitikti OpenCode API, įvykių ir PTY semantiką arba šiuos priklausomus sluoksnius reikia pakeisti. Tai ne bendras OpenAI-compatible endpoint. |
| SDK dabartinis kelias | `packages/client` eksportuoja promise, solid ir effect klientus. Senas spėtas `packages/sdk/js/package.json` grąžino404. | Planas turi remtis šio snapshot entrypoints; senų OpenCode SDK tutorial kelių negalima laikyti dabartine tiesa. |
| Desktop | `packages/desktop` naudoja Electron44.4.5, electron-vite6.0.0-beta.1, electron-builder26.15.7 ir electron-updater6.8.9. Main – `./out/main/index.js`. | **Šis dabartinis desktop nėra Tauri.** mac/win/linux packaging scripts nėra mūsų išbandyta platformų matrica ar installer dydžio įrodymas. |
| Desktop procesai | `src/main/index.ts` konfigūruoja app lock/window ir vėliau importuoja desktop; preload naudoja `contextBridge`/IPC; renderer montuoja `DesktopApp`, kuris laukia sidecar initialization ir perduoda sidecar serverį app. | Pernaudojama daugiau nei lango dekoracija: yra bootstrap/IPC/server lifecycle. Jo atitiktis mūsų supervisor, signatures, rollback ir resursų riboms nebandyta. |
| I18n | `language.tsx` turi lazy app+UI dictionaries, persisted locale, fallback, plural ir RTL. Yra EN/RU/ES/DE/FR/LT, `zh` ir `br`. `desktop-native.ts` aiškiai mapina `zh`→`zh-Hans`, `br`→`pt-BR`, `lt`→`lt-LT`. | Naudotojo8locale reikalavimui yra tikras pagrindas. Mūsų naujų ekranų/key coverage, prasmė ir layout dar netikrinti; locale failas nėra visų funkcijų ar modelių kalbų PASS. |
| Sesijų istorija | `session/revert.ts` tikrai kviečia inbox cancel, interrupt, wait, revert.stage ir revert.clear. `fork-dialog.tsx` kviečia `session.fork({ sessionID, before })` ir atkuria prompt kontekstą. | Yra session undo/redo/fork UI, bet tai backend operacijos. Sesijos šaka nėra Git branch ar išorinio veiksmo/data rollback garantija. Git šakų visos sistemos šioje ribotoje peržiūroje neauditavome. |
| Failų vaizdas | App routes lazy-loadina `@opencode/session-ui/file`. `FileMedia` rodo image/audio/SVG ir binary fallback; priima `readFile` callback. | Tai naudingas viewer pagrindas, bet ne įrodytas universalus PDF/video/CAD ar mūsų `ArtifactRef` renderer. Pastarajam reikia saugaus konkretaus adapterio. |

## 2. Tools, MCP ir progresas

`session-ui/src/tools/tool-renderer.tsx` turi `ToolRegistry`, specializuotus read/shell/execute/edit/patch/subagent ir kitus vaizdus bei `ToolDisplay`. Jis gauna įvestį, metadata, išvestį, klaidą ir būseną; priklauso nuo OpenCode `SessionMessageAssistantTool` bei `FileDiffInfo`. Metadata dekoduojami atskiri laukai, pvz. `files`, `diagnostics`, `sessionID`, `shellID`, `status`. Tai yra konkreti vaizdavimo schema, ne mūsų permission ar rezultato patikra.

Nepažįstamas įrankis patenka į `GenericTool`: MCP ikona, tool vardas, keli primitive input argumentai ir `streaming`/`running` būseną rodantis `BasicTool`. Šis generic komponentas pats nerodo visos savavališkos tool išvesties. Iš jo negalima žadėti pilno MCP Apps embedded UI, `_meta.ui.resourceUri`, visų `structuredContent` tipų ar procentinio progreso. Perskaitytas core MCP service turi tikrą tools/resources/prompts/elicitation ir `callTool` kelią, tačiau nepatvirtina visos kelio nuo MCP progress notification iki GUI semantikos. To nebuvimo visame repo neteigiu.

**Siūlomas sprendimas:** mūsų autoritetingus ToolCall/task/effect įvykius projektuoti į pasirinktą UI modelį per vieną versijuotą adapterį. Tool tekstas, metadata ir rodomas „completed“ nėra validator PASS, grant ar leidimas automatiškai pakartoti išorinį veiksmą. `unknown_after_timeout`, dalinis rezultatas, patikros laukimas, budget blocked ir revoked profilis turi likti aiškiai atskiri, net jei upstream coding UI tokios būsenos neturėjo.

Tool/grant/schema atitiktį tikrina brokeris. UI pernaudojimas nesuteikia tiesioginės apėjimo jungties į visus OpenCode/MCP tools, localhost shell ar provider credentials. Uždarytas UI langas netampa užduoties baigties faktu; reconnect remiasi patvaria būsena.

## 3. Trys konkretūs pernaudojimo variantai

| Variantas | Ką tikrai pernaudojame | Pagrindinė kaina / priėmimo sąlyga |
|---|---|---|
| **A. Komponentų ir vaizdų adaptavimas** | Atrinkti Solid primitives, theme, session/timeline/tool/file vaizdai ir i18n mechanika; mūsų kontraktus atitinkantys presenters. | Išlaikyti vieną pasirinktą renderer framework; tiksliai atskirti client tipų/contexts priklausomybes. Solid+React mišinys nėra nemokamas sprendimas. Vien primitives biblioteka savaime dar nėra parengtos produkto sąsajos pernaudojimo įrodymas. |
| **B. Viso OpenCode web/desktop kliento UI fork** | App shell, navigacija, composer, sessions, viewers, localization, platform/bootstrap dalys. | Sąmoningai pakeisti backend-bound contexts arba įgyvendinti ribotą patikrintą protocol projection; nekeisti viso mūsų engine į OpenCode vien dėl UI išvaizdos. Įvertinti fork priežiūrą, rebase, build ir desktop resursus. |
| **C. OpenCode klientas su OpenCode serveriu** | Natūrali upstream klientas–serveris pora ir didžiausia jos jau sujungtų funkcijų dalis. | Tai ir task/agent/backend sprendimas. Jis turi pereiti visus tuos pačius durability, grant, budget, effect, isolation ir SAI vartus. Antras autoritetingas scheduler šalia Rakazo/minimal core neleidžiamas; vien UI noras C varianto automatiškai nepasirenka. |

**Mano rekomendacija:** OpenCode viso UI adaptavimą vertinti kaip tikrą P0 pretendentą, o ne iš anksto atmesti dėl SolidJS. Palyginti su Rakazo esamo React UI pernaudojimu tais pačiais vartais. Jei pasirinkta Rakazo bazė ir jos UI atitinka reikalavimus, papildomas OpenCode UI stack turi pateisinti migracijos/adapterio kainą. Jei geriau tinka OpenCode UI fork, pasirinkti jį vieną ir parodyti, kaip autoritetingi mūsų kontraktai išlieka backend riboje. Komponentų biblioteka galima pagalbinė priemonė, bet „naudojame keletą buttons“ dar nepatenkina reikalavimo pernaudoti esamą produkto sąsajos pagrindą.

Tai tarpusavio kritikos rekomendacija; galutinis bendras UI pasirinkimas dar nepriimtas ir runtime spike neatliktas.

## 4. Riboti P0 įrodymai prieš pasirinkimą

- [ ] Iš exact source pin pernaudotas realus app/shell ekranas su išsaugota attribution; nėra nuo nulio kuriamo lygiagretaus bendro UI.
- [ ] Užduotis → įvykiai → tool kortelė → tikras artefaktas → atskira validator baigtis; restart/reconnect, cancel ir unknown būsena.
- [ ] Tik vienas task scheduler ir credentials/budget brokeris. UI originalaus backend slaptai nepaleidžia ir neapeina mūsų grant/cap.
- [ ] Konkretūs browser/PDF/code rezultatai ir ArtifactRef, failo parsisiuntimas/preview bei sesijos istorija susieti su mūsų tikromis semantikomis. Session undo nevadinamas išorinio pasaulio rollback.
- [ ]8locale mapping ir mūsų srautų keys/meaning/layout patikra. Naujos kalbos nekuria naujų API/policy IDs.
- [ ] Measured cold install/steady/peak ir packaging/runtime prerequisites. Source manifestas neįrodo2GB bazės vartų, OS support ar signed recovery.
- [ ] Telemetrijos, originalių update/release URL, credentials/login ir brandingo adaptacija peržiūrėta. Source turi Sentry init kelius (web init gated DSN); mūsų no-telemetry-default politika nepasikeičia vien dėl fork.
- [ ] Užrakinta fork/adapter upkeep apimtis ir riboti conformance fixtures; source/npm versijų sutapimas neprilyginamas published artifact provenance.

Visi šie produkto vykdymo vartai šiandien **NOT_RUN**. Šaltinių peržiūra nėra nepriklausomas saugumo ar performance auditas.

## 5. Tikslūs pagrindiniai šaltiniai

Visos nuorodos užrakintos tuo pačiu SHA.

- [Root MIT](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/LICENSE), [root manifestas](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/package.json).
- [App manifestas](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/app/package.json), [entry](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/app/src/entry.tsx), [AppInterface/providers](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/app/src/app.tsx), [app exports](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/app/src/index.ts).
- [UI exports](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/ui/package.json), [session-ui exports](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/session-ui/package.json), [client SDK](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/client/package.json).
- [Backend API binding](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/app/src/runtime/server/api.ts), [events/PTY binding](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/app/src/runtime/server/client.tsx), [routes](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/app/src/shell/routes/routes.tsx).
- [Tool renderer](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/session-ui/src/tools/tool-renderer.tsx), [Basic/GenericTool](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/session-ui/src/components/basic-tool.tsx), [core MCP service](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/core/src/mcp/index.ts), [FileMedia](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/session-ui/src/components/file-media.tsx).
- [Locale loader](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/app/src/runtime/i18n/language.tsx), [canonical locale tags](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/app/src/runtime/i18n/desktop-native.ts).
- [Sesijos revert](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/app/src/session/revert.ts), [sesijos fork](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/app/src/session/commands/fork-dialog.tsx).
- [Electron manifestas](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/desktop/package.json), [main](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/desktop/src/main/index.ts), [preload](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/desktop/src/preload/index.ts), [desktop renderer](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/desktop/src/renderer/desktop-app.tsx).

## 6. Papildomas kritikos raundas: Rakazo ir OpenCode hibridas

Naudotojas pasiūlė hibridą; pagrindinis agentas pasiūlė Rakazo-first React workspace su OpenCode UX principais. **Šiai krypčiai pritariu sąlygiškai:** realiai adaptuojame pasirinktą jau egzistuojančią Rakazo app/workspace/composer bazę, o OpenCode yra konkretus sessions, tool kortelių, failų/diff ir navigacijos elgsenos palyginimo šaltinis. Rakazo šaltinių atitiktį atskirai tikrina pagrindinis agentas. Ši mano peržiūra nepateikia naujo Rakazo runtime įrodymo ir nepasirenka galutinės backend bazės prieš P0.

Trys kritinės išlygos:

1. **UX idėjos nėra kodo pernaudojimas.** Vien OpenCode ekrano atkūrimas naujame React app nepatenkina no-from-scratch intencijos. ADR turi parodyti, kurie esamo produkto komponentai/source iš tiesų adaptuojami ir kaip išlaikoma jų kilmė. Solid komponentų perrašymo į React nelaikome tiesioginiu importu. Jei Rakazo pagrindo pritaikymas brangesnis už OpenCode UI fork, šis kitas variantas dar gali laimėti tą patį ribotą spike.
2. **Hibridas negali reikšti dviejų valdymų.** Vienas autoritetingas runtime, užduoties/grant/budget/artifact state ir UI. Du lygiagretūs React/Solid kontekstų bei auth/session modeliai sukurtų daugiau glue nei sutaupytų. Izoliuotas OpenCode provider adapteris galimas tik kaip brokerio valdoma transporto biblioteka, be antro agent/session scheduler, savavališkų retries ar esamų vartotojo profilio secrets importo.
3. **Coding UX nėra visa mūsų užduoties semantika.** Iš OpenCode perimtas „completed“, session fork ar undo netampa domain validator PASS, Git branch, migracijos atkūrimu ar išorinio veiksmo rollback. Papildomos būsenos turi būti aiškios UI, neišnykti už žalio check ar rendererio spinner.

### Trys vienodi palyginimo srautai

| Srautas | Vienodas fixture ir matoma baigtis | Ką turi išspręsti pasirinkta bazė |
|---|---|---|
| Užduotis → rezultatas | Browser/PDF/code užduotis → tinkami kandidatai → atskiras Jev sprendimas → tikri tool įvykiai → artefaktas → validator baigtis. | Realiai pernaudojamas composer/workspace, aiškus primary-model/Jev skirtumas, veiksmų kilmė ir artefaktų pasiekiamumas. |
| Ribos ir atkūrimas | Trūkstamas grant arba cap, timeout su `unknown_after_timeout`, cancel, UI reconnect ir runtime restart. | Patvari autoritetinga būsena, nėra automatinio write pakartojimo, UI neapsimeta kad uždarytas langas sustabdė ar užbaigė užduotį. |
| Katalogas → leistinas profilis | Darbo paieška → source-only / verified konkrečiam profiliui / local-ready skirtumas → parinkimas; trūkstamas modulis baigiasi blocked/proposed. | Vienas capability registras, faktiniai auth/OS/cost/permission filtrai, jokio tylaus download ar paid activation iš paprasto browse. |

Palyginame tais pačiais įvykiais ir duomenimis, EN/RU bei reprezentatyviu ilgesniu LT tekstu, klaviatūros/focus ir mažesnio viewport atvejais. Fiksuojame pakeistų priklausomų sluoksnių kiekį, realų adaptavimo darbą, build/peak resursus ir fork atnaujinimo kainą; nepasirenkame pagal vieno gražaus screenshot įspūdį. Kiti8locale vartai lieka bendrame kalbų plane.

### Ką turėtų parodyti du imagegen maketai

**1. Darbo aplinka.** Vienas aiškus desktop workspace: kairėje užduotys ir navigacija, centre žmogaus tikslas, trumpas planas ir išskleidžiamos tool kortelės, dešinėje artefaktas ir atskira validation baigtis. Matomi cancel/pause, išsaugota istorija, lokalus runtime ir atskiri pagrindinio modelio bei Jev binding/cap indikatoriai. Klaida ir unknown turi aiškų tekstą. Nereikia neįgyvendintų papildomų agentų konsolių ar visų katalogo tools viename lange.

**2. Įrankių katalogas.** Paieška pagal darbą, domain/capability filtrai ir keli palyginami profiliai. Kiekvienoje kortelėje source vs verified/readiness, OS/local/hosted, license ir cost/permission žinomumas; šone pasirinkto profilio detalė, kur nurodyta versija ir trūkstamos prielaidos. Pavyzdinis „reikia crypto boto“ ar „PDF į CSV“ rodo gebėjimų grandinę, o ne vieną tariamai viskam geriausią repo. Kandidato įtraukimas aiškiai atskirtas nuo leidimo įdiegti/vykdyti.

Abu vaizdai yra **būsimos sąsajos konceptai**, ne dabartinės programos screenshotai, source ar runtime įrodymai. Jei vaizde yra sėkmingas rezultatas, statusai ar skaičiai, jie žymimi pavyzdiniais. Maketai nesuteikia leidimų, nepatvirtina integracijos ir nepasirenka dar nebandytos UI/backend bazės. Imagegen vykdymą ir galutinį vizualinį sprendimą atlieka pagrindinis agentas.

## 7. React–OpenCode adapteris ir sugeneruotų maketų kritika

Po pagrindinio agento radinio pats perskaičiau `assistant-ui/assistant-ui` SHA **`a46d6634e7a75eddd85d51415b1a615886d4ad0e`** failus [react-opencode/package.json](https://github.com/assistant-ui/assistant-ui/blob/a46d6634e7a75eddd85d51415b1a615886d4ad0e/packages/react-opencode/package.json) ir [src/index.ts](https://github.com/assistant-ui/assistant-ui/blob/a46d6634e7a75eddd85d51415b1a615886d4ad0e/packages/react-opencode/src/index.ts). Paketas **`@assistant-ui/react-opencode`0.2.31**, manifestas deklaruoja MIT, React18/19 peer, `@opencode-ai/sdk ^1.18.35`; realūs exports apima `useOpenCodeRuntime`, `OpenCodeThreadController`, `OpenCodeEventSource`, message projection ir permission/question hooks bei `createOpencodeClient` iš `@opencode-ai/sdk/v2/client`. Pilną controller/types peržiūrą šiame papildyme atlieka pagrindinis agentas; aš jos nepriskiriu savo patikrai.

Šis radinys **sustiprina React adaptavimo galimybę**, bet nėra Solid OpenCode app konverteris į React ar parengtas Rakazo adapteris. Frontend thread controller savaime nėra antras autonominis backend scheduler; problema atsirastų nepagrįstai prijungus papildomą OpenCode serverį ir antrą autoritetingą sesijų/credentials/task modelį vien UI labui. Leidimų UI hook nepakeičia patikimo brokerio grant, o attachment ar message projection savaime neįgyvendina mūsų ArtifactRef/validator/effect semantikos.

SDK paketo `^1.18.35`, jo `v2/client` kelias ir OpenCode produkto/client2.0.30 yra **skirtingos versijavimo ašys**: vien skaičiai nei įrodo suderinamumo, nei jo paneigia. Prieš pasirenkant reikia užrakinto package lock ir tų pačių message/tool/events/auth/reconnect/conformance fixtures. Manifesto `assistant-cloud: "*"` yra papildomas užrakinimo ir duomenų kelio peržiūros punktas; vien dependency pavadinimas neįrodo privalomo mokamo cloud, telemetry ar automatinio duomenų siuntimo. Šio adapterio nereikia paversti papildomu privalomu MVP runtime.

Vizualiai peržiūrėjau abu pagrindinio agento sugeneruotus failus: darbo aplinką `exec-7ffa75fb-c3e7-4646-9024-2336351c87c8.png` ir katalogą `exec-a653c0d7-94c7-429f-bfec-d81cd084bac2.png`, kataloge `/workspace/generated_images/`. Abu turi teisingą **„Design concept · example data“** žymą. Bendras vienos aplinkos navigacijos modelis nuoseklus; katalogas aiškiai rodo `Evaluation: Not run` ir `Not installed`, o workspace atskiria tool veiksmus ir Checks skiltį. Tai vizualus vertinimas, ne paspaudimų, accessibility ar responsive testas.

Trys svarbiausi taisymai prieš šiuos konceptus laikant įgyvendinimo specifikacija:

1. **Valdymas ir kaštai.** Workspace vaizde vyksta „Run checks“, bet nesimato aiškaus Cancel. Vien OpenRouter pasirinkimas ir bendra pavyzdinė `$0.12/$1.00` juosta neatskiria pagrindinio modelio nuo Jev scorer ir jų leistinų profilių. Reikia matomos cancel/baigties semantikos ir suprantamo budget/account konteksto, neišvedant secrets. Neužtenka, kad tai būtų paslėpta bendruose Settings.
2. **Kandidato parengtis.** Žalias `Candidate` taškas ir „Before you can use it → Install module → Allow workspace file access“ kelias gali vizualiai prilyginti source-only kandidatą parengtai diegiamai integracijai. Katalogo kandidatas turi neutralų source-only/pending statusą; tik konkretus patikrintas adapterio profilis pereina į setup/install. `Review setup` gali rodyti trūkstamas prielaidas, tačiau neturi apeiti admission. Exact release/pin ir evidence turi būti pasiekiami detalėje, o nežinomos kainos/permissions netampa nuliu.
3. **Kodo ir kokybės pavyzdys.** Workspace diff turi TypeScript `DocumentConverter` import iš Docling ir `extractTables` stiliaus kvietimą; tai nėra mūsų source patvirtintas Docling Python API ar įgyvendintas adapteris. Pakeisti į aiškiai pažymėtą pseudo-code arba tikrą būsimo kontrakto/worker kliento pavyzdį. „Reliable table extraction“ ir tool „Completed“ neturi apsimesti mūsų kokybės įrodymu, kol domain checks dar `Running`. Bendra concept žyma naudinga, bet nepakanka vėliau iš paveikslo perimti išgalvotą API į kodą.

**Galutinė mano rekomendacija nesikeičia:** realus Rakazo React UI pernaudojimas, OpenCode UX principai ir pasirinktinai tik įrodytą naudą teikiantis React transporto/projection adapteris. Vienas UI ir autoritetingas runtime; final source pasirinkimas pagal ribotą P0 palyginimą, ne pagal maketo ar npm paketo egzistavimą. Runtime ir React–Rakazo–OpenCode suderinamumas **NOT_RUN**.

## 8. Galutinis reuse ir naujo projekto eigos patikrinimas

Perskaityti visi nauji `docs/UI-FOUNDATIONS.md` ir `docs/PROJECT-CREATION.md` tekstai. **Blocker ar major neatitikimų nerasta.** Pritariu konkrečiam Rakazo workspace/composer/tool/artifact/i18n/transporto source inventoriui, vienam autoritetingam runtime, alternatyviam OpenCode UI P0 fail gate ir aiškiam UX idėjos atskyrimui nuo tiesioginio kodo reuse. Naujo projekto eiga pirmiausia ieško tinkamo esamo pagrindo bei papildančių bibliotekų; nesujungia kelių pilnų produktų vien dėl populiarumo ir aiškiai parodo kuriamą trūkstamą dalį.

`PROJECT-CREATION` §4 teisingai atskiria įprastą izoliuoto vartotojo projekto priklausomybę nuo naujo visiems rekomenduojamo RepositoryZero modulio: pirmoji turi exact pin/lock, kilmę, leidžiamą build/test kelią ir projekto grants, bet neprivalo laukti viso centrinio registry admission. Pakartotinai naudojamas adapteris į bendrą registrą keliauja atskirai ir opt-in; privatus kodas bei finansiniai duomenys savaime neviešinami. MVP nepervadinamas į visą buhalterinę ERP, o sintetinis coding fixture neįrodo šalies mokesčių atitikties.

Pagrindiniam agentui perduoti du detalizavimo punktai pagal jau sutartas taisykles: žmonių code review/release/real-user patirties įrodymai turi konkretaus source, versijos ir datos kilmę, nes stars ar upstream CI nepakeičia mūsų integracijos PASS; interaktyvaus projekto 2–5 kandidatų tyrimas dalijasi vienu task/global cap, kuriame skaičiuojami child, routing, retry ir pagalbiniai modelio kvietimai. Atskirai pasirinktas projektinis darbas nepanaikina public mass-intake paid0.

Nauja aiški naudotojo vizualinė kryptis – **juoda ir salotinė**, pakeičianti ankstesnių konceptų mint akcentą. Ankstesni vaizdai lieka dizaino iteracijos istorija; peržiūrėti jų source ar runtime teiginiai dėl spalvos netampa įrodyti. Tolesnė paletės adaptacija ir kontrasto/focus patikra lieka UI įgyvendinimo dalimi, nesukuria naujo UI ar scheduler. Šiame papildyme nebuvo naujų source užklausų, programų paleidimo ar imagegen; pakeistas tik šis review.
