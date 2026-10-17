# RepositoryZero nepriklausomas architektūros auditas

Data: 2026-10-17. Vertintas commit: `fe14bdd4fb9cd8805938e1169a4bd2d13961bb86`. Apimtis: analizė, šaltinio patikra ir nemokami vietiniai testai. Produkto kodas, Git istorija, promptai ir vertintuvai nekeisti. Tai pirmojo nepriklausomo vertinimo ir vėliau gautų keturių techninių klausimų sintezė.

**Rekomendacija: plėsti esamą Rakazo vykdymo pagrindą, į jį įvedant mažą, patikrinamą komponentų atradimo, paruošimo ir panaudojimo grandinę.** Nekurti antro CLI orkestratoriaus ar naujos platformos. Jev naudoti pasirinktose sprendimo vietose, kai jis matuojamai pagerina bendrą rezultatą. REA prijungti kaip ribotos aprėpties analizės ir stebėjimo specialistą.

Projekto svarbiausia spraga yra ne katalogo dydis, modelių kiekis ar dar viena JSON schema. Šiuo metu nėra bendru produkto keliu įrodyta, kad laisva užduotis virsta tinkamo komponento atradimu, jo paruošimu, realiu panaudojimu ir nepriklausomai patikrintu rezultatu, kartu apskaitant visą darbo kainą. Atskirų šios grandinės dalių jau yra daug.

„Galingiausias pasaulyje open-source produktas“ yra ambicija. Dabartiniai duomenys neleidžia teigti pasaulinio pranašumo, pakartojamo Jev pagreitėjimo ar universalaus programų atkūrimo. Patikimas pirmasis pažadas galėtų būti: **produktas padeda užbaigti tikrą darbą, panaudoja tai, ką verta panaudoti, ir parodo patikrinamą rezultatą bei jo kainą.**

## Įrodymų aprėptis

Autoritetingas checkout: `<checkout>` Debian WSL. Windows `RepositoryZero` katalogas yra ankstesnis eksportas be `.git`, todėl nelaikytas dabartinio produkto šaltiniu. Audito pradžios ir diagnostikos metu HEAD sutapo su vietiniu `origin/main`; buvo švarus darbo medis. Šiame audite nuotolinis fetch neatliktas: perduota informacija apie prieš delegavimą atliktą fetch nėra nauja savarankiška tinklo patikra. Pinet bootstrap taisyklė šiam origin netaikoma.

Inventorizuoti 2 223 sekami failai ir 102 Markdown dokumentai. Visų dokumentų inventorius nėra visų dokumentų išsamus perskaitymas. `EVIDENCE.json` atskiria išsamiai skaitytus dokumentus, tikslines ištraukas, simbolių paieškas ir vien inventorių. Dideli executor ir Pi runtime failai tikrinti pasirinktose vykdymo, apskaitos, modelių ir įrankių ribose, ne eilutė po eilutės.

| Šio audito veiksmas | Naujas rezultatas | Ko rezultatas neįrodo |
|---|---|---|
| `npm run test:foundation` | 98/98 testai, 10 failų | Produkto galutinio darbo, gyvo Jev kokybės ar pilno saugumo |
| Trys history/context rinkiniai | 49/49 testai, 3 failai | Naujos mokamos galutinio šaltinio konteksto kvalifikacijos |
| Tikro katalogo ir paieškos diagnostika | 796 įrašai, 21 užklausa; išsaugoti tikslūs rezultatai | Statistinio retrieval recall ar visų 796 šaltinių kokybės |
| Tikro repository selector vieno kandidato kontrolė | Semantiškai netinkamas, bet source kriterijus atitinkantis kandidatas gauna `recommended/source_only`; 0 tinklo dispatch | Leidimo vykdyti suteikimo ar įrodyto execution bypass |
| Užfiksuoti vieši Jev/REA šaltiniai | API ir deklaruotų profilių patikslinimas | Jų veikimo šiame produkte, dabartinio mokamo endpoint prieinamumo ar naujausio upstream HEAD |
| Nauji mokami kvietimai / CLI generacijos / Electron E2E | 0 / 0 / 0 | — |

