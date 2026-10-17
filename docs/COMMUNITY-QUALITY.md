# Kaip realus naudojimas pildo katalogo kokybės įrodymus

> **Planuojama produkto specifikacija · peržiūrėta 2026-10-17.** Aprašo siekiamą elgesį; schemų pavyzdžiai ir maketai savaime nėra įgyvendintos funkcijos. Daliniai foundation komponentai nekeičia viso vartų statuso. Datuotos įgyvendinimo pastabos žemiau nėra atnaujinta būsenos suvestinė; senos kainų/auth/source prielaidos tikrinamos prieš realų profilį. Dabarties autoritetas: [būsena](IMPLEMENTATION.md), [priimta architektūra](DECISIONS.md), [roadmapas](../ROADMAP.md).

2026-10-16. **Projektuojama, NOT_IMPLEMENTED / NOT_RUN:** bendras kokybės ledger, evaluator statusų projekcija ir community agregavimas dar nesukurti. Pernaudotame Rakazo yra vykdymo, usage ir testavimo primitives; tai nėra šiame dokumente aprašytos kokybės sistemos priėmimas. Dabartiniai faktai pateikti [įgyvendinimo būsenoje](IMPLEMENTATION.md).

Tikslas: naudojant repo ar modulį tikrai užduočiai, programa automatiškai užfiksuoja leidžiamus vykdymo ir patikros faktus. Laikui bėgant jie padeda atrinkti tinkamus profilius. **Naudojimo faktas nėra bendras „repo kokybė patvirtinta“ sprendimas, ir ne visi kandidatai būtinai taps verified.**

## 1. Keturi aiškūs įrodymų lygiai

| Žmogui rodomas lygis | Ką jis reiškia | Ko nesuteikia |
|---|---|---|
| Source-only kandidatas | Yra datuoti metadata/source įrodymai | Neįrodo įdiegimo, tikro vykdymo ar užduoties sėkmės |
| Observed naudojimas | Užfiksuotas konkretus bandymas ir jo baigtis su provenance | HTTP200, exit0 ar „naudotojas naudojo“ nėra pilnas correctness testas |
| Verified profilis | Trusted versijuotas evaluator patvirtino konkrečios kombinacijos reikalavimus | Negalioja automatiškai visam repo, kitai OS, SHA, modeliui ar užduoties klasei |
| Recommended konkrečiam darbui | Profilis praėjo privalomus vartus ir pagrįstą palyginimą pagal darbo kriterijus | Nereiškia geriausio pasaulyje įrankio ar leidimo jį įdiegti visiems |

`Observed` yra įrodymų žyma, o ne nauja privaloma registry state machine. Registry ir instaliacijos lifecycle lieka [kontraktuose](CONTRACTS.md): observed kandidatas gali būti `candidate` arba `experimental`; `verified/recommended` yra konkretaus modulio leidimo ir profilio sprendimas. UI „confirmed“ visada paaiškina, kuris iš šių faktų patvirtintas.

## 2. Automatinis vietinis įrodymų fiksavimas

Execution/effect/budget įrašai → deterministinis vietinis recorder → patikros įrodymų reference → trusted evaluator → versijuota kokybės projekcija. Papildomo mokamo LLM kiekvienam call ar visiems katalogo repo nereikia. Tą pačią faktinę baigtį naudoja ir [naudojimo statistika](USAGE-STATISTICS.md); antras nepriklausomas skaitiklių šaltinis nekuriamas.

