# Jev pritaikymo programavimui ir atrankai kritinė peržiūra

2026-10-16 UTC. Nepriklausoma antro projekto agento šaltinių peržiūra, o ne nepriklausomas saugumo auditas. **Šiame darbe nebuvo provider prisijungimo, mokamo API kvietimo, SDK diegimo ar Jev runtime bandymo.** Keistas tik šis dokumentas. Oficialūs jau išsaugoti šaltiniai perskaityti iš `/workspace/research-superintelligence/router-agent.json`; dešimties svarbiausių perskaitytų oficialių failų turinio SHA-256 sutampa su snapshot metadata. Naujo tinklo fetch neprireikė.

Perskaityti [routerių katalogas](../../catalog/router-candidates.json), [ankstesnė source peržiūra](router-review.md), [norminis routerio planas](../ROUTER-EVALUATION.md) ir esamas Rakazo bei RepositoryZero Jev kodas. Šis review siūlo pagrįstą plėtrą pagrindiniam agentui; pats savaime nekeičia norminės MVP apimties ar aktyvavimo leidimų.

## 1. Išvada

**Jev tinka kaip ribotų semantinių sprendimų komponentas.** Įrankių pasirinkimas yra viena paskirtis; tokia pati typed klausimų forma gali padėti pasirinkti aktualius failus, dokumentų fragmentus, testų grupę, jau leistiną vykdytojo profilį ar kelis repo tolesniam nagrinėjimui. Domeną suteikia mūsų pateiktas state, kandidatų aprašai ir klausimas. API savaime neieško GitHub, neskaito failų sistemos, nekuria kodo ir neįrodo pasirinkimo teisingumo.

Todėl abi kraštutinės pozicijos klaidina: „Jev daro viską“ priskiria jam kitų komponentų darbą, o „Jev yra tik tool router“ nepastebi oficialių bendros paskirties Choice/Noul/Score kontraktų. Rekomenduojamas vienas sprendimų transportas už bendro credential, recipient ir biudžetų brokerio, su atskirais užduočių profiliais. Antro scheduler, naujo agentų produkto ar viso katalogo siuntimo modeliui nereikia.

## 2. Patikrinta oficialiuose šaltiniuose

| Galimybė | Šaltinio faktas | Praktinė riba |
|---|---|---|
| OpenRouter SystemOne | Oficialus SDK bazė `https://openrouter.ai/api/v1`, kelias `/systemone`; dokumentuotas pavyzdys `typesafe/jev-1.13` | Tai source faktas, ne mūsų paskyros entitlement, kaina ar gyvas response |
| Struktūrinis state | OpenRouter leidžia tekstą, JSON objektą arba masyvą; TypeSafe turi platesnį ContentValue kontraktą | JSON nėra savarankiška repo paieška ar tiesioginė prieiga prie dokumentų |
| `choice` | Ne tuščias label→description kriterijų žemėlapis; atsakyme pasirinktas label | Mūsų adapteris turi tikrinti, kad label priklauso būtent šiai užklausai |
| `noul` | Yes/no klausimas, atsakyme `noul` skaičius, TypeSafe aprašytas kaip yes tikimybė | Tai nėra Boolean, formalus faktas ar leidimo grant |
| `score` | Bent dviejų lygių tvarkinga rubric; TypeSafe `ScoreResponse.score` yra expected score ir gali būti trupmeninis | Nelaikyti privalomai sveiku indeksu, bendru kokybės balu ar teisingumo tikimybe |
| Keli klausimai | `questions` yra vardinių klausimų record; oficialus OpenRouter pavyzdys tame pačiame call turi `is_bug`, `team`, `urgency` | Patvirtina multiquestion su bendru state, bet ne nemokamą, neribotą ar atskirą asinchroninį batch servisą |
| Abstain | Choice kriterijų vardus parenka klientas; galima įtraukti `abstain` arba `insufficient_evidence` | Perskaitytoje schemoje nėra atskiro universalaus abstain parametro; jį reikia aiškiai modeliuoti |
| Confidence / probabilities | TypeSafe tipai juos aprašo Choice/Score; OpenRouter schemoje jie optional; Noul turi savo tikimybės skaičių | Nebuvimas nėra nulis; slenksčiai ir kalibracija priklauso nuo konkretaus darbo |
| Usage | OpenRouter response turi input/output tokenų laukus ir optional cost; TypeSafe tokenų laukai gali būti null | Trūkstamas cost/usage nėra įrodytas nemokamas darbas; SDK schema nepatvirtina sąskaitos |
| Vaizdai | TypeSafe README/SDK aprašo eksperimentinius PNG/JPEG, specialų header ir `box` per `jev-preview` | Tai neįrodo vaizdų palaikymo mūsų pasirinktoje OpenRouter `jev-1.13` jungtyje; audio/video nepaskelbti patikrintais |

