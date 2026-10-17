# Atviras UI pagrindas ir Rakazo / OpenCode hibridas

> **Planuojama produkto specifikacija · peržiūrėta 2026-10-17.** Aprašo siekiamą elgesį; schemų pavyzdžiai ir maketai savaime nėra įgyvendintos funkcijos. Daliniai foundation komponentai nekeičia viso vartų statuso. Datuotos įgyvendinimo pastabos žemiau nėra atnaujinta būsenos suvestinė; senos kainų/auth/source prielaidos tikrinamos prieš realų profilį. Dabarties autoritetas: [būsena](IMPLEMENTATION.md), [priimta architektūra](DECISIONS.md), [roadmapas](../ROADMAP.md).

2026-10-16. Dviejų agentų šaltinių ir dizaino peržiūra. **Pasirinkta projektavimo kryptis: realiai adaptuojamas Rakazo React workspace, papildytas OpenCode UX principais.** Galutinį source fork ir backend pasirinkimą patvirtina ribotas P0.0/P0.28 bandymas; šaltinių peržiūros metu install/build/runtime buvo **NOT_RUN**. Vėliau pasirinkta Rakazo adaptacija, web build ir pirmi UI testai praėjo; pilnas backend dar nepriimtas. [Aktuali įgyvendinimo būsena](IMPLEMENTATION.md). [Nepriklausoma kritika](quarantine/2026-10-17/docs/reviews/ui-foundation-review.md.snapshot.txt), [įrodymų registras](../catalog/ui-foundations.json).

## 1. Ką reiškia hibridas

Pernaudojame esamą darbo erdvę, composer, sesijų ir artefaktų komponentus; kuriame RepositoryZero navigaciją, būsenų pateikimą ir reikiamus naujus vaizdus. Iš OpenCode perimame gerai pagrįstus sesijų, suskleidžiamų tool veiksmų, diff ir kodo darbo UX sprendimus. Tiesiogiai panaudoto kodo kilmė ir notices išlaikomi. UX idėja ir source komponento importas žymimi skirtingai.

**Vienas autoritetingas runtime, viena UI būsenos projekcija, vienas credentials/grant/budget brokeris.** Rakazo React ir OpenCode Solid app nejungiame į du lygiaverčius produktus. Jei bandymas parodytų, kad visas OpenCode UI fork tinka geriau, jis taptų vienintele pasirinkta UI baze su aiškia backend adaptacija. Frameworkas pats savaime nėra atmetimo priežastis.

OpenCode neperimamas kaip antras savarankiškas agentų scheduler vien dėl jo sąsajos. Pasirinktinė coding ar provider transporto jungtis ateityje turi aiškų subtask/ToolCall kontraktą ir lieka brokerio ribose. Esamų Codex/OpenCode paskyrų paslaptys automatiškai neimportuojamos.

## 2. Palyginti konkretūs pagrindai

