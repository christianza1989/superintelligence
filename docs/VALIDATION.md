# Vertinimas, licencijos, kaina ir įrodymų kartelė

> **Planuojama produkto specifikacija · peržiūrėta 2026-10-17.** Aprašo siekiamą elgesį; schemų pavyzdžiai ir maketai savaime nėra įgyvendintos funkcijos. Daliniai foundation komponentai nekeičia viso vartų statuso. Datuotos įgyvendinimo pastabos žemiau nėra atnaujinta būsenos suvestinė; senos kainų/auth/source prielaidos tikrinamos prieš realų profilį. Dabarties autoritetas: [būsena](IMPLEMENTATION.md), [priimta architektūra](DECISIONS.md), [roadmapas](../ROADMAP.md).

## Kas atlikta šiame darbe

Patikrintas viešas GitHub turinys, source failai, licencijos, pasirinkti manifestai/CI įėjimai ir svarbiausių komponentų public API kodas. Parengti dokumentai, JSON/CSV duomenys ir draft schemas. Tai nesuteikia runtime, saugumo ar našumo PASS. Tiksli statistika [research-run.json](../catalog/research-run.json).

## 100 balų sistema ir neįvertintos dalys

| Sritis | Maksimumas | Dabartinio įvertinimo ribos |
|---|---|---|
| Praktinis gebėjimas ir rezultato kokybė |20| Iki10 dokumentiniam užduoties fit,10 empiriniam rezultatui visiems neįvertinta ir neįskaityta |
| Integracijos tinkamumas |15| API/CLI/library tinkamumo architektūrai išvada; neįrodyta adapterio veikla |
| Branda, priežiūra ir testai |15| Skaityti failai ir CI tekstas; naujausias CI, releases ir issues reagavimo auditas nebaigtas |
| Licencijos tinkamumas |10| Šaltinio tekstas, copyleft/enterprise ribos ir dar reikalinga platinimo peržiūra |
| Vykdymo kaina ir savarankiškumas |10| Vietinio/external modelio galimybės išvada, tikros kainos nežinomos |
| Greitis ir resursai |10| Profilio inžinerinis rezervas, ne benchmark |
| Izoliavimas, leidimai ir patikimumas |10| Konservatyvi architektūros hipotezė; saugumo testai nevyko |
| Papildoma vertė ir dubliavimas |10| Konkretaus gebėjimo bei alternatyvų portfelio įvertinimas |

Balai yra preliminarūs dokumentinio fit rodikliai. Kataloge įrašyta kiekviena dalis ir jos priežastis. Kad vertinimas būtų atkuriamai skaidrus, naudojome stambias pakopas: dokumentinis fit9/8/6 pagal pradinio produkto naudą/eksperimentinį statusą; integracija14/11/7 pagal mažą/vidutinį/didelį sudėtingumą; branda12/10/8 pagal skaitytą CI ir testų struktūrą; licencija10/7/5 pagal preliminarų permissive/copyleft/mixed scope. Likusios dalys yra konservatyvios profilio išvados, aprašytos JSON. Tai nėra statistinis modelis ir kelių balų skirtumas neturėtų spręsti galutinio diegimo. Empirinės kokybės neįvertinimas nėra nesėkmingas testas.

Registry būsenos `verified` ir `recommended` taikomos konkrečiam **modulio leidimas + upstream/package pin + platforma + įrodymų rinkinys**, o ne visam projektui amžinai. Šiuo metu visi100 įrašų yra `candidate`.

## Rezultato matavimo protokolas

Kiekviena eval užduotis turi input/fixture digest, sėkmės kriterijus, validator/grader versiją, leidžiamus įrankius, modelio/version/config, seed kur įmanoma, biudžetą, deadline ir eksperimentinį profilį. Grader kodo ir slaptų etalonų nekontroliuoja vertinamo agento PR.

Matuojame užduoties sėkmę pagal tikslinę būseną, rezultatų kokybę pagal iš anksto paskelbtą rubricą, p50/p95 trukmę, faktines išlaidas, peak RSS/VRAM, diską/cache, tool-call ir retry skaičių, žmogaus minutes/patvirtinimus, nesėkmių tipus ir privatumo/leidimų pažeidimus. Refusal/blocked/out-of-budget/partial/failure yra skirtingos būsenos; vardiklio negalima mažinti išmetant failures.

