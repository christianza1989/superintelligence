# Daug nuorodų, ribotas AI biudžetas

Plano 0.2 papildymas, 2026-10-16. Reikalavimas:100,1000ar2000pateiktų repo/video nuorodų per dieną neturi automatiškai sukelti tiek pat mokamų AI analizių. **Tai projektuojama eiga, NOT_RUN.** Ji papildo [repo portalą](CONTRIBUTOR-PORTAL.md), [Video Hub](VIDEO-HUB.md) ir bendrą [autonomijos grafiką](AUTONOMY-AND-UPDATES.md#4-konkreti-darbo-politika-ir-periodiškumas).

## 1. Kaskada: pirma taisyklės ir cache, tik tada modelis

| Pakopa | Kas vyksta | LLM kvietimai |
|---|---|---|
|0. Ingress | Session/auth, schema/byte/rate/global limits, leistinas GitHub/YouTube URL formatas, account/pending cap; jokio source vykdymo |0|
|1. Kanonizacija ir esama būsena | Canonical repo/video ID, alias, esamos paraiškos/evaluation/cache, anksčiau atmestos/nepasikeitusios versijos |0|
|2. Ribotas public metadata | Tik naujiems pagal eilę: oficialaus šaltinio būtiniausi duomenys, public/prieinamumas, README/license/title/description laukai kiek leidžiama, freshness |0|
|3. Deterministinis triage | Pateikėjo struktūrinė užduotis/delta/kalba/kategorija, privalomi laukai, konkretus neleistinas scope, known identity/dubliai; susijusių įrašų tekstinė paieška |0|
|4. Ribota semantinė atranka | Modeliui tik prioritetiniai ir pakankamai parengti kandidatai, su vieno kvietimo bei bendru cap; rezultatui aiški matytos medžiagos riba |Pagal bendrą kvotą|
|5. Adapteris / gilūs testai | Tik gavus tikslinį rezervą: isolated build, licencijų ir kontrakto peržiūra, domain/resource testai ir acceptance |Atskiras baigtinis biudžetas|

Pakopos0–3 nekviečia LLM net „trumpai santraukai“ ar duomenų parsavimui. Parsavimas, teksto limitai ir reitingavimas gali būti deterministiniai. CPU, DB, network ir oficialaus API quota vis tiek kainuoja resursus; „be tokenų“ nereiškia neribotos ar nemokamos infrastruktūros. Mokamas metadata/enrichment provideris taip pat eina per pinigų rezervą.

URL nėra komanda. GitHub/YouTube allowlist → patikrintas ID → fiksuotas official endpoint; jokio savavališko vidinio tinklo fetch, automatinio clone/build/npx ar pateikėjo kodo pagrindiniame VPS. Request handler tik priima ribotą paraišką; provider fetch/evaluation nėra sinchroninis privalomas kiekvieno submit veiksmas.

## 2. Tikslios priežastys ir silpni signalai

Blogas URL, neleistinas host, per didelis payload, login/pending/rate limit ar patvirtintas identiškas įrašas gali būti išspręsti taisykle. Dublikatas susiejamas su esamu kandidatu; nereikia antro modelio kvietimo. Šaltinio neprieinamumas, API quota ar neužpildytas laukas reiškia atidėjimą / papildymą, ne „repo blogas“.

Mažai stars, naujas repo, trumpas README, nenurodyta licencija ar neįprasta programavimo kalba nėra universalus automatinis silpnumo įrodymas. Trūkstama teisė blokuoja platinimą ir gali grąžinti konkrečią papildymo užduotį; modelis jos neatspėja. Archived/unmaintained signalai įeina į priežiūros klausimą ir alternatyvų vertinimą, bet nėra aklas visų naudingų įrankių trynimas.

Video keywords/description tik pakanka taisyklių kandidatui parinkti; jie neįrodo viso turinio tinkamumo. Repo deklaruotas gebėjimas neįrodo teisingumo. Ankstyvas filtras taupo resursus, o ne sukuria nematuotą verified statusą. Aiškūs standartinio profilio sprendimai gali būti deterministiniai, neaiškūs lieka review / queued; AI nėra būtinas kiekvienos eilutės arbitras.

Pateikimo forma pati surenka vieną užduotį, skirtumą nuo esamų sprendimų, teisių/testo/šaltinio nuorodas. Tai sumažina poreikį agentui brangiai „išgalvoti, kam šis repo galėtų tikti“. Modeliui perduodama tik pagal profilį reikalinga medžiaga, su source ir truncation žyma. Nukirptas LICENSE nėra pilnas teisinis auditas; gili patikra reikalauja tikro pilno šaltinio, kai to reikia sprendimui.

## 3. Vienas planuojamas pilotinis profilis

Tai siūlomi **globalūs centro limitai**, ne skaičiai vienam naudotojui, worker ar transportui. Juos galima keisti tik operatoriaus politika ir realiu biudžetu; vien klientų skaičius jų nepadidina.

| Resursas | Pradinis cap / taisyklė |
|---|---|
| User submit | Iki2 naujų paraiškų/account per24h ir2pending; repo+video bendras submit limitas, ne po atskirą apeinamą kvotą |
| Metadata discovery/intake | Iki100 naujų kanoninių objektų public metadata patikrų per24h, padalijant discovery, repo ir video darbams; refresh/security turi paskirtą atskirą rezervą, ne unlimited išimtį |
| Gilesnė source peržiūra | Iki10 pagal ankstesnį bendrą source profilį per24h; source skaitymas savaime nereiškia10LLMkvietimų |
| AI triage | **Iki10 LLM kvietimų per24h bendrai repo+video intake**, įskaitant klasifikacijos repair/retry; gali būti0, jei nepakanka pinigų ar trūksta duomenų |
| Vieno AI kvietimo riba | Operatorius parenka modelį, input/output/reasoning kur taikoma, timeout ir worst-case kainos rezervą; nežinoma billing semantika nepaleidžia neriboto kvietimo |
| Gilus adapterio darbas | Iki1 naujo adapterio darbo per24h pagal ankstesnį profilį ir atskirą model/compute/VM cap; failed bandymai ir sustabdymas išlieka ledger |
| Aktyvi intake eilė | Ribotas pending objektų ir bendrų bytes skaičius pagal operatoriaus profilį; prieš leidžiant naują užduotį vertinti gebėjimą ją aptarnauti ir backlog amžių |
| Viso centro pinigai | Daily/monthly cap apima intake, coding, media/modelius, metadata API, marketingo draft ir kitus mokamus vykdymus; atskiri lane rezervai negali viršyti global cap |
| Default mokamas profilis |0 išorinių mokamų kvietimų, kol nėra operatoriaus pasirinkto account/model/rate šaltinio ir baigtinio cap; deterministic/source-only portalas gali veikti ir be jų |

10kvietimų reiškia ne10užduočių, o **ne daugiau kaip10faktinių modelio dispatch attempts**. Įskaičiuojami SDK transparent retries, repair, naudojami mokami reranker/embedding/summarizer kvietimai; jų negalima paslėpti vieno triage job viduje. SDK retry išjungiamas arba kiekvienam bandymui reikalaujamas brokerio leidimas. Tai nėra10garantuotų gilių analizių ar finansinė suma. Modelio perjungimas kvotos neatkuria. Kitų rolės call/token/$ pool turi baigtinius limitus ir bendrą centro viršutinę ribą. Lokalus modelis gali būti alternatyvus pasirenkamas profilis, bet jo CPU/RAM/GPU/elektra ir throughput taip pat ribojami. Visų agentų grupė neturi „nemokamo“ neapskaitomo modelio kelio.

**Galutinis MVP pasirinkimas:** naudotojo Jev/OpenRouter key su baigtiniu interaktyvaus routing cap yra atskiras profilis. Jo buvimas neįjungia viešo masinio repo/video intake: pradinis šio lane paid cap0 pagal finansavimo sąlygą. Bendro account finansinis rezervas apima visus leistus profilius; neautorizuotas submission job negali panaudoti interaktyviam darbui skirto credential/budget vien todėl, kad serveris turi raktą.

## 4. Atominis biudžetas, ne vien instrukcija modeliui

Prieš provider call patikimas brokeris atominiu DB sandoriu rezervuoja globalų ir lane/candidate pinigų, call-count, token/compute bei concurrency rezervą, su unikaliu invocation ID, tikrina lease/fence ir sprendimo aktualumą. Tik tada išduodamas vykdymo leidimas. Keli workeriai negali vienu metu perskaityti „liko1“ ir visi jį išleisti. Modelio teksto pažadas „naudosiu mažai“ nėra kontrolė.

Provider retries, rate limits, repairs ir atsakymai su usage dalimi įrašomi pagal jų faktinę semantiką. Po timeout galimai apmokestintas kvietimas lieka uncertain ir potencialiai išleistas iki patikimos reconciliacijos; jo rezervo neatlaisviname vien dėl to, kad procesas restartavo. Unknown tarifas / kaina blokuoja mokamą naują darbą arba reikalauja iš anksto parinkto konservatyvaus cap, o ne price=0.

Serverio cap taikomas ir išoriniams CI/VM/GPU jobs, paid metadata ir pakartotiniams LLM santraukų/translation/classification kvietimams. Alert/circuit breaker suveikia dar prieš limitą pagal rezervus, ne tik kitą dieną gavus sąskaitą. Dienos apibrėžimas yra viena operatoriaus policy laiko juosta arba rolling24h su patvariu ledger; workerio vietinis laikrodis jos neatkuria. Rodomi spent/reserved/uncertain/remaining ir iš kur gauti rates.

## 5. Eilė, teisingas prioritetas ir perteklius

Prioritetas: ankstesnio patvirtinto modulio kritinis gedimas/security → paskirtas interaktyvus naudotojo darbas → pagal rezervus intake/augimas. Šios eilės turi savo limitus ir fair share, kad discovery ar vienas creator neišstumtų viso produkto. Critical žyma iš submitter teksto automatiškai nesuteikia aukštesnio rezervo; signalą turi patvirtinti trusted taisyklė.

Tarp naujų kandidatų vertinti pasirengimą, aiškią spragą/delta, naudotojų tikrą poreikį ir senėjimą, su per-account/organization/category fair share. Paskirti mažą fiksuotą discovery rezervo dalį mažiau populiariems/atsitiktinai parinktiems tinkamiems kandidatams, kad stars ir pirmas atėjimas neužrakintų portfelio. Tikslus svoris ir exploration dalis operatoriaus versijuotoje politikoje; balsai ar reklaminis aktyvumas nėra trust gate.

**Jei ateina2000naujų objektų kasdien, o metadata aptarnaujame100, vien eilė problemos neišsprendžia:** neaptarnautų daugėtų1900perdieną. Todėl intake admission turi aktyvios eilės/bytes/amžiaus ribą ir atsakymą `deferred_capacity` / „šiuo metu nepriimama į vertinimo eilę“. Galima išlaikyti mažą source-only pasiūlymo įrašą ar leisti išsaugoti savo draft pagal bendrą storage cap, bet ne žadėti gilią analizę ir ne neribotai kaupti visą payload.

Didinti mastelį galima pakeliant **matuotą** API/worker/finansinį pajėgumą, priimant geriau parengtus contributor įrodymų paketus arba didinant deterministiškai išsprendžiamą dalį. Svetimo pateikti testų „PASS“ nėra trusted acceptance ir jų artefaktai neįvykdomi su paslaptimis. Katalogas be skaičiaus lubų yra ilgalaikio discovery principas; jis nėra neribotos aktyvios eilės ar storage įsipareigojimas.

UI aiškiai skiria received/source-only, queued-for-funded-evaluation, blocked-budget, deferred-capacity, needs-information ir final sprendimą. Rodoma queue/coverage ir paskutinė patikra; ETA tik kai yra pagrįsta prognozė. Nėra klaidinančio „analizuojama“, jei agentas tam dar neskirtas.

## 6. Cache ir bendras darbas

Repo source/eval cache raktas apima kanoninę tapatybę, SHA/package pins, capability/profile, model/config/hardware/grant ir suite/policy versijas pagal patikros apimtį. Video cache turi ID, metadata snapshot/revision, review basis ir moderation policy/generation. Vienai kombinacijai viena aktyvi darbo rezervacija; pakartotinis submit prenumeruoja būseną, ne sukuria10naujų jobs.

Funkcinis panašumas su kitu repo yra signalas palyginimui, ne įrodymas, kad galima perimti jo PASS. Neigiamo/unknown cache TTL ir recheck pagal pasikeitusius šaltinius neleidžia amžinai atmesti naujos geros versijos. GitHub rename, transfer ir pasikeitusi ownership/license turi patikrintą invalidation. Po hidden/rejected/revoked/report/edit senas lėtas evaluation negali vėl įjungti objekto: CAS tikrina dabartinę objekto/policy/generation kombinaciją.

Cache metaduomenys ir trumpas source excerpt turi bytes/TTL cap; cache rakte/status yra retrieval coverage ir evidence status. API quota/backoff išlaikomi per restart. Neužbaigtas/403 fetch ar truncated šaltinis netampa pilnu verified. Per-host request/concurrency/bytes/time ir redirect/archive limits neleidžia naujai source patikrai tapti zip-bomb ar egress apeiga. Recheck/security/status darbai turi atskirus baigtinius rezervus; priešingu atveju populiarus katalogas vien refresh galėtų sunaudoti visus100new-candidate slotų arba apeiti visą cap.

## 7. Apkrovos ir priėmimo vartai

- [ ] 100/1000/2000 submissions fixtures su dubliais/rate/invalid URL patikrina, kad pakopos0–3 nesukuria nė vieno LLM kvietimo; pradiniam bandymui fake provider ir sintetinis source, ne mokamas API.
- [ ] Naujas unikalus valid kandidatas negauna automatinio modelio slot vien dėl submit; pasiekus10global triage calls/finansinį cap likę queued/blocked, nepriklausomai nuo worker skaičiaus.
- [ ] Concurrent reservation, repair/retry/provider timeout, restart/dienos riba ir nepranešta kaina neviršija užfiksuotų count/reserved-spend cap; uncertain neatgauna nemokamo rezervo.
- [ ] Metadata request/bytes/TTL/API quota ir active queue/storage/pending admission ribos veikia; pasikartojanti2000/day apkrova nesukuria neriboto backlog pažado.
- [ ] Dubliuotas repo/video ir suderinamas cache dirba be antro eval; SHA/policy/generation pasikeitimas bei stale-result CAS teisingi.
- [ ] Mažas/new/no-stars kandidatas nepašalinamas vien dėl populiarumo; priority/fairness/exploration ir age-out/defer priežastys matomos.
- [ ] Vieša našumo/cost ataskaita rodo faktinius metadata/model/build kiekius, spend/uncertain ir coverage; nėra sugalvoto „AI išanalizavo visus2000“.

Šios ribos yra realaus brokerio, queue ir fault testų reikalavimai, ne modelio prompt instrukcijų pakaitalas. P0 budget ADR ir P1Q intake infrastruktūra pirmiau už plačią auto atranką. Visi runtime/load bandymai dabar **NOT_RUN**.