| Kandidatas | Patikrintas šaltinis | Ką pernaudotume / kas apsunkina pasirinkimą | Sprendimas planui |
|---|---|---|---|
| [Rakazo](https://github.com/elie222/rakazo/tree/7d5e64c886da7d556673f99e4923b013315007a9) | React19/Vite, bendri chat/UI paketai, oRPC contracts, Lingui, Electron desktop; root Apache-2.0 | Jau tikra agentų darbo erdvė, tool disclosure ir failų/PDF preview. Shell remiasi Rakazo thread/bot/space, auth ir RPC semantika; nėra backend-neutral skin. | **Pirmas realaus produkto UI ADAPT/FORK kandidatas.** |
| [OpenCode](https://github.com/anomalyco/opencode/tree/a448d5b987d01887e1597269b57ae2f259f5725b) | SolidJS app, UI/session-ui paketai, Electron desktop, root MIT | Išsamus coding/session UX, i18n ir tikri app entrypoints. App remiasi OpenCode API/events/PTY; vien kito serverio URL nepakanka. | UX atskaitos taškas ir alternatyvus viso UI adaptavimo pretendentas P0. |
| [OpenClaw](https://github.com/openclaw/openclaw/tree/48737801f74d6b7aabb71ee10dcc5f0b19a8494d) | Vite control UI; tikras app-root montuoja Solid su Lit bridge/routes, Gateway klientas; root MIT | Turtinga valdymo aplinka, tačiau tai jo Gateway sesijų/auth/protokolo klientas. Šiame snapshot nėra vien Lit ar React paketas. | Specializuotų valdymo UX tyrimas; papildomas Gateway nėra numanoma MVP priklausomybė. |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent/tree/60f56a6b13c8eb9a9e088c6fc1165257c92f7e11) | React/Vite web dashboard ir atskiras Electron desktop; root MIT | Web ChatPage iš tiesų įterpia Hermes TUI per xterm/WebSocket/PTY ir jo API. Desktop manifestas turi assistant-ui; desktop ir web chat nelaikomi tuo pačiu renderer. | Atkūrimo, modelių/skills valdymo ir desktop alternatyvų šaltinis; ne vien CLI projektas. |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui/tree/a46d6634e7a75eddd85d51415b1a615886d4ad0e) | React biblioteka ir tikras react-opencode runtime adapteris; root MIT | Galimas ribotas React komponentų pritaikymas. Biblioteka pati nesuteikia visos projektų darbo erdvės; OpenCode adapteris nepaverčia Rakazo serverio OpenCode serveriu. | Pagalbinė priemonė arba alternatyvos dalis, jei aiškiai sumažina darbą; ne dar vienas bendras UI perrašymas. |
| [LibreChat](https://github.com/LibreChat-AI/LibreChat/tree/e1dfc10449ff713faffacd60273fddcfe2c0a698) | Patikrinti README/root LICENSE ir manifestai: React18, i18next, Monaco, resizable panels, MCP Apps dependencies | Bendro modelių chat produkto alternatyva. Root LICENSE MIT, root/client manifestuose ISC — prieš kopijavimą reikia išspręsti konkretaus failo licencijos scope. Šiame cikle App.tsx spėtas kelias404, pilnas transportas neaudituotas. | Išsaugotas kandidatas; mažesnio gylio įrodymų neužtenka paskelbti jį geriausia baze. |

Tai tinkamumo palyginimas, ne empirinis pasaulinis UI reitingas. Visų šešių source pin, HTTP rezultatai ir failų hash saugomi registre. Root licencija nėra visų transityvinių paketų, assets ar prekių ženklų auditas.

## 3. Rakazo dalių realaus pernaudojimo inventorius

- `apps/web/src/pages/Shell.tsx`, `App.tsx`, `@rakazo/chat-ui`, `@rakazo/ui-web`: workspace, navigacija, composer ir thread pateikimas. Patikrinti dydį/priklausomybes ir adaptyviai išskirti presenters, išlaikant veikiantį pjūvį.
- `ToolActivityDisclosure.tsx`: esamas tool žingsnių pateikimas. Pridėti mūsų blocked/unknown/cancel ir atskiro validator rezultatą; upstream checkmark nepaverčiamas domeno PASS.
- `ArtifactFileCard.tsx`, `PdfViewer.tsx`: esamas Markdown/HTML/PDF preview ir download. Perkelti į ArtifactRef/ACL/provenance kelią; PDF iframe nėra pažadas palaikyti visus dokumentus ar saugiai rodyti bet kokį aktyvų turinį.
- `lib/i18n.ts`: Lingui lazy catalogs, persisted locale ir EN fallback. Jau yra EN/RU/ES/DE/FR/pt-BR/zh-CN; mūsų `zh-Hans` reikia aiškaus mapping, LT ir naujų ekranų vertimus pridėti bei patikrinti. Tai ne būtinybė i18n kurti nuo nulio.
- `lib/rpc.ts`: oRPC AppContract, workspace headers, session cookies ir local settings desktop bridge. Adaptuojamas konkretus transportas/brokerio kelias, ne tik spalvos.
- `App.tsx` auth/session/SubscriptionGate: mūsų localhost bazinis darbas neturi netyčia reikalauti upstream mokamos prenumeratos ar upstream serverio. Peržiūrėti pagal pasirinktą vietinį auth profilį; website GitHub login lieka atskiras portalui.
- `apps/desktop`: Electron platinimo kandidatas po web/local įrodymo. Originalūs update URL, telemetrija, branding, secrets ir launcher turi atitikti mūsų release politiką.

Tikslas nėra perkelti visą Rakazo funkcijų rinkinį vienu metu. Reikia išsaugoti tinkamą esamą produkto karkasą ir pridėti tik trūkstamas RepositoryZero funkcijas.

## 4. Tikras React / OpenCode tiltas ir jo riba

`@assistant-ui/react-opencode`0.2.31 manifeste nurodytas `@opencode-ai/sdk:^1.18.35`; source importuoja `@opencode-ai/sdk/v2/client`, naudoja useExternalStoreRuntime ir OpenCodeThreadController. Controller realiai kviečia session.promptAsync/abort/revert/fork, permission.reply ir question.reply.

Tai yra **React klientas OpenCode protokolui**, ne Solid OpenCode viso app konverteris ir ne gatavas Rakazo bridge. Tiksli atitiktis mūsų tikrintam OpenCode2.0.30 client/server snapshot dar NOT_RUN; skirtingos paketų versijos pačios neįrodo nei suderinamumo, nei lūžio. Rakazo bazėje šis adapteris nėra privalomas M1 komponentas. Jei vėliau įrodytas poreikis, jis turi rodyti brokerio valdomą coding subtask, o ne kurti antrą nepriklausomą projekto būseną.

## 5. Trys vienodi P0 UI bandymo srautai

1. **Darbas → rezultatas:** projektas, užduotis, tinkamų tools atranka/Jev, tikri įvykiai, artefaktas ir atskiras validator; pernaudotas composer ir workspace.
2. **Ribos ir tęstinumas:** missing grant/cap, unknown po timeout, Stop/cancel, reconnect ir restart; nelieka aklo write pakartojimo ar klaidingos baigties.
3. **Paieška → tinkamas profilis:** source-only, konkrečiam profiliui verified ir local-ready skirtumas, trūkstamas modulis, jokio diegimo iš paprasto browse.

Tos pačios fixtures, EN/RU ir ilgesnis LT tekstas, klaviatūra/focus ir mažesnis viewport; visiems8locale lieka atskiri kalbų vartai. Palyginame realų adaptavimo darbą, liečiamus backend sluoksnius, cold/steady/peak resursus ir fork/upstream priežiūrą. Nepriklausomas žmogaus walkthrough dar laukia. Jei Rakazo kelias neatitinka, užrašome konkretų faktą ir renkamės kitą vieną UI kelią.

- [ ] P0.28 Exact-pin reuse ADR, licencijų/notices, transporto ir locales mapping; trijų srautų įrodymai.
- [ ] P1.16 Pasirinktas esamas workspace/composer/source pritaikytas mūsų task/artifact/brokerio kontraktams, vienas runtime.
- [ ] P1.17 Preview/Changes/Checks, Stop, blocked/unknown/reconnect ir i18n/accessibility acceptance.

[Maketuose](UI-WORKSPACE.md) užfiksuota dizaino kryptis. Jie nesuteikia runtime PASS ir neįgyvendina šių checkbox.