| Vietinio QualityEvidence lauko grupė | Būtina riba |
|---|---|
| `repository`, `source_revision`, `package_digest` | Canonical tapatybė ir tikslus faktiškai panaudotas source/paketas; nežinomas pin lieka unknown |
| `module_release`, `adapter_revision`, `capability_version` | Atskirti upstream gebėjimą nuo mūsų adapterio ir kontrakto |
| `platform_profile`, `runtime_config_digest` | OS/arch, reikšminga įranga/runtime/dependencies ir modelio/profile kombinacija |
| `task_class`, `execution_kind` | Užduoties klasė; real user task, contributor run, synthetic eval ir upstream CI atskirai |
| `logical_run_ref`, `attempt_ref`, `evidence_id` | Vietinis ryšys ir dedup; retry nesukuria kitos nepriklausomos sėkmingos užduoties |
| `outcome`, `validation_outcome`, `effect_state` | Vykdymo ir užduoties patikros baigtys atskirai; neaiškus išorinis efektas neslepiamas |
| `suite_digest`, `fixture_digest`, `evaluator_digest`, `policy_digest` | Kas ir pagal kurią užrakintą metodiką tikrino; kandidato autorius jos pats nepasikeičia |
| `artifact_ref`, `evidence_digest`, `provenance`, `observed_at` | Vietinė kilmė, vientisumas, faktinis šaltinis ir laikas; digest savaime neįrodo teisingumo |
| `resource_metrics`, `coverage`, `uncertainty` | Faktiniai matavimai, known/unknown aprėptis ir ribos; nematuota kaina nėra0 |

Tai lauko grupių projektas, dar ne įgyvendinta JSON Schema ar endpoint. Hosted API/modeliui neįmanomas source pin nepakeičiamas išgalvotu SHA: saugomas viešas profilis, returned model/version kai pateiktas, schema fingerprint ir matavimo laikas su aiškia kintamo upstream riba.

## 3. Kas sprendžia kokybės statusą

AI gali pasiūlyti task class, paaiškinti logų signalą, sugrupuoti panašias klaidas ar pasiūlyti papildomą testą. Jev gali atlikti leistiną ribotą klasifikavimą, tačiau jo confidence ar LLM sakinys nėra acceptance. Pradinis kelias — vietiniai faktai ir rankinė peržiūra arba konkretus trusted evaluator; vėlesnė automatika veikia tik iš anksto patikrintoje policy kategorijoje.

Trusted evaluator skaito tik jam leistinus įrodymus ir taiko versijuotą suite/profile gate pagal [VALIDATION](VALIDATION.md). Statusą suteikiantis procesas atskirtas nuo vertinamo kodo ir jo autoriaus. Autorius negali pakeisti gate, nuslėpti nesėkmių ar pats pasirašyti savo verified; release parašas patvirtina kilmę, ne programos teisingumą.

Patvirtinimas siejamas su visa vertinta kombinacija ir ataskaita. Prieš įrašant statusą tikrinama esama registry/policy generation bei revocation; pasenusio snapshot PASS neatgaivina jau atšaukto leidimo. Vertinimo rezultatas ir registry statuso sprendimas saugomi atskirai, todėl sprendimą galima atsekti ir pakeisti nepersirašant pradinio bandymo fakto.

Nėra universalaus „confidence0.95“ ar „dešimt naudotojų“ kokybės slenksčio. Imtis, pakartojimai, priimtinos klaidos ir privalomi correctness/permissions/resource vartai priklauso konkrečiam suite bei darbo profiliui. Rekomendavimas ir alternatyvos vertinami pagal [MODULE-SELECTION](MODULE-SELECTION.md), ne vieną bendrą populiarumo balą.

## 4. Nesėkmės, neapibrėžtumas ir priežastys

Fiksuojama `succeeded/failed/partial/blocked/canceled/unknown` vykdymo baigtis ir atskira `passed/failed/not_run/inconclusive` patikra. Vartotojo nutraukta užduotis nėra automatiškai blogo repo įrodymas, o neįvykęs validator nėra PASS. Unknown/timeout ir nežinoma kaina lieka matomi.

Priežastis gali būti upstream komponentas, mūsų adapteris, pagrindinio modelio sugeneruotas kodas, duomenys, operatoriaus konfigūracija, provider outage ar išteklių stoka. Kol priežastis nepatvirtinta, jos nepriskiriame visam repo. Incidentas gali blokuoti konkretų profilį jo tiriamuose vartų rėmuose, nesuteikdamas universalaus „blogas įrankis“ verdikto.

Pozityvūs, neigiami ir neapibrėžti bandymai išlaikomi su aiškiu vardikliu. Apžvalga rodo, kas pateko į imtį, kokia dalis netikrinta ir kas buvo nutraukta. Dažni bandymai su lengvomis užduotimis nėra sąžiningas sudėtingų darbų kokybės palyginimas; retai naudojamas naujas kandidatas nėra automatiškai prastesnis.