Oficialūs pins: `typesafe-ai/typesafe-sdk-js` **`b844cd1aca12855a5d24a2df52a1401c86e7d37a`**, `@typesafe-ai/sdk` 0.7.0, MIT; `OpenRouterTeam/typescript-sdk` **`4200d11265efd9e27916989f0ac013f64ef949d0`**, `@openrouter/sdk` 1.4.25, Apache-2.0. SDK licencija neapima visų hosted modelio naudojimo teisių ar kainodaros. Versijos modelio vardas nėra weights digest; `jev-latest` papildomai yra kintamas alias.

**Svarbi validavimo riba:** TypeSafe `src/client.ts` grąžinamą JSON po `parseBody` konvertuoja `as T`; TypeScript generic nėra runtime atsakymo patikra. OpenRouter Choice atsakymo schema reikalauja string, bet pati nesusieja jo su konkretaus request kriterijų enum. Mūsų sluoksnis turi validuoti klausimų vardus, tipus, enum, finite/range reikšmes, rubric dydį ir dalinį atsakymą. Nežinomas tipas ar praleistas klausimas netampa vykdymo leidimu.

## 3. Kas teigiama ir kas dar nežinoma

**Autorių / wrapperių teiginiai:** greitis, žema kaina, kalibruotos tikimybės, geresnė tool atranka ar dideli sutaupymo koeficientai. SDK forma patvirtina API paskirtį, tačiau nepatvirtina tokių rezultatų mūsų LT/EN užduotims, kodo bazėms ar infrastruktūrai. Senesni community default tarifai nėra dabartinės OpenRouter paskyros kainoraštis.

**Nežinoma / NOT_RUN:** gyvas modelio availability, account limits, quota, current rates, billing detalės multiquestion užklausai, tikras maksimalus context/klausimų skaičius mūsų pasirinktame profilyje, p50/p95, klaidų lygis, LT kokybė ir mūsų confidence kalibracija. Negalima žadėti „Jev visada pigesnis“ ar fiksuoto tokenų sutaupymo procento. Ankstesnis oficialių TypeSafe web domenų 403 lieka istorinis prieigos faktas; šioje peržiūroje jų prieinamumas iš naujo netikrintas.

## 4. Darbų pasidalijimo matrica

Toliau pateiktos **siūlomos paskirtys**, ne jau veikiančių integracijų sąrašas. Visos Jev eilutės reikalauja konkretaus workload patikros ir atskiro leistino cap.