Ankstesnių kalibravimų skaičiai toliau pažymėti kaip istoriniai dokumentų duomenys, o ne šiame audite pakartoti eksperimentai. Išsaugoti `foundation.log`, `context.log`, `probe.mjs`, `probe-results.json`, `document-inventory.json`.

## Ką verta išlaikyti

1. **Vieną vykdymo pagrindą.** Worker jau komponuoja runtime, kompiuterių/sandbox adapterius, connectorius, atmintį, artefaktų saugyklą, Graphile darbus ir executor. DB turi Run, Attempt, lease/fence, ExternalEffect ir Artifact versijas. Tai reikšminga produkto bazė, kurios CLI apvalkalas nepakeičia. [E01, E02]
2. **Backend kontroliuojamas teises ir efektus.** Executor jau išsprendžia tikrą connector/tool, saugo patvirtinimo užklausą ir įtraukia resource/revision kontekstą. Naujas reuse planas turi prisijungti prie šių ribų, o ne jas apeiti. [E03]
3. **Konteksto selekciją ir apskaitos primitives.** Yra bounded context, atskiras retrieval default, `observedPiStream`, awaited producer `onUsage`, unikalus call ID, nullable unknown usage ir deduplikacija. Trūksta patikimos jų kompozicijos su bendru biudžetu, ne viso provider sluoksnio. [E04–E08]
4. **Lab eksperimentų discipliną.** Šaltinio/prompto/vertintuvo hash, išsaugotos nesėkmės, pasirengimo ir vertinimo laikas, nežinoma prenumeratos kaina ir nepriklausomos funkcinės kontrolės yra geri pradmenys. HTTP reuse paruošimas jau tikrina konkrečius source pin, susieja baitus su hash ir tikrina biblioteką apribotame konteineryje. Šis konkretus paruošėjas vertingesnis nei dar viena abstrakti „integracija“. [E12, E13]
5. **Plataus katalogo ir vietinės parengties atskyrimą.** Dokumentuose ši skirtis jau aprašyta gerai. Reikia ją įgyvendinti produkte, ne iš naujo atrasti kitais terminais. Katalogas, patikrintas profilis ir šioje instaliacijoje paruoštas komponentas nėra ta pati būsena. [D: TOOL-DIRECTORY, PROJECT-CREATION]

## Svarbiausi radiniai

### F01. Retrieval šiandien per siauras užduočiai suprasti

`searchRepositories` normalizuoja eilutę, padalija į žodžius ir reikalauja, kad **kiekvienas** žodis būtų repo/category/capability/note tekste. Rezultatai reitinguojami paprastu repo vardo priedu ir abėcėle. `repository_search` perduoda daugiausia penkis kandidatus. Tai nėra semantinis poreikio išskleidimas ar API/entrypoint paieška. [E09, E10]

Tik 158 iš 796 įrašų turi netuščią `capability`. Diagnozėje `csv`, `csv import`, `sandėlio`, `database`, `spreadsheet`, `pdf tables`, `image editor` ir `photoshop` nieko negrąžino. Tuo pačiu `sqlite`, `pdf`, `docling`, `honojs/hono` ir `FFmpeg` rado šaltinius. Tai rodo konkrečią užduoties kalbos ir katalogo indeksuojamo turinio spragą; neįrodo, kad nė vienas katalogo repo negali padėti tuščias išvestis gavusioms užduotims. [P01]

**Poveikis:** geras Jev negali pasirinkti komponento, kurio retrieval jam nepateikė. Daugiau katalogo įrašų be gebėjimų, sąsajų ir sinonimų gali padidinti triukšmą. Pirmas darbas: išskirti poreikius, pagerinti duomenis ir nebrangų lexical retrieval, tada išmatuoti semantinės paieškos poreikį.

