# Panašių modulių, dublių ir alternatyvų atranka

Plano 0.2 papildymas, 2026-10-16. **Suprojektuota, NOT_RUN.** Šis dokumentas nustato papildomas atrankos sąlygas, nepakeisdamas licencijų, izoliavimo ir [modulio priėmimo vartų](AUTONOMY-AND-UPDATES.md#6-kas-gali-siūlyti-repo-ir-kaip-prijungiamas-modulis). Dabartinis757repo baseinas dar nesugrupuotas pagal šią semantinę procedūrą; atliktas adresų/alias normalizavimas nėra visų funkcinių dublių patikra.

## 0. Kaip randame ir patikriname šimtus kandidatų

Pradinis tyrimo baseinas jau turi757unikalius prieinamus repo; tai source discovery, ne tiek mūsų patvirtintų integracijų. Kandidatų kiekio lubų nėra, tačiau reali atrankos, testavimo ir priežiūros apimtis turi baigtinius resursus.

1. **Keli discovery šaltiniai.** Oficialūs SDK ir paketų registrai, brandžių produktų tikros priklausomybės, domenų katalogai/awesome sąrašai, GitHub search/Trending/stars, tyrimų pavyzdžiai, maintainer ir naudotojų pasiūlymai. Sąrašo reputacija padeda atrasti, ne perima jo kokybės sprendimą. Maži nišiniai repo ir naudotojo būtini kandidatai išlieka.
2. **Pigūs bendri faktai.** Canonical repo/alias, exact SHA/release, prieinama pilna licencija ir jos scope, paskirtis, palaikomos sąsajos, priežiūros/release/issue signalai ir requirements. Metadata/cache/dedup atliekami prieš modelį. Archived ar mažai stars nėra universalus atmetimas; nežinomos teisės neinterpretuojamos kaip leidimas platinti.
3. **Bendruomenės patikimumo įrodymai.** Ieškome datuotų realių downstream naudojimo pavyzdžių, tikslių priklausomybių manifestų, atkuriamų demonstracijų, nepriklausomų patikrų ir išspręstų problemų. Skiriame autorių reklaminį teiginį, upstream CI ir nepriklausomą naudojimą. „Žinomas ir naudojamas“ nėra mūsų integracijos PASS.
4. **Konkretaus darbo shortlist.** Poreikis, OS/resursai, licencijos, API ir priežiūros suderinamumas apriboja rinkinį. Leistas Jev gali padėti semantiškai atrinkti kelis tinkamus aprašus; paprasta paieška ar deterministic faktas mokamo modelio nereikalauja. [Jev auditas](JEV-APPLICATIONS.md).
5. **Atkuriamas mūsų bandymas.** Tikslus source/paketo pin, plonas kontrakto adapteris ir izoliuotas install/build/smoke bei darbo correctness testas. Tinkami bendri CLI/HTTP/MCP/library profiliai leidžia kartoti conformance šablonus, tačiau konkretaus įrankio semantika vis tiek tikrinama. Nesėkmė/unknown paliekama matoma.
6. **Apibrėžta patvirtinimo apimtis.** Kuri versija, capability, OS/workload ir suite praėjo vartus; kas nematuota. Kataloge vienu metu gali būti šimtai source kandidatų, mažesnis eksperimentinių adapterių rinkinys ir dar mažesnis verified/recommended profilių rinkinys. Pirmam MVP prioritetas lieka browser/PDF/coding pjūvis, ne privalomas šimto integracijų skaičius.
7. **Naudojimas ir priežiūra.** Pasirinktinai gaunami vartotojų bandymų faktai, bendra problemų reprodukcija ir agentų pataisos padeda plėsti įrodymus. Naujas SHA gauna reikiamą perpatikrą; pasenęs PASS neslepiamas. [Kokybės ir upstream indėlio ciklas](COMMUNITY-QUALITY.md).

Taip galime plėsti patikimą katalogą nepriversdami kiekvieno naudotojo siųstis visų repo ar apmokėti gilią visų kandidatų modelio analizę. Pilna ši atrankos infrastruktūra dar neįgyvendinta; realūs pirmo pjūvio faktai atskirti [įgyvendinimo būsenoje](IMPLEMENTATION.md).

## 1. Keturios skirtingos situacijos

Realių naudotojų bandymų, nesėkmių ir pataisų įrodymai į atranką patenka pagal [bendruomenės kokybės modelį](COMMUNITY-QUALITY.md), su konkrečiu pin/profile ir trusted patikra. Agentų atsiliepimai bei priimti PR yra atskiri signalai.

| Pasiūlymas | Numatytas sprendimas | Būtinas įrodymas |
|---|---|---|
| Tas pats repo kitu URL, pervadinimas ar mirror | Vienas kanoninis kandidato įrašas su alias; išlaikyti kilmę ir pasiūlytoją | Patvirtintas redirect / upstream ryšys; vienodas pavadinimas ar SHA savaime nepakanka tapatybei |
| Fork arba wrapper tam pačiam upstream/API | Susieti kilmę ir skirtumus; neskelbti nauju gebėjimu vien dėl naujo repo | Tikras diff ir priklausomybių/protokolo/auth santykis, licencijos ir konkreti papildoma nauda |
| Tas pats gebėjimas, kitas įgyvendinimas | Alternatyvus adapteris tame pačiame capability kontrakte, jei yra pagrįsta vertė | Vienodos užduotys, suderinamas kontraktas ir palyginimas su dabartiniu tinkamu adapteriu |
| Naujas papildantis gebėjimas | Atskiras capability arba nauja aiškiai versijuota esamo kontrakto funkcija | Užduotis, kurios dabartiniai adapteriai neatlieka, ir domain/conformance testas |

Pavyzdys: STT adapteriai gali naudoti bendrą `speech.transcribe` kontraktą; diarization, streaming ar vertimo galimybės deklaruojamos atskirai ir tikrinamos. Vienodas bendras užrašas „audio AI“ dar nereiškia, kad TTS ir STT yra dubliai. Mažas naujas patobulinimas, kurį tikslingiau pridėti esamam adapteriui, siūlomas kaip patch, išlaikant autorystę ir upstream teises.

Vienas oficialus core/scheduler/UI lieka architektūros taisyklė. Naujas frameworkas negauna antro globalaus orkestratoriaus vaidmens vien dėl stipresnio README; gali būti izoliuotas specialistas arba atskirai peržiūrimas bazės keitimo ADR.

## 2. Kaip vyksta autonominė atranka

1. **Tapatybė:** normalizuoti URL ir canonical repo, tikrinti rename/mirror/fork kilmę. Jei prieinamas patikimas stabilus repo ID, jį saugoti kartu su adresais. Privatūs namespace neeksportuojami. Neaiškus match lieka hipoteze, ne automatiniu sujungimu.
2. **Funkcinis panašumas:** palyginti deklaruotą užduotį, įvesties/išvesties schemas, modelį/API/backend, kalbas, OS/hardware, failų formatus, permissions ir veikimo režimą. Teksto/embedding paieška tik pasiūlo panašius kandidatus; nepriima sprendimo iš pavadinimo ar vieno similarity skaičiaus.
3. **Vertės skirtumas:** pasiūlytojas arba triage agentas parengia delta: ką naujas kandidatas pagerina ar papildo, su kuo lyginamas, kokiame darbo profilyje ir kaip tai patikrinti. Nesant įrodymų kandidatas išlieka discovery eilėje; jam neskiriamas recommended statusas.
4. **Prioritetas ir biudžetas:** tikrinti perspektyviausius skirtumus, o ne automatiškai diegti visą baseiną. To paties capability/profile/pin/eval darbo rezervacija ir cache mažina pakartotinius build/eval; pasikeitus reikšmingam pin, suite ar aplinkai senas įrodymas neperimamas aklai.
5. **Palyginimas:** izoliuotas kandidatas ir dabartinis tinkamas adapteris gauna tuos pačius leistinus duomenis ir kriterijus. Įrankio/API/modelio bandymai turi realų grant ir cap. Vertinimą atlieka trusted suite bei nepriklausoma nuo autoriaus patikra, ne vien modelio nuomonė.
6. **Sprendimas:** susieti su esamu įrašu, siūlyti esamo adapterio pataisą, palikti experimental alternatyva, priimti konkretaus profilio specialistu, siūlyti naują default arba atidėti dėl neįrodyto pranašumo. Saugoti priežastį, baseline/candidate pins, ataskaitą, policy/suite versiją ir pakartotinio vertinimo sąlygą.

Fork/mirror ryšys nėra leidimas ignoruoti pakeitimus arba perimti patikimumą. Du wrappers į tą patį API nėra nepriklausomas atsarginis provideris. Tas pats tool per Treg ir tiesioginį SDK gali turėti tą patį downstream, bet kitus account/auth/billing/terms ir mūsų grants; šių prieigų tyliai nesujungiame.

## 3. „Stipresnis“ visada turi konkretų profilį

Privalomi licencijos/supply-chain/permissions/correctness vartai tikrinami pirmi. Juos praėjusiems lyginame:

- Užduoties kokybę, supported kalbas/formatus ir aiškias klaidas; LT rezultatai atskirai nuo EN.
- Latency iki pirmo rezultato, p50/p95 ir throughput su deklaruota apkrova.
- Faktinę modelio/API/compute kainą ir account/region priklausomybes.
- CPU/RAM/VRAM, install/download/steady/peak diską, offline ir OS palaikymą.
- Crash/cancel/retry/recovery, duomenų gavėjus, permissions ir priežiūros bei atnaujinimų kainą.

Vienodas hardware/modelis/biudžetas naudojamas, kai tai leidžia prasmingai izoliuoti adapterio skirtumą. CPU ir GPU, local ir hosted ar skirtingais modeliais paremti produktai papildomai lyginami kaip atskiri deklaruoti profiliai su pilnais kaštais; jų nelaikome identiškos aplinkos eksperimentu.

Praktinės reikšmės slenksčiai, leistinos regresijos, pakartojimai ir imtis nustatomi iš anksto pagal domeną. Triukšmingas kelių procentų skirtumas neskelbiamas nauju nugalėtoju; neapibrėžtas rezultatas lieka inconclusive. Žyma taikoma tik versijos+workload+hardware+model/config+grant kombinacijai, su vienodai ribotu tuning/compute biudžetu. Vertinant daug kandidatų atsižvelgti į daugkartinį lyginimą ir atrankos šališkumą; galutinį pasirinkimą patvirtinti atskiru holdout, o ne išrinkti geriausią triukšmingą vienos mažos imties rezultatą. Iš pradžių neįrodytas kandidatas neatmetamas amžiams: nauja versija, patikimas pranašumo įrodymas ar naujas poreikis gali grąžinti jį į eilę. Pakartotinės tapačios kandidatūros nesukuria neriboto testavimo.

## 4. Kaip sprendžiame „silpnesnis, bet kažkuo geresnis“

Toliau – hipotetiniai pavyzdžiai, ne šio darbo matavimai:

| Naujo kandidato savybė | Sprendimo kryptis |
|---|---|
| Prastesnė bendra STT kokybė, bet reikšmingai geresnė lietuvių kalba | LT profilio specialistas po to profilio patikrų |
| Lėtesnis, bet veikia offline be GPU ir telpa silpname kompiuteryje | CPU/offline profilis, jei atitinka minimalią to darbo kokybę |
| Tokia pati kokybė, bet mažesnė pilna kaina / leidimų apimtis / tinkamesnė licencija | Pagrįsta alternatyva arba default keitimo kandidatas |
| Greitesnis, bet neužtikrina privalomo teisingumo ar turi nepriimtiną licenciją | Nepriimti tam profiliui; greitis neatstoja privalomų vartų |
| Plačiai lygiavertis, bet realiai nepriklausomas ir patikimas atsarginis kelias | Galimas fallback profilis, įvertinus papildomą priežiūros kainą |
| Visuose apibrėžtuose svarbiuose profilio kriterijuose ne geresnis ir bent viename patikimai blogesnis | Dokumentuoti kaip šiam profiliui dominuojamą; kataloge išlaikyti, aktyviai nediegti/nerekomenduoti be naujos priežasties |
| Skirtumas neįrodytas arba yra svarbus neišmatuotas kriterijus | Experimental / deferred; papildomas ribotas testas tik pagal prioritetą |

Tai kelių kriterijų (Pareto) atranka **konkrečiame darbo profilyje**, o ne vienas universalus AI įrankių reitingas. Priežiūros sudėtingumas taip pat yra kaštas: nepaliekame penkių beveik vienodų adapterių be aiškios naudos, tačiau nenaudojame dirbtinės kvotos visam kandidatų baseinui. Stars, donorystė, autorius ar dažnas naudojimas nepakeičia įrodymo.

## 5. Vienas gebėjimas, keli aiškūs adapteriai

Registry turi vieną kanoninį capability ID+contract version apibrėžimą. Keli module IDs gali įgyvendinti jį savo release/platform profiliuose. Viename manifeste capability ID nepasikartoja; kelių modulių įgyvendinimas nėra klaidingas ID dublis. Semantika, vienetai ir įvesties/išvesties suderinamumas tikrinami conformance, vien ID teksto neužtenka.

Routing pirma filtruoja pagal trust, palaikomą funkciją, projektui leistus duomenų gavėjus/account, OS/hardware, leidimus ir budget; tik tada taiko išbandytą profilio prioritetą. Naudotojas gali pasirinkti/pin adapterį. Nėra taisyklės „naujas visada geresnis“ ar slapto perjungimo į kitą mokamą paskyrą.

Default keitimas → palyginimo įrodymai → atskiras pagal turimą policy leistas sprendimas → canary → versijuota registry/routing politika → naujos užduotys pagal tinkamą profilį. Pats default keitimas nėra leidimas automatiškai įdiegti naujas dependencies ar suteikti naujus grants. Veikiantys darbai išlaiko pin, o neaiškaus išorinio veiksmo failover nekartoja. Siauras P3C lane neapima naujo backend ar routing politikos perrašymo; automatikai reikia atskiro patikrinto kategorijos profilio.

Keičiamo adapterio deprecation turi paaiškinimą, migracijos/artefaktų suderinamumą ir rollback/grace kelią. Pinned darbas ar naudotojo duomenys neištrinami dėl mažo usage. Revoked nesaugus leidimas nėra leistinas fallback. Versijų saugojimas ir GC vyksta pagal bendrą lifecycle, ne pagal vien popularity skaitiklį.

## 6. Svetainė ir priėmimo vartai

Svetainėje vienas capability puslapis grupuoja adapterius: „default šiam profiliui“, „LT“, „CPU/offline“, „GPU“, „hosted“, „fallback“, „experimental“ ir pasirinkimo įrodymai. Kiekvienas integruotas modulis išlaiko savo kortelę. Modulių, unikalių capabilities ir gateway endpointų skaičiai rodomi atskirai; tas pats gebėjimas penkiuose repo netampa penkiais naujais gebėjimais. Silpnesnis/deferred kandidatas lieka tyrimo registre su priežastimi, ne dingsta iš istorijos.

- [ ] Alias/rename, tikras fork, nesusijęs vienodo pavadinimo repo ir panašus aprašymas duoda teisingus tapatybės / hipotezės ryšius.
- [ ] Vieną capability teikia keli adapteriai be ID konflikto; realiai skirtingi gebėjimai nesujungiami vien pagal tekstą.
- [ ] Sintetiniai cheaper/CPU/LT, privalomą gate pažeidžiantis, dominuojamas ir inconclusive kandidatai gauna tikėtinus sprendimus su priežastimis.
- [ ] Autorius negali pakeisti lyginimo suite/slėpti nesėkmių; testų duomenų, aplinkos ir pakartotinio panaudojimo riba fiksuota.
- [ ] Default/canary keitimas nekeičia vykstančio darbo pin, grants, account ar išorinio efekto semantikos; neteisėtas install/retry atmetamas.
- [ ] Registry, svetainės capability grupės ir usage skaitikliai nedvigubina naujų gebėjimų; submit/research rezervacijos ir limits veikia po restart.

Šios procedūros semantinis sugrupavimas ir runtime patikros dar neįgyvendinti. Reikalavimai įtraukti į [roadmapą](../ROADMAP.md); iki realių įrodymų nėra paskelbtų adapterių nugalėtojų.


## Žmonių jau sukurtų ir patikrintų sprendimų prioritetas

Reuse-first pasirinkimas remiasi ne vien funkcijų pažadais. Renkame realių naudotojų patirtį, nepriklausomas apžvalgas, išspręstus issue, release/priežiūros istoriją ir atkuriamų testų įrodymus su source, data bei versijos/profilio scope. Autoriaus reklaminis teiginys, stars ir upstream CI yra skirtingo stiprumo signalai; jie nevadinami mūsų adapterio ar užduoties PASS. Bendruomenės patikra ir mūsų integration validation rodomos atskirai. Nežinomas faktas lieka unknown; nišinis naujas įrankis vis tiek gali būti tiriamas kaip experimental. [Naujo projekto pasirinkimo eiga](PROJECT-CREATION.md).