| Darbas | Be Jev: deterministiškai | Galima Jev užduotis | Pagrindinis modelis / patikra |
|---|---|---|---|
| Repo atranka naujai funkcijai | Vietinis indeksas, kategorijos, exact pins, OS/licencijos/grants/resource filtrai | Iš kelių pateiktų repo pasirinkti nagrinėtiną arba įvertinti atitikimą brief | Perskaityti tikrus API/license/dependency įrodymus, palyginti architektūrą; build/test patvirtina integraciją |
| Kuriuos failus skaityti | `rg`, importų/dependency ryšiai, changed paths, language server / AST | Iš jau rastų trumpų failų aprašų ar fragmentų išskirti tikėtinai aktualius | Coding modelis skaito source ir keičia kodą; testai vertina rezultatą |
| Dokumentų fragmentai | Antraštės, paieška, simbolių nuorodos, dydžio ir duomenų leidimo filtrai | Pažymėti aktualius fragmentų ID konkrečiam klausimui | Modelis gauna pasirinktus originalius fragmentus ir pateikia atsakymą su kilme |
| Pirmos testų grupės pasirinkimas | Privalomi CI vartai, changed-package test mapping, test manifest | Parinkti papildomą tinkamą smoke/test profilį neaiškiam pakeitimui | Test runner vykdo; Jev neanuliuoja privalomų testų ar nepakeičia jų „pass“ tikimybe |
| Užduoties delegavimas | Pasiekiami workers, jų OS/tools/grants, concurrency ir bendras cap | Pasirinkti vieną leistiną coding/review/docs profilį pagal užduotį | Vienas coordinator paleidžia; pagrindinis modelis apibrėžia darbą, testai tikrina rezultatą |
| Modelio profilio parinkimas | Tik konformansą praėję modeliai, auth, duomenų gavėjas ir kainos cap | Pasirinkti tarp leistinų profilių pagal ribotą užduoties aprašą | Pasirinktas modelis sprendžia; priėmimą ir tikrą kainą tikrina brokeris bei užduoties testai |
| Issue / klaidos nukreipimas | Struktūriniai formos laukai, stack trace paths, savininkų žemėlapis | Bug/question/docs Choice, aktualaus komponento Choice, rubric pagal aprašą | Diagnostika ir pataisa reikalauja tikro source/reprodukcijos |
| Katalogo žymos | Žinomi manifestų/protokolų/platformų faktai ir jau patikrinti laukai | Ribotoje eilėje pasiūlyti semantines tags pagal pateiktus fragmentus | Tag proposal saugo kilmę; modelis neišgalvoja licence/OS/runtime verified faktų |
| PR rizikos nukreipimas | Changed paths, kritinių failų taisyklės, dependencies/hooks/policy diff | Papildomai nukreipti neaiškų pakeitimą į tinkamą review profilį | Trusted testai ir norminė merge politika lieka autoritetingi; Jev nepasirašo release |
| Auto-review klausimas | Privalomos teisių ir išorinių efektų taisyklės | Papildomas ask/pass signalas tik iš anksto leistoje rutinoje | Negali apeiti naujų grant, kritinės politikos, neaiškaus išorinio efekto ar operatoriaus išimčių |
| Santraukos / programos generavimas | Originalų saugojimas, failų ir konteksto limitai | Atrinkti ką skaityti ar kokį leistiną recipe taikyti | Laisvą tekstą, architektūros paaiškinimą ir kodą generuoja pagrindinis modelis; Jev typed schema nėra generatyvaus teksto pakaitalas |
| Public masinis intake | Auth, dedup, metadata cache, eilės ir rate limits | Tik aiškiai finansuotas atskiras triage profilis ateityje | Dabartinis public paid cap0 lieka0; privataus MVP key biudžetas nepaveldimas |

Nėra tikslo mokamai perklasifikuoti to, ką tiksliai žino manifestas ar taisyklė. Vienas akivaizdus tinkamas kandidatas dažnai nereikalauja papildomo modelio call. Pasirinkto Jev MVP conformance ir tikras naudojimo scenarijus vis tiek turi būti atlikti; ši optimizacija nesuteikia teisės jų pakeisti vien baseline.

## 5. Dokumentų ir repo filtravimo mechanizmas

Siūloma eiga: **indeksas / `rg` → mažas kandidatų rinkinys → privalomi filtrai → riboti originalūs fragmentai → Jev typed sprendimas, jei jis prasmingas ir leistas → pasirinktų originalų skaitymas pagrindiniu modeliu → veiksmas ir patikra**.