### F02. `recommended/source_only` dar nereiškia semantiškai tinkamo kandidato

Repository selector filtruoja source prieinamumą, pin ir `!archived`; vieną likusį kandidatą grąžina be semantinio vertinimo. Kontrolėje kandidatas, aprašytas kaip neturintis CSV/DB gebėjimų, CSV+SQLite užduočiai gavo `recommended`, `engine: single_eligible`, `evidence: source_only`. Tai **advisory tikslumo problema**, ne vykdymo leidimas. [E11, P02]

Nesiūlau discovery reikalauti jau įdiegtos, patikrintos bibliotekos: tai uždarytų naujų šaltinių kelią. Reikia dviejų kelių ir aiškių rezultatų:

- Jau paruoštas profilis: patikrinti konkrečius užduoties, aplinkos, revizijos ir teisių faktus; jei jie tinka, pereiti tiesiai prie integravimo.
- Naujas source: grąžinti `candidate_for_inspection` su žinomu fit, prieštaravimais ir unknown; ribotai perskaityti manifestą/API/testus, tada spręsti dėl paruošimo.

Vieną kandidatą galima pigiai patikrinti be Jev: exact capability ir versijos atitiktis, suderinami manifestai, žinomo entrypoint smoke test arba ankstesnis tokio paties profilio įrodymas. Jei semantinio fakto nėra, vienas kandidatas lieka tyrimui, o ne automatiškai tinkamas. Jev kvietimas prasmingas tik jei jo atsakymas gali pakeisti kitą veiksmą. Bendras `archived` atmetimas taip pat per grubus: tai priežiūros/rizikos faktas; stabilus archyvuotas source gali būti tinkamas ribotam, patikrintam profiliui. [P02, D: MODULE-SELECTION]

### F03. Source paruošimas yra tikras, bet dar specializuotas; reuse nauda neįrodyta

`zero-lab-reuse.mjs` paruošia konkrečią Hono + node-server kombinaciją. Tai fiksuota, patikrinama HTTP biblioteka, ne bendras katalogo kandidatų paruošėjas. StockDesk scenarijus turi ranka parinktas užklausas ir paruoštą HTTP pagrindą; nėra automatinio CSV parserio atradimo/paruošimo. [E12, E13]

Istorinėje StockDesk A/C poroje abi programos praėjo deklaruotą patikrą, tačiau Jev pasirinko **nulį** šaltinių. C negavo bibliotekos. Kitoje B/C atrankoje B gavo HTTP paketą, bet naudojo `node:http`; nepakeisti vendor failai neįrodo bibliotekos integravimo. Vienas v1 kontrakto neaiškumas neleido tos poros laikyti sąžiningu pranašumo palyginimu. Vėlesnė v2 kontrolė nepaverčia ankstesnės nesėkmės sėkme. [D: STOCKDESK-CALIBRATION]

**Išvada:** šie bandymai pagrindžia harness ir atrankos tyrimą, bet ne teiginį „reuse pagreitino“. Reikia atskirai fiksuoti `provided`, `used`, `verified`, `beneficial`. Importo tekstas, katalogo nuoroda ir source baitų kopija nėra paskutinės trys būsenos.

### F04. Jev adapteriai ir biudžeto primitives dar nesudaro bendro produkto valdymo

Source paieškos įrankis prijungtas prie executor. Simbolių paieška parodė tool/model Jev selector apibrėžimus ir testus, o repository selector dar naudojamas atskirame verify skripte; šios atrankos nėra worker vykdymo kelio kompozicija. StockDesk tiesiogiai naudoja SystemOne adapterį. [E03, E14]

`zero-systemone.ts` turi prasmingas apsaugas: konkretų endpoint, bounded state/request/response, rezervą iki dispatch, pakartotinę autorizaciją, timeout, atsakymo tipų patikrą ir konservatyvų hold. Tačiau selector atsakymai neperneša visos sprendimo kilmės ir tikimybių į galutinį parinkimo rezultatą. Būtina saugoti decision receipt arba jo nuorodą; priešingu atveju sunku kalibruoti ir atkurti atranką. Vietinės aštuonių klausimų/pasirinkimų ribos yra adapterio sprendimas, ne nustatytas bendras API limitas. [E15]

