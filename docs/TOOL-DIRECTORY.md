# AI naudojamų įrankių katalogas, kategorijos ir paieška

> **Planuojama produkto specifikacija · peržiūrėta 2026-10-17.** Aprašo siekiamą elgesį; schemų pavyzdžiai ir maketai savaime nėra įgyvendintos funkcijos. Daliniai foundation komponentai nekeičia viso vartų statuso. Datuotos įgyvendinimo pastabos žemiau nėra atnaujinta būsenos suvestinė; senos kainų/auth/source prielaidos tikrinamos prieš realų profilį. Dabarties autoritetas: [būsena](IMPLEMENTATION.md), [priimta architektūra](DECISIONS.md), [roadmapas](../ROADMAP.md).

Projekto V1 dokumentacijos papildymas, 2026-10-16. Naudotojo reikalavimas: pagal kategoriją ar užduotį, pavyzdžiui, „reikia crypto boto“, rasti tinkamiausius įrankius ir matyti, kuriuos platformos AI jau gali naudoti. **Tai numatytas produkto veikimas; pilnas kandidatų semantinis sužymėjimas, paieškos UI ir runtime įrankių reitingai dar neįgyvendinti.** [Bendra produkto dokumentacija](PROJECT-V1.md).

## 1. Katalogo principas

Kataloge yra AI modeliai, agentai ir įrankiai, kuriuos AI gali pasitelkti darbui: taip pat įprastos bibliotekos, CLI, API, duomenų šaltiniai ir specializuotos programos. Neprivalo pats įrankis turėti LLM viduje, kad būtų naudingas agentui.

Vienam įrankiui leidžiamos kelios sritys/užduotys. Jis turi vieną kanoninį įrašą, kilmę ir tikslias versijas; nėra kopijuojamas į penkis tariamai skirtingus modulius vien todėl, kad tinka penkioms kategorijoms. [Dublių ir alternatyvų atranka](MODULE-SELECTION.md).