Repo aprašas, README ar failo tekstas neatsiranda Jev automatiškai: jį pirmiausia gauna mūsų source skaitymo komponentas. Jev gauna tik tai, ką jam iš tikrųjų nusiunčiame. Jei siunčiame visą dokumentaciją, jos perdavimas ir modelio apdorojimas vis tiek turi kainą, privatumą bei context ribą. Tai negali būti vadinama nemokamu filtravimu.

Kandidato išankstinis santraukų generavimas dideliu LLM taip pat yra atskiras darbas ir turi būti apskaitytas. Pirmiau verta naudoti jau turimą tikslios versijos metadata, antraštes, simbolių indeksą ir tiesioginius fragmentus. Jev nereikia visų 757 istorinio pool repo ar visų jų README kiekvienai užduočiai.

Atrinkto fragmento ID susiejamas su source pin, path ir turinio hash. Jev label negali tapti savavališku failo keliu ar URL, o grįžęs ID nesuteikia failo skaitymo teisės. Nauja versija, grant ar policy keičia cache galiojimą. Privataus failo negalima perduoti TypeSafe/OpenRouter vien todėl, kad jo aprašas tinkamas užduočiai.

Svarbiausia filtravimo klaida yra **praleista reikalinga medžiaga**. Todėl negalima vertinti tik trumpesnio prompt: būtina tikrinti relevant recall ir užbaigtos užduoties kokybę. Privalomi konfigūracijos/licencijos faktai ir norminiai testai netampa pasirenkami Jev sprendimu. Jei medžiagos nepakanka ar klaida rodo trūkstamą kontekstą, kitas ribotas paieškos žingsnis turi aiškų bendrą biudžetą, o ne neribotą automatinį fanout.

Failų/source cache taupo pakartotinį gavimą ar analizę; jei tą patį tekstą vėl siunčiame modeliui, jo tokenai neišnyksta. Provider prompt caching yra atskiras mechanizmas su savo sąlygomis. Zstd upload compression oficialiame TypeSafe SDK taip pat mažina tinklo payload, bet savaime neįrodo mažesnio modelio tokenų apmokestinimo.

## 6. Multiquestion, atranka ir abstain

Oficialiai pagrįstas vieno call pavyzdys mūsų paskirčiai būtų bendras trumpas brief ir trijų repo/failų fragmentai `state`, o `questions` — vardiniai `candidate_a_relevant`, `candidate_b_relevant` Noul ir `next_component` Choice su `abstain`. Tai **siūlomas wire panaudojimas**, šiame darbe jis provider neišsiųstas.

Keli Noul klausimai leidžia siūlyti daugiau nei vieną tinkamą kandidatą. Jų reikšmės neprivalo sumuotis iki1 ir savaime nėra bendras tarpusavio ranking. Choice padeda rinktis vieną alternatyvą; vienas Choice atsakymas nėra kelių kandidatų pilna eilė. Score lygina su užrakinta rubric; skirtingų klausimų ar rubrics balų negalima maišyti kaip vienodo objektyvaus kokybės balo. Pairwise turnyrai daugina klausimus ir užklausas, todėl mažam shortlist gali būti visai nereikalingi.

„Batch“ čia reikštų **ribotą multiquestion grupavimą vienoje SystemOne užklausoje**, ne patvirtintą atskirą `/batch` endpointą ar garantuotą bulk nuolaidą. Pirmam profiliui siūlau nedidelę konfigūruotą klausimų ribą ir bendrą payload/context limitą; tikras serverio limitas nustatomas conformance metu. Vienos HTTP užklausos rezervas turi apimti visą siunčiamą state ir klausimus, o kiekvienas papildomas chunk/retry — atskirą dispatch rezervą.

Viename state negalima sumaišyti skirtingų naudotojų ar skirtingų duomenų leidimų darbų vien dėl upload taupymo. Klausimų grupė turi vienodą leistiną recipient/profile ir aiškų sąnaudų priskyrimą. Keli vardiniai klausimai nesuteikia trūkstamo vidinio klausimų tarpusavio priklausomybės grafiko: nuo ankstesnio atsakymo priklausantį sprendimą planuoja mūsų coordinator ir prireikus apskaito kitą call.