30 kūrimo užduočių ir24/30 bei7/10 per sritį yra **provisional produkto vartai**. Jie nėra nepriklausomas pranašumo įrodymas: kūrėjai rinkinį jau mato, imtis maža ir nebūtinai reprezentatyvi. Prieš viešą lyginimą reikės atskirai prižiūrimo holdout, fiksuotos imties ir statistikų. Jei užduotys būtų reprezentatyvios nepriklausomos Bernoulli imtys,24/30 sėkmės95% Wilson intervalas apytikriai62.7–90.5%; realaus vartotojo pasiskirstymo tokia prielaida savaime nepatvirtinama.

Viešas palyginimas turi du atskirus pjūvius: (1) agento vykdymo strategija su vienodais modeliais, įrankiais ir biudžetais; (2) visas produktas su jo numatytomis galimybėmis ir pilna kaina. Rakazo/OpenClaw/Hermes/OpenHands gali būti produkto baselines, bet skirtingas modelis ar turimų integracijų skaičius nepaverčia rezultato mūsų branduolio pranašumu. Skelbti visas konfigūracijas, atsitiktinę užduočių tvarką, pakartojimų skaičių, paired rezultatus ir neapibrėžtumą. Model-based graders tik papildo deterministines būsenos patikras ir žmogaus blind review.

## Gedimų ir nepatikimo turinio rinkinys

Privalomi atvejai: scheduler/worker žūtis prieš ir po commit, UI disconnect, stale fence, expiry, vieno rašytojo konkurencija, external timeout po galimo effect,429/5xx, disk-full, RAM/CPU cap, cancellation, backup restore, symlink/path traversal, netinkamo projekto ArtifactRef, malicious HTML/PDF/tool output, PR bandymas keisti acceptance politiką, secret canary išsaugojimas ir update regresija. Report turi įvykių seką ir įrodomą expected/factual rezultatą. Viešo atakų rinkinio praeinamumas nėra visų atakų nebuvimo įrodymas.

Hostile shell, svetimas PR ir vykdomi binarai reikalauja atskiros išmetamos VM/microVM lane. Vietinė trusted-code container aplinka yra apribota darbo riba su kita deklaruota grėsmių prielaida. Docker socket neperduodamas modeliui. gVisor/nsjail/bubblewrap papildomos priemonės vertinamos pagal tikrą host ir workload.

## Licencijų ir platinimo suvestinė

| Tipas / pavyzdys | Sprendimas |
|---|---|
| MIT, Apache-2.0, BSD, PostgreSQL | Išlaikyti tekstus, notices, copyright ir patent/NOTICE sąlygas, peržiūrėti transityvines priklausomybes |
| GPL / AGPL / LGPL / MPL | Atvira licencija su konkrečiomis prievolėmis; peržiūrėti linking/modification/distribution/network scope. Atskiras servisas nėra bendras teisinis atleidimas |
| Docling, Diffusers, ComfyUI, Whisper/Piper, LLM servers | Kodo licencija atskira nuo weights, balsų, duomenų, assets ir modelių naudojimo sąlygų |
| Activepieces / LiteLLM / Langfuse | Core ir enterprise paths licencijuojami atskirai; nerašyti „visas repo MIT“ |
| n8n | Sustainable Use ir enterprise scope; source-available ribos netinka besąlygiškam mūsų open-source core perėmimui |
| AutoGPT | `autogpt_platform/` Polyform Shield, kiti katalogai MIT pagal skaitytą root LICENSE; tai mišrus scope |
| Open WebUI / tldraw / Remotion | Individualios branding/production/company sąlygos; jų nelaikome bendru permissive pasirinkimu |
| billion-context | Perskaitytame LICENSE yra MIT tekstas ir papildomas product-attribution term; vien MIT badge nepakanka |
| Inbox Zero | Root AGPL tekstas turi papildomas komercinio monetizavimo ir enterprise sąlygas; reference-only/licence-blocked, užTOP100ribų |
| Rakazo | Root Apache-2.0 patikrinta; SaaS connector ir provider terms atskiri; Treg hosted resale pagal README turi papildomas sąlygas |
| FFmpeg | Tikra licencija priklauso nuo build flags, codecs ir prijungtų komponentų; skelbti naudojamo binary konfigūraciją |