### F05. Modelio stebėtojo prijungimas turi būti per vykdymą ir per tikrą target

Worker kuria bendrą `PiAgentRuntime({sessionRoot})` be `modelCallObserver`. `AgentRunRequest` jau turi run/thread/bot ID ir awaited `onUsage`. Dabartinis constructor observer gauna provider/model/token estimates, bet ne patikimą account/connection/run/attempt ryšį. `AgentRunModel.accountId` komentaras nurodo Cloudflare Gateway account; tai nėra universalus finansinis account ID. [E01, E04, E05]

Svarbu neprarasti jau veikiančių dalykų: `observedPiStream` sukuria `callId`, prieš provider kvietimą kviečia observer, po atsakymo awaited producer įrašo usage, `accounted` saugo consumer nuo pakartotinio įrašo, DB unikalus call ID suteikia papildomą deduplikaciją. Fallback modelis išsprendžiamas scoped resolver, o child kvietimai taip pat eina per observed stream. [E06–E08]

**Rekomendacija:** request-scoped observer/factory ir mažas call metaduomenų papildymas, o ne globalus mutable „current run“. Vien closure su run ID dar nepakanka: tikro primary/fallback/helper connection tapatybė turi ateiti iš trusted resolver, ne būti atspėta iš provider/model string. Vieną dabartinį call ID perduoti ir rezervui, ir usage, ir settlement. Observer settlement atnaujina rezervą, o ne sukuria antrą išlaidą šalia `recordUsage`. Detalus variantų palyginimas — plane, B atsakyme.

### F06. Gemini kontraktas patikrina deklaracijas, bet neįrodo darbo

Vertintas vietinis `contract-final-reviewed.ts` ir ankstesnis `review-results.json`; naujos generacijos ar papildomas schemos taisymo ciklas neatlikti. Naudingi invariantai: task ID atitiktis, validator ID unikalumas, bandymų seka, privalomi rezultatai deklaruojant PASS. Ankstesni kontroliniai testai ir TypeScript pataisa išsaugoti kaip ankstesnės peržiūros faktai. [E16]

Tačiau `invocation_snippet`, `success`, `passed`, `evidence_payload` ir hash yra pateikėjo deklaracijos. Schema nesaisto jų su trusted executor, tikru source/runtime, nekintamu artefaktu ar patikimu vertintuvu. Galima suformuoti nuoseklią PASS istoriją nieko nevykdžius. `outcome === FAIL` šaka nesudaro pilno iš faktų išvedamo būsenos reduktoriaus: net visi teigiami deklaruoti patikrinimai leidžiami su FAIL. Tai nebūtinai turi būti priverstinai pakeista į PASS — gali būti kitas realus nesėkmės pagrindas, kurio schema dabar neaprašo.

Be to, `max_retry_attempts` lyginamas su visu bandymų skaičiumi, todėl pavadinimas painioja pradinį bandymą ir pakartojimus. Keli validator tipai neuždengia universalaus darbo, o `visual_watermark_verify` nėra bendras kokybės ar realaus bibliotekos panaudojimo įrodymas.

**Sprendimas:** neintegruoti šio vieno didelio kontrakto į produktą. Palikti jį kaip prototipo istoriją ir kelių invariantų/testų idėjų šaltinį. Esamus Run/Attempt/Artifact/Usage papildyti mažais backend valdomais įrašais. Nereikia trečio schemos „pataisymo“, kol nėra vykdymo ir patikros grandinės.

### F07. Esami konteksto rezultatai riboti, o išsaugota nesėkmė svarbi