Abstain reikia aprašyti kaip tikrą alternatyvą ir testuoti su „nėra tinkamo“ bei „nepakanka įrodymų“. Aukštas confidence po dirbtinai privalomo pasirinkimo nėra patikimas no-match pakaitalas. Trūkstant tikimybių jų neišgalvojame; žemo pasitikėjimo ar prieštaringas atsakymas grįžta į aiškiai pažymėtą baseline/missing/review kelią, ne slapta į mokamą didesnio modelio eskalaciją.

## 7. Esamas Jev kodas: pirmiau pernaudoti

Tikrai perskaityti vietiniai komponentai:

- [JevAutoReviewProvider](../../platform/packages/adapters/src/jev-auto-review.ts) ir [jo esami testai](../../platform/packages/adapters/src/jev-auto-review.test.ts).
- [Auto-review helperiai](../../platform/packages/adapters/src/auto-review.ts), [factory](../../platform/packages/adapters/src/auto-review-factory.ts) ir [executor caller](../../platform/packages/adapters/src/executor.ts).
- [Mūsų neaktyvus ToolSelector](../../platform/packages/adapters/src/zero-tool-selector.ts) ir [konservatyvus allocation ledger](../../platform/packages/db/src/zero-budget.ts).

`JevAutoReviewProvider` jau yra tikras upstream Rakazo komponentas: tiesioginis HTTP, hardcoded `https://api.typesafe.ai/v1/systemone`, `DEFAULT_JEV_MODEL=jev-latest`, `TYPESAFE_API_KEY`, Choice `pass/ask`, abort/deadline, `redirect:error`, 64 000 baitų atsakymo riba ir fail→error. Args/task/bot aprašai trumpinami. Executor prieš kvietimą naudoja esamą nested args bei žinomų secrets redakciją; vien providerio klasė pati visų args secrets neatpažįsta. Testo placeholder `[redacted]` nėra visų faktinių duomenų nutekėjimo neįmanomumo įrodymas.

Šis komponentas nėra bendras TypeSafe/OpenRouter client: URL fiksuotas, paskirtis auto-review, grąžinamas tik decision/reason/model. Jame nėra mūsų durable reserve, recipient recheck ar actual usage/requestID receipt kontrakto. `minConfidence` yra pasirinkto ask/pass profilio slenkstis, ne universalus teisingumo įrodymas. Source `resolveAutoReviewProviderKind` neradus TypeSafe key gali pereiti prie LLM checker; mūsų naujame leistino Jev profilyje toks mokamas fallback negali atsirasti be atskiro grant/cap.

`zero-tool-selector.ts` jau turi kitą realų wire panaudojimą: pasirinktas OpenRouter endpoint, iki5profilių, `abstain`, snapshot kopijas, pre-dispatch account/recipient ir per-profile grant/generation patikrą, post-selection patikrą, no retry ir durable reserve/hold sąsają. Jis dar neskaito pilnų provider usage/model/requestID kvitų ir nėra aktyvuotas mokamam darbui. Allocation ledger riboja baigtinius rezervus; pats savaime nežino tikros provider sąskaitos ar rinkos kainų.

**Siūlomas pernaudojimas:** prieš trečią Jev HTTP įgyvendinimą iš šių dviejų komponentų išskirti vieną mažą serverio `SystemOneDecisionClient` transportą ir typed response validavimą, pernaudojant esamus timeout/abort, body cap ir redaction helperius bei deterministinių testų fixtures. Transportas turi privalomus brokerio hooks, o ne pasirenkamą biudžeto callback, kurį viena paskirtis pamirštų perduoti. Tada `tool_selection`, `context_selection`, `repo_shortlist` ir `auto_review` lieka atskiri semantiniai/policy profiliai už to paties transporto.