Upstream šaltinių nuorodos pateiktos [kataloge](quarantine/2026-10-17/docs/research/TOP100.md.snapshot.txt) ir [atrankos paaiškinime](quarantine/2026-10-17/docs/research/README.md.snapshot.txt). Nuosavo core Apache-2.0 siūlymas nesuteikia teisės perlicencijuoti upstream. Nežinoma teisė blokuoja platinimą, o ne užpildoma spėjimu.

## Pilna kaina ir dydis

Kainos ataskaita skiria vienkartinį setup, faktinę užduoties model/API/compute/storage/egress kainą, idle services ir operatoriaus laiką. Rate card turi šaltinį ir datą; nepatvirtintas tarifas yra null. Budget broker rezervuoja pasirinktą cap iki veiksmo, įrašo faktą po jo ir neišlaisvina neaiškaus effect rezervo iki reconciliacijos.

Dydžio metodas: švaraus host baseline → pinned install → pirmas paleidimas → pasirinktos užduoties pikas → nusistovėjęs dydis → update su dviem versijomis → uninstall/GC. Matuojami necompressed ir distribution bytes, Docker runtime/images, modeliai, cache, temp ir user artifacts. Baitai išskaidomi pagal shared/exclusive; darbinės aplinkos nemaskuojamos kaip „jau buvo host“.100 MB =100000000B ir2 GB =2000000000B. Bazė neapima pasirenkamų modulių, bet jų tikras papildomas kaštas rodomas prieš įdiegimą.

## Kada galima teigti pagerėjimą

Pataisa parengta ≠ testai praėjo ≠ priimta ≠ išleista ≠ įdiegta ≠ pagerėjimas patvirtintas naudojant. Pagerėjimui reikia užfiksuoto baseline, trusted holdout, before/after rezultatų, neblogėjančių apsauginių metrikų ir faktinės canary stebėsenos. PR ar pakeistų eilučių skaičius negali pakeisti šių rodiklių.

SAI leidimo patikra naudoja trusted base policy/suite SHA ir patikrintą evaluator image digest, apribotą identity ir atskirą maintainer sprendimą. Pasiūlymo autorius negali pats pakeisti gate ar suteikti savo PR patikimumo. Release parašas patvirtina kilmę, ne kodo teisingumą. TUF/Cosign, key rotation, revocation, saugus rollback ir duomenų migracijų planas sudaro atskirą release darbo paketą.

## 0.2 papildyti priėmimo rinkiniai

Pradinių100 balai išsaugoti istorinei dokumentinei imčiai. [Naujame baseine](quarantine/2026-10-17/docs/research/CANDIDATE-POOL.md.snapshot.txt) nėra dirbtinai priskirtų balų: expanded unscored kandidatai laukia capability/license/overlap ir realių užduočių atrankos. Visi runtime NOT_RUN. Nauji README/license source hash nėra nauji benchmark rezultatai.