Produkto default yra `retrieval`; nebereikia siūlyti jį kurti nuo nulio. Tačiau `history-findings.md` aiškiai išsaugo vėlesnio šaltinio mokamos kvalifikacijos 53/54 rezultatą ir neįvykdytą final-source gate. Ankstesnis 54/54 bei šiame audite praėję 49 offline testai šios mokamos kvalifikacijos nepakeičia. Dokumentuose pažymėta ir nekontroliuota provider cache būsena. [E04, E17]

Paieškai skirti komponentų dokumentai ir pokalbio istorija yra susijusios, bet skirtingos užduotys. Siūloma naudoti esamus context biudžetus bei tool-result ribojimą; neprikurti antro istorijos variklio. Jev dokumentų atranka turi išsaugoti privalomus kontraktus, šaltinių ID ir galimybę gauti pilną įrodymą. „Trumpesnis promptas“ dar nėra „pigesnė visa užduotis“.

### F08. CI ir platinimo ribos dar neatitinka savarankiško produkto išleidimo

Sekamame medyje nėra root `.github/workflows`; 12 workflow yra `platform/.github/workflows`. GitHub workflow discovery turi būti saugyklos root `.github/workflows`, todėl šių failų buvimas platform kataloge savaime neaktyvuoja Zero CI. Tai failų vietos išvada, ne šviežia GitHub Actions vykdymų apklausa. Paveldėtas CI apima ir publish/deploy; jo aklai perkelti negalima. [E18, W12]

Desktop manifestas ir images Compose dar nurodo Rakazo product/app/release/image tapatybę. Vidinių `@rakazo/*` paketų masinis pervadinimas nėra būtinas pirmam vertės įrodymui, tačiau prieš Zero diegiklio išleidimą publikavimo kanalai ir tikras švaraus host install/update turi būti patikrinti. Šio audito metu nebuvo nei diegimo, nei platinimo, nei 2 GB dydžio vartų matavimo. [E19]

## Tikslūs Jev, Rakazo ir REA vaidmenys

| Dalis | Pagrįstas vaidmuo | Ko jai neperduoti |
|---|---|---|
| Rakazo pagrindas | UI, tapatybė ir scope, jobs, Run/Attempt, įrankių/efektų kontrolė, vykdymas ir saugojimas | Naujo antro produkto/scheduler valdžios |
| Pagrindinis generuojantis modelis | Poreikio išskleidimas, integravimo/kodo kūrimas, neapibrėžto darbo sprendimas | Teisės pats paskelbti nepriklausomą PASS ar padidinti limitus |
| Jev/SystemOne | Ribotas klasifikavimas, pasirinkimas, ordinalus vertinimas, tikimybės | Kodo generavimo, laisvos formos universalaus plano, licencijos/teisių/autorizavimo autoriteto |
| REA | Šaltinio ir artefakto analizės bei konkrečių stebėjimų įrodymai | Universalios programos klonavimo, pilno originalaus source atkūrimo ar sandbox garantijos |
| Trusted verifier | Konkretaus artefakto ir užduoties kontrakto patikra | Savavališko priėmimo kriterijų pakeitimo pagal sugeneruotą rezultatą |

Jev nėra vien „pigiau parinkti modelį“. Viešas OpenRouter SystemOne kontraktas priima `state` ir vardinius `questions` su `choice`, `noul`, `score`; vietinis adapteris realizuoja šią siauresnę tekstinę ribą. TypeSafe SDK tipuose `choice` turi confidence/probabilities, `noul` — teigiamo atsakymo tikimybę, o `score` gali būti trupmeninis laukiamas ordinalaus vertinimo balas. Tai nėra garantuotas faktinis teisingumas. [W02, W04]

Upstream TypeSafe SDK taip pat aprašo eksperimentinius image/`box` profilius, bet jų paritetas OpenRouter endpoint ir vietiniame adapteryje neįrodytas. Jų nereikia pirmam reuse keliui. Tiekėjų deklaruojami greičio ar kalibravimo rezultatai nėra RepositoryZero benchmark. Jų aptartas modelių konsensusu paremtas workflow etalonas nėra tas pats, kas faktinis užduoties outcome. [W01, W03]