**Platus katalogas nėra visų repo įdiegimas.** Jame laikome metadata, nuorodas, versijas ir įrodymus. Agentas pagal užduotį išsirenka mažą kandidatų rinkinį, tikslinę dokumentaciją/source gauna pagal poreikį, o į projekto aplinką įtraukia tik reikalingą pagrindą ar komponentus. API įrankiui nebūtinas jo serverio source checkout. Katalogo patvirtinimas, konkretaus profilio `verified` ir vietinis įdiegimas yra atskiros būsenos. [Saugojimo sluoksniai, cache ir versijų eiga](PROJECT-CREATION.md#0-katalogas-nėra-visų-repo-atsisiuntimas).

## 2. Trys navigacijos lygiai ir papildomi filtrai

| Lygis | Ką atsako | Pavyzdys |
|---|---|---|
| Sritis | Kurį darbų pasaulį nagrinėji? | Finansai → Crypto / blockchain |
| Gebėjimas | Ką tiksliai reikia padaryti? | Gauti rinkos duomenis, backtestinti, paper trade, analizuoti on-chain |
| Darbo receptas | Kokio rezultato nori? | Crypto boto testinis prototipas iš duomenų, strategijos, simulatoriaus ir stebėsenos |

Papildomi nepriklausomi facetai: AI modelis / framework / library / dataset / connector / programa; API/HTTP/MCP/CLI/worker/library sąsaja; local/offline/hosted; OS ir CPU/GPU/VRAM; licencijos profilis; auth/account/region; faktinė kaina arba unknown; teisių apimtis; source-only/experimental/verified/recommended; upstream/verified versijos ir paskutinė patikra.

Sritis nėra runtime capability ID. Canonical capability ir jo kontrakto versija turi tikrą semantinę/conformance patikrą; paieškos sinonimas ar kategorijos pavadinimas nesuteikia naujo leidimo įrankiui.

## 3. Pradinis platus kategorijų karkasas

Tai plečiamas katalogo karkasas, ne teiginys, kad visose srityse jau yra patikrintų integracijų ar kad aprašyti visi pasaulio įrankiai. Kiekviename skyriuje gali būti daugiau subkategorijų pagal realius kandidatus ir darbus.

| Sritis | Numatomos subkategorijos |
|---|---|
| Programavimas ir programų kūrimas | Coding agentai, bibliotekų paieška, web/mobile/desktop, code review/refactor, build/deploy |
| Testavimas ir vertinimas | Unit/integration/e2e, agent benchmarks, model eval, fault injection, correctness |
| Agentai ir darbo automatizavimas | Specializuoti agentai, workflow, planavimas, patvari būsena ir coordinator komponentai |
| Modeliai ir inference | LLM/multimodal modeliai, serving, routing, quantization, adapters ir lokalūs profiliai |
| Atmintis ir žinių paieška | RAG, full-text/vector search, knowledge bases, provenance ir duomenų indeksavimas |
| Web research ir duomenų rinkimas | Paieška, crawling/scraping, extraction, šaltinių citatos ir monitoring |
| Browser ir desktop veiksmai | Deterministinė automatika, computer use, GUI/VM ir testiniai profiliai |
| Dokumentai ir Office | PDF/OCR, lentelės, DOCX/PPTX/XLSX, forms ir redaguojami eksportai |
| Duomenys, analizė ir statistika | SQL/DB, ETL, dataframe, skaičiavimas, vizualizacijos ir ataskaitos |
| Balsas ir garsas | STT/ASR, TTS, diarization, VAD, realtime voice, vertimas ir garso apdorojimas |
| Vaizdai ir dizainas | Generavimas/redagavimas, OCR/vision, vektorinė grafika, layouts ir assets |
| Video ir kinematografija | T2V/I2V, camera control, consistency, avatar/lip-sync, montažas ir subtitrai |
|3D, CAD ir gamyba | Parametrinis CAD, mesh/geometry, render/scenes, simulation ir failų eksportai |
| Mokslas ir matematika | Tyrimų/eksperimentų pipeline, optimizavimas, algebra/statistika ir domenų simuliatoriai |
| Robotika ir inžinerija | Perception, planning/control, skaitmeniniai modeliai, geospatial ir sistemos projektavimas |
| Finansai ir Crypto | Market data, analysis/signals, backtesting, paper trading, exchange connectors, portfolio ir on-chain analytics |
| Saugumas ir programų analizė | REA/reverse engineering, AST, savo HTTP analizė, dependency/SBOM/vulnerability ir audito įrankiai |
| Infrastruktūra ir operacijos | Containers/VM, sandbox, CI/CD, monitoring/logs, storage/backup ir signed updates |
| Verslas ir produktyvumas | ERP/CRM, procesų jungtys, projektai/užduotys, darbo dokumentai ir approvals |
| Komunikacija ir jungtys | El. paštas/calendar, paslaugų API, MCP gateways, Treg ir account connectoriai |
| Marketingas ir turinys | SEO/analytics, turinio ruošiniai, savų kanalų publikavimas, creator/press medžiaga |
| Mokymasis ir bendruomenė | Tutorials/use cases, mokymo/paaiškinimo įrankiai, Video Hub ir contributor receptai |

Vien kelių taikomųjų sričių turėjimas nėra priežastis įdiegti kelis globalius frameworkus. Karkasas skirtas rasti ir palyginti, o vykdymui lieka vienas produkto autoritetas ir pasirenkami moduliai.

## 4. Pavyzdys: „reikia crypto boto“

Paieška turi padėti išskleisti bendrą norą į konkrečius jau egzistuojančių komponentų tipus:

| Ko gali reikėti | Kokius įrankius/savybes rasti | Kaip atskiriama parengtis |
|---|---|---|
| Rinkos duomenų | Kainos/OHLCV, order book, istorija, update/stream ir duomenų kokybė | Market-data read, source/licencija/regionas ir API limits |
| Strategijos prototipo | Signalai, indicators, strategijos framework ir konkretus testuojamas input/output | Užduoties/testo fit, ne pelningumo pažadas |
| Backtesting | Atkuriamas istorinis simuliatorius, data/time/fees/slippage konfigūracija | Įrodyti techniniai correctness ir pilnos sąlygos; retrospective rezultatas nėra ateities garantija |
| Paper trading | Testinė/simuliuota vykdymo aplinka ir rezultatų stebėjimas | Simulatoriaus/testnet profilis atskirai nuo realios paskyros |
| Biržų/API jungčių | Oficialus API ar tinkamas adapteris, palaikomi metodai, auth ir idempotency | Read, orders write ir bet kokia lėšų operacija turi atskirus grants; login neįjungia jų visų |
| Portfolio / on-chain analizės | Palaikomi duomenys/tinklai, indexing, tikslūs balansų/operacijų analizės kontraktai | Duomenų gavimas/analizė atskirai nuo pasirašymo ar sandorių vykdymo |
| Veikimo priežiūros | Schedules, logs, limitai, būsenos ir recovery | Realus runtime/platform/resource/cancel/failure profilis |

Rezultatas gali rodyti vieną visą frameworką arba mažą komponentų kombinaciją su paaiškinimu, kodėl toks pasirinkimas. Tai jau sutarto discovery/adapt/build principo taikymas, ne naujas dabartinis prekybos produktas. Jokio live trading, key prijungimo ar finansinės operacijos šiame darbe neatlikta.

Planuojamas pirmas testinis receptas, jei šis domenas pasirenkamas, būtų vieši/testiniai duomenys → strategijos prototipas → backtest/paper profilis → techninė rezultatų patikra. Realūs pavedimai nėra numanoma paieškos „crypto bot“ pasekmė; jiems reikėtų atskiro palaikomo modulio ir sąmoningai pasirinkto account/scope/limit profilio.

## 5. Ką reiškia „AI gali naudoti“

Kiekviena kortelė aiškiai rodo vieną iš įrodytų būsenų:

- **Rastas kandidatas:** source prieinamas, adapteris ir testai dar neparengti.
- **Yra tinkama integravimo sąsaja:** žinomas API/CLI/MCP/library kelias, bet mūsų adapterio veikimas dar gali būti neišbandytas.
- **Eksperimentinis adapteris:** yra konkreti sujungimo versija su ribota parengtimi ir įrodymais.
- **Patikrintas profilis:** konkretus release/OS/capability praėjo nustatytą acceptance; dar reikia konkrečios instaliacijos leidimų/auth/resursų.
- **Paruošta šioje instaliacijoje:** patikrintas tinkamas profilis įdiegtas/health-checked, naudotojo grants ir budget leidžia vykdymą. Ši asmeninė būsena neviešinama be atskiros aprėpties.

Vien gražiai aprašytas repo ar API egzistavimas negauna „ready to use“ mygtuko, kuris iš tikro neturi veikiančio adapterio. Visos šios runtime būsenos dabartiniame projekte dar NOT_RUN.

## 6. Kaip veiktų paieška ir rekomendacija

1. **Paprasta užklausa:** žmogus įrašo užduotį savo žodžiais arba renkasi kategoriją. Sinonimai, kalbos variantai ir lexical/full-text indeksas gali veikti be LLM kiekvienai užklausai.
2. **Tinkamumo filtrai:** ko reikia padaryti, OS/hardware, local/hosted, licencija/data locality, auth/permissions, budget ir reikalaujama parengtis. Nežinomi duomenys neperrašomi kaip atitinkantys reikalavimą.
3. **Grupuoti rezultatai:** jau patikrinti tinkami profiliai, eksperimentiniai ir discovery kandidatai atskirai. Jei nėra išbandyto tinkamo modulio, sistema taip ir pasako bei pateikia galimą vertinimo kelią.
4. **Paaiškinamas prioritetas:** pagal užduoties/profile įrodymus, correctness, kainą/resursus, permission/terms ir priežiūros ribas. Empiriniai balai lyginami tik prasmingai palyginamuose darbuose; stars/votes padeda atrasti, ne sertifikuoti.
5. **Veiksmas:** atidaryti palyginimą/receptą, pasirinkti patikrintą leistiną modulį arba pateikti kandidatą vertinti. Vien rezultato paspaudimas neįjungia mokamo API/dependency install ar rašymo teisių.

Bazinis search/browse/filter nenaudoja mokamo LLM po kiekvienos užklausos. Precomputed embeddings ar modeliu padedamas užduoties išskleidimas galimi tik pasirinktu ribotu profiliu ir per bendrą [biudžeto brokerį](INTAKE-AND-BUDGETS.md); jie nėra slepiami už „nemokamos paieškos“ pažado. Pradžiai tinkamas pasirinktos DB full-text kelias, o atskira search infrastruktūra tik pagal realų poreikį.

## 7. Taxonomy ir įrodymų priežiūra

Kategorijos turi stabilius IDs, label/sinonimus, parent/related ryšius ir versiją. Agentas gali pasiūlyti žymas iš source, contributor gali patikslinti, o patikimas validatorius taiko žinomas formas; nauja kategorija ar tag nėra techninio acceptance pokytis. Reikalingos naujos kategorijos įtraukiamos pagal realų gebėjimą, neužrakinant katalogo šiuo pradiniu sąrašu.

Source-only įrašų didelį kiekį galima žymėti taisyklėmis ir ribotu batch darbu su confidence/unknown. Nėra automatinės mokamos visų757gilių analizių prievolės. Netikslūs tag ir susiję rezultatai turi feedback/review kelią; low-stars/naujas kandidatas gali likti matomas.

Po upstream/policy/adapter pasikeitimo readiness ir palyginimo informacija atnaujinami pagal atskirus įrodymus. Datuotas „geriausias šiam profiliui“ nėra amžinas viso repo pažymys. Finansų/crypto, kūrybos, kodo ir kitų domenų correctness kriterijai skiriasi; vienas universalus leaderboard jų neatstoja.

## 8. Priėmimo vartai

- [ ] Kategorijos/subkategorijos, cross-tags ir search iš tų pačių versioned duomenų; vienas įrankis keliose srityse nėra dubliuojamas kaip nauja integracija.
- [ ] „Crypto bot“, LT voice, PDF tables ir coding užklausų testai randa tinkamas kategorijas/capabilities arba sąžiningai rodo missing coverage.
- [ ] Source-only/adapter/verified/local-ready būsenos nepakeliamos be reikiamų įrodymų; teisių/pinigų filtre unknown neinterpretuojamas kaip leidimas.
- [ ] Įprastas browse/search/filter atlieka0mokamų LLM kvietimų; įjungtas semantinis helper turi aiškų brokerio rezervą.
- [ ] Privalomi filters ir paaiškinimai nusveria nepalyginamus stars/votes/balus; finansiniai reads/orders ir duomenų operacijos nesujungiamos į vieną grant.
- [ ] Papildomos kategorijos ir sinonimai nekoreguoja trusted acceptance ir nepaslepia licencijos, platformos, costs ar failure aprėpties.

Šie darbai tik patikslina jau sutartą viešą katalogą, gebėjimų atranką ir paiešką. Dabartiniame research registre yra šaltinių kategorijos, tačiau pilnas šio produkto karkaso sužymėjimas ir search/ranking bandymai dar laukia įgyvendinimo.