| Sritis | Būtinas teigiamas ir neigiamas įrodymas |
|---|---|
| Auto PR / admission | Leidžiamas patch pereina iki release; policy/deps/permissions bypass, stale HEAD/base ir nepatikimas evaluator report atmetami; nuo autoriaus atskiras trusted context |
| VPS / centras | Patvarūs jobs/budgets/leases po restart ir off-host restore; klientas išjungtas, centro discovery tęsiasi; cento outage nepažeidžia vietinių grants; svetimas build negali gauti VPS/release paslapčių |
| Upstream | Suderinamas bump ir adapterio pataisa palyginti su baseline; breaking/license/permission/hooks/security pakeitimas izoliuotas; forks ir hosted API drift tikrinami atskirai |
| Update / recovery | Tikras signed install/update su nepasikraunančia nauja app, independent supervisor recovery, disk/power-loss/metadata/keys/revocation matrica ir naujų user duomenų išsaugojimas; kiekvienai OS atskirai |
| Auth / modeliai | API key ir konkretus oficialus OAuth atskirai; refresh/expiry/logout vs revoke, account mix-up ir leakage canary, capability ir usage/cost šaltinis, failover be duomenų ar effect kontrolės apėjimo |
| Treg | Faktinis datuotas katalogas ir auth/terms, selected tool schemas, read-only scenarijus; forbidden write, schema drift, revoked token, caps ir timeout; gateway tool skaičius atskirtas nuo endpointų skaičiaus |
| Speech / media | Vienodi LT/EN corpora ir scenos, blind žmogaus kokybė + domeno metrikos, latency/resursai/kaina, weights/voice/assets teisės; modelio/UI/SDK/skill kategorijos atskirtos |
| Oficiali svetainė / donate | Public facts ir reali parengtis, source/status/privacy checks, secretless build/separate publish, donation-link protection ir verified finansiniai agregatai; jokių privačių instaliacijų išvadų be consent telemetry |
| Usage / katalogas | Vietiniai counters sutampa su execution ledger; replay/offline/retry nedvigubina calls, opted-in ingest neperduoda private canary, public registry/site/export visi moduliai atitinka; counts ir p50/p95 turi vardiklį/metodą |
| Dubliai / alternatyvos | Alias tapatybė ir funkcinis overlap atskirti; cheaper/CPU/LT/fallback, dominated ir inconclusive atvejai vertinami konkrečiam profiliui; hard gates pirmiau, tuning/compute/corpus kontroliuojami, daugkartinis lyginimas ir holdout, default/grants/pins/revocation ribos išlaikytos |
| Growth / outreach | Realūs evidence/claim ir badge scope, maintainer confirmation atskirai, gavėjo/channel policy ir suppression prieš dispatch, dedup/race/unknown-send/reply-backlog stop, no fake endorsement/creator relationship, private canary ir biudžetai; realios siuntos šiame darbe netestuotos |
| GitHub portal | Stable ID/session/minimal scopes, own/org/community tapatybė ir rename/rolechange, submit≠integrated, private/write/grants atskirai, repo dedup ir nepatikimo source/no-secret riba |
| Video Hub / vote | Metadata-only ne visas video, relevance≠positive sentiment, channel ownership atskirai, stale moderation generation/CAS, canonical IDs/SSRF/embed, idempotent upvote+undo/revision ir immutable window, reports/recheck/outage/privacy |
| Didelis intake / tokenai |100/1000/2000syntheticURL, no-LLM pirmos pakopos, atominių global+lane attempts/$/token/concurrency rezervų lenktynės, transparent retries/unknown billing, quota/cache coverage, fair boundedqueue ir overflow/deferred; nepriskirti load PASS kol tikras bandymas neatliktas |
| Directory / tools / skills | Domain/capability/recipe/multi-tag nedvigubina modulių, LT/EN query fixture su workload truth ir recall@k/missing, hard filters/schema/permissions/pins prieš invoke, draft/nested skills neapeina cap; normal search be paid LLM |
| Laya/Jev selector | Patvirtintas checkpoint/SDK ir terms, baseline palyginimas su actual CPU/LT/EN/context/accuracy/abstention/latency/resources, confidence ne grant, list-enum/missing recheck, hidden retry/paidcap ir gateway enforcement; source-compatible ne savaime runtime-compatible |
| Lokalizacija |8locale pagrindinių UI keys/srautų, Unicode/Cyrillic/CJK/plural/escaping/formatavimo/fallback, EN/RU docs ir kitų aprėpties testai; UI vertimas neįrodo modelio/STT/TTS kalbų palaikymo |

G3C ir G3D yra ankstyvi vartai iki localhost beta. P7 platesnės autonomijos šimto pakeitimų analizė nebeužlaiko siauro profilio piloto. Testų ribos išlieka aiškios; vienas sėkmingas pilotas nesuteikia leidimo visoms pakeitimų kategorijoms.