Perspektyviausi Jev bandymai: kandidatų relevantiškumas pagal kiekvieną poreikį, dokumentų fragmentų atranka, klaidos priskyrimas žinomai taisymo klasei, įrankių šeimos pasirinkimas. Modelio routing palikti vėlesniam etapui su empiriniais modelių profiliais. Keli komponentai gali būti kartu naudingi, todėl vienas `choice` tarp jų dažnai netinkamas; tinka atskiri bounded `noul` klausimai arba pasirinkimas tarp jau suformuotų alternatyvių sprendimų. Tai rekomenduojami bandymai, ne įrodyta Jev nauda.

REA vertintas pagal konkretų `morluto/rea` commit `0e1f0bf…`, kurio manifestas nurodo `rea-agents` 6.5.0, Node runtime ir CLI/MCP. Tai nėra senas vien Python binarų analizatorius. Jo README aprašo native, JS/Electron, .NET ir web analizę bei papildomus profilius; ne visi jie šiame audite ar Zero išbandyti. [W06–W08]

Siūloma seka: statinis valdomo JS/Electron artefakto profilis → pasyvus browser stebėjimas ir scenarijų palyginimas → atskiras native/process profilis. Browser observation nėra bendras CUA valdiklis. REA evidence `coverage`, `limitations` ir partial/unknown turi likti matomi, ne suspausti į vieną „equivalent“. [W09, W10]

Ypač reikšminga Windows aplinkai: šio snapshot process capture dokumentai nurodo Linux/macOS PTY ir nepalaikomą native Windows capture; WSL profilis fiksuoja Linux procesą, ne Windows programos procesų medį. Process capture paveldi naudotojo teises/aplinką ir **nėra sandbox**. Izoliaciją turi suteikti Zero aplinka prieš jį paleisdama. [W11]

## Produktinė vertė ir augimas

Didelis source katalogas yra discovery inventorius. Paruoštas komponentas sutaupo suderinamumo ir diegimo darbą konkrečiame profilyje. Skeleton/template sutaupo pradžią pažįstamai projekto formai. Patikrintas receptas perduoda kelio nuo poreikio iki rezultato patirtį. Visos keturios rūšys naudingos, tačiau nei viena savaime nepakeičia konkretaus darbo patikros.

Pirmas naujas vartotojas turėtų gauti atidaromą/redaguojamą rezultatą, kuris išsprendžia jo užduotį, aiškų nepavykusių ar nepatikrintų dalių sąrašą, tikrą pakartojimo kelią ir suprantamą sąnaudų suvestinę. Kitą kartą tas pats komponentas ar receptas turi sumažinti pasirengimo ir taisymo darbą. Rekomendaciją kitam žmogui labiau skatintų atkuriamas demonstracinis rezultatas nei nepatvirtintas modulių skaičius.

Minimalus dalijimosi kelias gali būti Git repo + versijuotas recepto manifestas + vieši testiniai pavyzdžiai + CI report/hash. Nereikia privalomo naujo centrinio serviso, automatinio privataus darbo įkėlimo ar kiekvieno agento patirties paskelbimo. Naudotojo projektas, paslaptys, duomenys, acceptance atsakymai ir privatūs execution receipts pagal nutylėjimą lieka vietiniai. Viešinama aiškiai atrinkta bendroji dalis. Shared improvement reiškia peržiūrėtą kodą/receptą/įrodymus ir jų kitą įdiegimą; ne automatinį modelio svorių mokymąsi.

Vėliau naudotojas aiškiai patikslino savarankišką Library: žmogus pats naršo repo, populiariausius ir naujus radinius, filtruoja, išsisaugo, palygina ir pradeda savo projektą. Šis įėjimas turi būti nepriklausomas nuo AI užduoties. Dabartiniame UI katalogo data projection nėra stars/language/popularity laukų; tokia biblioteka reikalauja ir metaduomenų plėtros. Siūlomas septintas PNG maketas ir elgsena išsaugoti `ui-concepts/`. Stars skaičiai tame makete aiškiai demonstraciniai.