## 5. Privatus darbas ir pasirinktas bendras indėlis

Vietinis įrodymų fiksavimas savaime nieko neišsiunčia. **Global quality sharing yra atskiras opt-in**, nepriklausomas nuo prisijungimo, atnaujinimų, donorystės ir leidimo siųsti kodo indėlį. Privataus projekto kodas, prompts, dokumentai, arguments/results, klientų duomenys, secrets, privatūs repo/module vardai ir vietiniai run IDs automatiškai neįkeliami.

Bendram registrui siunčiami tik peržiūrimos allowlist schemos viešo module/profile/pin faktai ir leistini agregatai pagal [USAGE-STATISTICS](USAGE-STATISTICS.md) aprėpties, retention ir smulkių segmentų taisykles. Viešas evidence digest gali nurodyti leistiną viešą testų ataskaitą; privataus dokumento hash taip pat gali būti atpažinimo signalas, todėl jo negalima laikyti automatiškai saugiu eksportuoti.

Jei verified sprendimui reikia neprieinamos privačios medžiagos, privatumo riba nemažinama: galima parengti atskirą leistiną sintetinį fixture ir atlikti trusted testą arba palikti statusą observed. Sutikimas dalytis statistika nesuteikia teisės publikuoti kodo ar keisti upstream repo; opt-in contribution turi savo grant ir peržiūrą.

## 6. Provenance, dubliai ir atsparumas išpūtimui

`client_reported`, `broker_observed`, `operator_trusted_eval` ir `upstream_ci` atskiriami. Atviro kliento signature, prisijungimas ar „AI patvirtino“ teiginys neįrodo realios užduoties teisingumo. Kliento sėkmė ir upstream CI yra signalai prioritetui bei reprodukcijai, o ne automatinis certified badge.

Dedup siejamas su loginiu bandymu, attempt, įrodymo tapatybe ir ataskaitos revision; retransmisija pakeičia leistiną projekciją arba ignoruojama, o ne vėl prideda sėkmę. Bendro upload replay/taisymo langas ir senos istorijos uždarymas taikomi pagal usage protokolą. Tas pats viešas CI artefaktas per kelis siuntėjus netampa keliais nepriklausomais bandymais.

Namespace/ingest limits, anomalijų patikra ir ribotas reprodukcijos biudžetas mažina Sybil bei šlamšto poveikį; neapsimetame įrodę „viena paskyra — vienas žmogus“. Votes, stars, usage ir donation nekeičia correctness vartų. Įtartini įrodymai gali būti karantinuoti su priežastimi; mažas populiarumas nėra priežastis ištrinti projekto darbą ar source istoriją.

## 7. Du indėlio keliai: upstream ir RepositoryZero

Naudotojo agentas gali ne tik pasirinkti repo, bet ir jį pagerinti: **darbo defektas → atkuriamas leistinas fixture → minimali pataisa ir nepriklausomi testai → pasirinktam contribution profiliui leistas PR → maintainer sprendimas → priimto naujo SHA patikra → atnaujintas kokybės įrodymas**. Tai planuojamas ciklas; išorinių PR šiame etape nekuriame.

Jei klaida yra originaliame komponente, pataisa siūloma originaliam upstream pagal jo contribution taisykles. Jei problema mūsų adapteryje, recipe ar katalogo fakto apraše, pasiūlymas teikiamas RepositoryZero. Agentas neturi slėpti vietinės integracijos klaidos po upstream kaltinimu ar vienu metu išsiųsti tą patį pasiūlymą į visus forks.

Naudotojas gali iš anksto pasirinkti contribution profilį, leidžiantį apibrėžtą rutiną: įprastiems source skaitymams ir testams nereikia kiekvieno atskiro patvirtinimo. Konkretus upstream PR/push reikalauja tam repo ir veiksmui galiojančio grant; GitHub login nėra bendras write leidimas. Naujas gavėjas, platesnės teisės ar privataus darbo publikavimas neįtraukiami vien dėl bendro profilio pasirinkimo.

Privatus kliento kodas, duomenys, prompts ir paslaptys automatiškai į PR nepatenka; reprodukcijai paruošiamas atskiras leistinas pavyzdys. Išlaikoma upstream ir pataisos autorių autorystė, licencijos bei notices. PR priėmimas priklauso originaliems maintainers; jų sprendimas neįjungia automatinio visų forks merge ir nekeičia jau vykstančio darbo pin.