Tai nėra siūlymas tiesiog pakeisti legacy auto-review URL arba perkelti vartotojo OpenRouter key į `TYPESAFE_API_KEY`. Credential binding, gavėjas, modelis, fallback ir spend lane parenkami trusted composition; agento pateiktas savavališkas `baseURL` negali perimti rakto. Legacy auto-review neaktyvuoti vien dėl to, kad naujam tool selector prijungta paskyra. Kritinių leidimų kontrolė lieka deterministinėje branduolio riboje.

Ploną question-builder ar brokerio kodo gabalą įgyvendinti patiems gali būti racionaliau nei įdiegti visą community gateway. `jev-code` ir `pi-jev` rodo pritaikymo pavyzdžius, tačiau nėra įrodymas, kad mums reikia antro MCP gateway, naujo Pi runtime ar OpenCode scheduler.

## 8. Sąnaudos, klaidos ir sąžininga naudos patikra

Taupymas galimas tada, kai **Jev + mažesnis pagrindinio modelio kontekstas + pakartotiniai taisymai** kainuoja mažiau už **baseline pagrindinio modelio darbą + jo taisymus** ir išlaikoma priimtina rezultato kokybė. Atskirai matuojamas žmogaus laikas, wall-clock ir source/compute poreikis. Mažesnis vieno pagrindinio prompt tokenų skaičius savaime neįrodo mažesnės bendros sąskaitos.

Mažai aiškiai užduočiai papildomas Jev call gali tik didinti kainą ir latency. Didelei pasikartojančiai fragmentų atrankai jis gali sumažinti pagrindinio modelio darbą. Jei atranka praleidžia esminį failą ir sukelia daug taisymų, tariamas taupymas virsta nuostoliu. Todėl būtina skaičiuoti ir nesėkmes bei visus fanout/retry/repair dispatchus.

TypeSafe SDK 0.7.0 defaults yra du retry po pirmo bandymo, 10 s vienam bandymui ir nėra bendro retry deadline. Juos išjungti arba kiekvieną bandymą atskirai rezervuoti. Dabar parašytas mūsų direct selector nenaudoja tokių SDK retry, todėl plėtra negali jų netyčia grąžinti. Timeout, cancel ir nutrūkęs atsakymas neįrodo neapmokestinto call; nežinomas rezervas lieka held.

Dokumentacija, kandidatų aprašai ir kodo komentarai laikomi nepatikimais duomenimis. Instructions laukų atskyrimas padeda formuluoti užduotį, bet nėra pakankama prompt-injection apsauga. Return enum, recipient/grants, neleidžiami nauji URLs, execution schema, concurrency ir resursų ribos tikrinamos už modelio. SDK debug režimas gali loginti request/response bodies; jo neįjungti privačiam darbui kaip nekaltos diagnostikos.

Vertinimui siūlau naudoti tą patį nedidelį užduočių ir kandidatų rinkinį trims režimams: indeksas/rules, indeksas+Jev, pagrindinio modelio atranka. Atskirti lengvus ir dviprasmiškus atvejus, žinomus ir missing, LT/EN, klaidinančius aprašus bei atšauktą grant. Matuoti relevant recall, netinkamą pasirinkimą, abstain, galutinės užduoties testus, bendrą actual usage/cost ir latency; įtraukti šaltą bei pakartotinį darbą. Šis siūlymas nėra naujas universalus benchmark PASS ar garantuotas sutaupymo tikslas.

## 9. Rekomenduojama darbų tvarka