Papildomame, atskirai užsakytame UI etape built-in image_gen sugeneravo 7 ekranus ir 4 patikslinimus vienu peržiūros ratu. Jokių išorinių mokamų API/CLI generacijų tam nenaudota; built-in vaizdų generavimo sąnaudos šiame audite nematuotos. Pradinės architektūros patikrų lentelės nulis reiškia naujus mokamus coding/Jev eksperimentus, ne šių autorizuotų UI maketų nebuvimą.

## Sprendimas dėl kito etapo

Pirmas produktinis vertikalus bandymas turi eiti per esamą worker nuo pat pradžios. CLI palikti pakartojamam adapterio smoke test ir benchmark runner. Bendra mažų funkcijų biblioteka gali būti naudojama abiejų, bet workflow būsena ir leidimai turi likti vienoje vietoje.

Pirmųjų penkių rezultatų, dviejų discovery kelių, observer tapatybės, trijų skirtingų vertikalių ir sąžiningo holdout bandymo konkretūs priėmimo kriterijai pateikti [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md). Kiekvienas etapas turi baigtis veikiančiu įrodymu; naujų schema/registry/microservice sluoksnių kūrimas pats savaime nėra pažanga.

## Įrodymų nuorodos

Vietinių šaltinių tikslūs keliai, eilutės, SHA-256 ir nekintančios Git nuorodos yra [EVIDENCE.json](EVIDENCE.json). `E01–E21` žymi kodo/dokumentų faktus, `P01–P02` — šio audito diagnostiką, `D` — perskaitytus projekto dokumentus. Vieši šaltiniai:

- W01: [TypeSafe: SystemOne ir Jev pristatymas](https://typesafe.ai/blog/introducing-system-one-models-and-jev).
- W02: [OpenRouter SystemOne SDK dokumentacija, konkretus commit](https://github.com/OpenRouterTeam/typescript-sdk/blob/4200d11265efd9e27916989f0ac013f64ef949d0/docs/sdks/systemone/README.mdx).
- W03: [TypeSafe JS SDK README, konkretus commit](https://github.com/typesafe-ai/typesafe-sdk-js/blob/b844cd1aca12855a5d24a2df52a1401c86e7d37a/README.md).
- W04: [TypeSafe API tipai, konkretus commit](https://github.com/typesafe-ai/typesafe-sdk-js/blob/b844cd1aca12855a5d24a2df52a1401c86e7d37a/src/types.ts).
- W05: [OpenRouter SystemOne transporto kodas](https://github.com/OpenRouterTeam/typescript-sdk/blob/4200d11265efd9e27916989f0ac013f64ef949d0/src/funcs/systemOneCreate.ts).
- W06: [morluto/rea saugykla](https://github.com/morluto/rea).
- W07: [REA README, konkretus commit](https://github.com/morluto/rea/blob/0e1f0bf2d06943e59253b8a66923a1ae6005e81e/README.md).
- W08: [REA manifestas](https://github.com/morluto/rea/blob/0e1f0bf2d06943e59253b8a66923a1ae6005e81e/package.json).
- W09: [REA MCP evidence kontraktas](https://github.com/morluto/rea/blob/0e1f0bf2d06943e59253b8a66923a1ae6005e81e/docs/mcp-contracts.md).
- W10: [REA browser observation](https://github.com/morluto/rea/blob/0e1f0bf2d06943e59253b8a66923a1ae6005e81e/docs/browser-observation.md).
- W11: [REA process capture](https://github.com/morluto/rea/blob/0e1f0bf2d06943e59253b8a66923a1ae6005e81e/docs/process-capture.md).
- W12: [GitHub workflow sintaksė ir vieta](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).