Priimtas PR, agento „geras repo“ žyma ar padėka yra atskiri signalai. Naujasis SHA turi savo profilio testus; vien maintainer merge nėra viso repo verified. Kokybės ir rekomendavimo sprendimai nepriklauso nuo badge priėmimo, reklamos, donorystės ar sutikimo viešai girti RepositoryZero.

## 8. Naujos versijos ir įrodymų galiojimas

Naujas upstream SHA, adapteris, model/config, reikšminga OS/dependency ar suite/policy versija nepaveldi PASS be dokumentuoto suderinamumo ir reikiamų naujų patikrų. Ankstesni duomenys lieka istorija apie ankstesnę kombinaciją. Cached rekomendacijos tikrinamos pagal evidence ir registry snapshot versijas; stale/unknown parodomas žmogui.

Regresija, pažeidžiama licencija, supply-chain incidentas ar patikimumo atšaukimas gali sumažinti ar panaikinti statusą konkrečiam scope. Nauji darbai taiko aktualų sprendimą; pinned darbų saugi būsena tvarkoma pagal revocation ir external-effect lifecycle, ne aklu pakartojimu ar privačių duomenų ištrynimu. Revoked leidimas negrąžinamas kaip „paskutinis geras“ vien dėl seno populiarumo.

## 9. Įgyvendinimo ir priėmimo seka

- [ ] Vietinis recorder susieja tikrus execution/test/budget faktus su exact pin/profile; restart, retry ir unknown neduoda fiktyvaus PASS.
- [ ] Versijuotas trusted evaluator ir rankinės peržiūros kelias patikrina vieną konkretų profilį; source-only/observed/verified/recommended UI aiškiai skiriasi.
- [ ] Nepatikimas kliento PASS, praleistas validator, stale generation, changed SHA ir autoriaus pakeistas gate negali suteikti verified.
- [ ] Opt-in payload preview, private/secret canary, dedup/replay/revision, retention ir riboto ingest patikra prieš bendrą rinkimą.
- [ ] Upstream ir mūsų adapterio pataisa nukreipiamos teisingai; contribution grant, private canary ir maintainer/new-SHA ribos tikrinamos prieš bet kokį išorinį PR.
- [ ] Tik vėliau — centrinė projekcija ir svetainė su provenance, vardikliais, unknown/failure, palyginimo scope ir aktualiu revocation.

Šis planas įgyvendina automatiškai kaupiamų naudojimo įrodymų idėją. Jis nežada, kad vien žmonių naudojimas patvirtins kiekvieną repo ar kad bendras kokybės katalogas jau veikia.

## 10. Bendras tobulėjimas dideliu mastu

Daug naudotojų suteiktų daugiau užduočių įvairovės, aplinkų ir tikrų regresijų pavyzdžių. Pasikartojantys radiniai jungiami pagal canonical repo/pin, problemą ir atkūrimo įrodymus: vienas bendras pataisos darbas gali padėti daugeliui. Tas pats defektas neturi sukurti tūkstančių vienodų mokamų analizių ar PR; naudotojai gali sekti bendrą būseną ir išbandyti naują kandidatą savo leistiname profilyje.

Numatyta darbų paskirstymo kryptis — vietiniai naudotojų vykdymai ir leidžiami faktų paketai, riboti agregatai, dedup/cache ir finansuojamos trusted reprodukcijos eilės. Daug ataskaitų savaime netampa didesniu centriniu modelių biudžetu ar trusted patikros pajėgumu. Vieno VPS pradinis profilis nėra įrodymas apie milijono naudotojų throughput; paslaugų atskyrimas, storage/ingest ribos ir horizontali plėtra parenkami pagal realius matavimus.

Tai bendros žinių, receptų, pataisų ir patikrų bazės augimas. Modelių svoriai nuo paprasto naudojimo savaime nepasikeičia. Agentų PR kilmė ir vieno patikimo publisher vaidmuo aprašyti [oficialios tapatybės specifikacijoje](AGENT-IDENTITY.md).