1. **Dabar, be mokamų kvietimų:** užfiksuoti esamų dviejų Jev realizacijų pernaudojimo pasirinkimą, atskirti roles/lanes ir suplanuoti bendrą ribotą transportą. Indekso capability spragos taisomos faktais, ne Jev fanout.
2. **Gavus vartotojo credential ir baigtinį cap:** patikrinti konkretų account/model/protocol/rate/usage kontraktą; įjungti tik pasirinktą tool-selection conformance. Vien rakto buvimas neaktyvuoja kitų profilių.
3. **Pirma vertės plėtra:** tas pats bounded Choice/abstain mechanizmas konkretaus source-fragmentų arba repo shortlist atrankai po vietinių filtrų. Leisti palyginti su baseline; nepervadinti į autonominę geriausio GitHub projekto ekspertizę.
4. **Vėliau pagal matavimą:** ribotas multiquestion Noul/Score, testų ar delegavimo patarėjas. Privalomų testų ir kritinės policy keitimas į modelio sprendimą neįtraukiamas. Public metadata triage lieka atskiras finansuojamas profilis; dabartinis paid0 nekeičiamas.

Ši tvarka palaiko vartotojo pasirinktą Jev MVP kryptį ir leidžia panaudoti daugiau jo tikros API semantikos, nei vien tools pasirinkimą. Nauda turi būti įrodyta konkrečiam profiliui; ši peržiūra jos dar neišmatavo.

## 10. Tikslūs oficialūs šaltiniai

- OpenRouter [SystemOne dokumentuotas multiquestion pavyzdys ir model ID](https://github.com/OpenRouterTeam/typescript-sdk/blob/4200d11265efd9e27916989f0ac013f64ef949d0/docs/sdks/systemone/README.mdx), [HTTP kelias](https://github.com/OpenRouterTeam/typescript-sdk/blob/4200d11265efd9e27916989f0ac013f64ef949d0/src/funcs/systemOneCreate.ts), [bazė](https://github.com/OpenRouterTeam/typescript-sdk/blob/4200d11265efd9e27916989f0ac013f64ef949d0/src/lib/config.ts).
- OpenRouter [request/state/questions](https://github.com/OpenRouterTeam/typescript-sdk/blob/4200d11265efd9e27916989f0ac013f64ef949d0/src/models/decisionsrequest.ts), [Choice optional confidence](https://github.com/OpenRouterTeam/typescript-sdk/blob/4200d11265efd9e27916989f0ac013f64ef949d0/src/models/decisionschoiceanswer.ts), [Score atsakymas](https://github.com/OpenRouterTeam/typescript-sdk/blob/4200d11265efd9e27916989f0ac013f64ef949d0/src/models/decisionsscoreanswer.ts), [usage ir model](https://github.com/OpenRouterTeam/typescript-sdk/blob/4200d11265efd9e27916989f0ac013f64ef949d0/src/models/decisionsresponse.ts).
- TypeSafe [tipai, expected score ir nullable usage](https://github.com/typesafe-ai/typesafe-sdk-js/blob/b844cd1aca12855a5d24a2df52a1401c86e7d37a/src/types.ts), [question builders ir validavimas](https://github.com/typesafe-ai/typesafe-sdk-js/blob/b844cd1aca12855a5d24a2df52a1401c86e7d37a/src/questions.ts), [tikras klientas ir response cast](https://github.com/typesafe-ai/typesafe-sdk-js/blob/b844cd1aca12855a5d24a2df52a1401c86e7d37a/src/client.ts), [retry defaults](https://github.com/typesafe-ai/typesafe-sdk-js/blob/b844cd1aca12855a5d24a2df52a1401c86e7d37a/src/retry.ts), [vaizdai ir request compression](https://github.com/typesafe-ai/typesafe-sdk-js/blob/b844cd1aca12855a5d24a2df52a1401c86e7d37a/README.md).
- Community palyginimo pavyzdžiai, ne oficialių API pažadų pakaitalas: [pi-jev batched tools/skills/model klausimai](https://github.com/TheoOliveira/pi-jev/blob/c5b5847aa189fe5ffec52893b7051fe8f9e7a548/src/auto.ts), [jev-code HTTP client](https://github.com/FrancoisChastel/jev-code/blob/74a4569bfe8bb4ad0cc1ba74fa5867f09e267300/src/core/client.ts). Jų runtime, provider compatibility ir kainų ši peržiūra nepatvirtino.
