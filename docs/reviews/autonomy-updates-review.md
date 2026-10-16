# Autonomijos, modulių priėmimo ir atnaujinimų kritinė specifikacija

Data: **2026-10-16, Europe/Kiev**. Būsena: **architektūros pasiūlymas, NOT_RUN**. Antras agentas rengė nepriklausomą siūlymą ir apsikeitė kritika su pagrindiniu agentu. Tai nėra išorinis saugumo auditas. Nekurti PR, neįdiegti paketai, nekeisti OS nustatymai, nepaleisti kandidatai ir neužsakyti paslaugų.

**PATIKRINTA ŠALTINYJE** reiškia perskaitytą oficialų tekstą arba kodą. **SIŪLOMAS SPRENDIMAS** reiškia mūsų dar neįgyvendintą politiką. **AUTORIŲ TEIGINYS** nėra mūsų bandymo rezultatas. Toliau visi produkto scenarijai ir gate rezultatai **NOT_RUN**.

## 1. Išvada: autonomija su dviem atskiromis vykdymo plokštumomis

**SIŪLOMAS SPRENDIMAS.** Lokalų produktą valdo nedidelis launcher/supervisor ir viena pasirinkta API/UI bazė. Bendro projekto PR, registry ir leidimų eigą vykdo centrinė CI/coordinator infrastruktūra. Išjungtas naudotojo kompiuteris nestabdo centrinio merge/release ir pats nieko globaliai nesujungia.

Rakazo pirmiausia vertinamas kaip ADAPT/FORK bazė; pasirinkus jį pernaudojami jo Electron klientas, Hono/Pi/Postgres ir provider sluoksniai. Python bazė lieka P0.0 alternatyva. Desktop paketas nėra leidimas sukurti antrą konkuruojantį scheduler ar neįrodytą stack migraciją.

Siauras automatinio review/merge/release kelias atsiranda **prieš pirmą stable**, po konkretaus piloto patikrų. Jo neatidedame iki 100 modulių. Platesnė autonomija plečiama pagal įrodytas pakeitimų kategorijas, ne pagal kalendorių, repo populiarumą ar įrankių skaičių.

## 2. Lokalios instaliacijos ribos ir gyvavimo laikas

- Launcher paleidžia vieną API/UI instanciją loopback adresu, patikrina atitinkamą instancijos identity ir saugo nuo antro atsitiktinio scheduler paleidimo. CORS, origin/CSRF, session ir local IPC teisės galioja ir localhost režimu; loopback savaime nėra autentifikavimas.
- Naršyklė arba desktop langas yra klientas. Langą uždarius užduotys tęsiasi, jei pasirinktas background režimas; atskiras veiksmas „Sustabdyti runtime“ uždaro scheduler ir workerius saugiai. Jei įdiegtas tik foreground profilis, prieš uždarymą aiškiai parodoma jo pasekmė.
- OS autostart yra atskiras vienkartinis pasirinkimas. Jo neįjungiame vien todėl, kad įjungtas automatinis app naujinimas. Be autostart periodiniai vietiniai darbai veikia tik paleidus runtime.
- Po sleep/restart atkuriami DB, queue, task pin, biudžeto rezervai, effects ir leases. Pasibaigęs lease nėra pakankama teisė kartoti išorinį veiksmą, kurio baigtis nežinoma.
- Praleisti cron darbai turi `coalesce`, `skip` arba apribotą `catch_up` politiką ir stabilius occurrence ID. PC įjungimas negali sukelti šimtų pasenusių veiksmų, PR ar API mokesčių pliūpsnio.
- Private workspace, asmeniniai dokumentai ir naudotojo kodas niekada netampa viešu submission automatiškai. Vietinis privatus adapteris gali likti private namespace be publikavimo.
- `stable` naujinimai numatyti įjungti, su pause ir manual pasirinkimu; `preview` – aiškus opt-in. Įmokos, nauji secrets, platesni leidimai ir OS admin teisės iš šio nustatymo nepaveldimos.

## 3. Centrinis contribution ir release vykdymas

PR įvykiai paleidžia klasifikavimą ir izoliuotas patikras. Daily reconciler aptinka praleistus įvykius, pasenusius reservations, įstrigusias patikras, nebaigtą leidimą, atšauktą rollout ir revocation. Centrinis vykdymas gali būti event-driven GitHub jobs ir bendras coordinator; nereikia laikyti naudotojo PC įjungto.

Scheduler/CI laikomas galinčiu vėluoti ar būti neprieinamu. Patvari būsena ir outbox saugomi autoritetingai, o paskutinio sėkmingo reconciliation laikas stebimas. Retry turi backoff, jitter, bendrą biudžetą ir circuit breaker. Sustojęs runner neatlaisvina teisės antram nekontroliuojamai publikuoti tą patį leidimą.

| Atsakomybė | Kas gali veikti autonomiškai pagal pasirinktą politiką | Pasitikėjimo riba |
|---|---|---|
| Discovery / triage | Ieškoti kandidatų, dublių, licencijų ir scope; rikiuoti pagal užduoties spragą | Viešas URL ir README yra nepatikimi duomenys; nėra execute teisės |
| Pataisos autorius | Izoliuotai rengti leistiną adapterio pataisą ir reproducer | Neturi merge, release, root key ar acceptance policy keitimo teisių |
| Trusted evaluator | Vykdyti patikimos bazės gate ir nepriklausomą corpus prieš kandidatą | Jo policy/suite/image digest neimami iš vertinamo PR |
| Merge bot | Sujungti tik iš anksto leistinos kategorijos pakeitimą su aktualiais gate įrodymais | Siaura repo/branch teisė, current base SHA, privalomos serverio taisyklės |
| Release bot | Sukurti versiją ir pasirašyti patikrinto merged tree artefaktus | Atskira identity ir signing teisė; nepatikimas PR job negauna secrets |
| Registry admission | Priimti arba reklasifikuoti konkretų modulio release pagal jo politiką | Neįgyja teisės diegti jį visuose klientuose ar plėsti klientų grant |
| Vietinis supervisor | Patikrinti, suplanuoti ir pritaikyti suderinamą signed update | Nepriima naujo kodo iš `git pull`, PR ar nepatikrinto `latest` |

Globaliai publikuojamiems darbams reikia bendro coordinator, atominių leases, expiry, fencing ir patvarių biudžetų. GitHub issue komentaras yra discovery/review įrašas, ne atominė rezervacija. Merge, release ir registry publish dedupinami pagal bazę, policy ir artefaktų digest; apie universalų exactly-once nekalbame.

## 4. Vienkartinė politika ir pirmas unattended merge kelias

Vartotojas arba projekto prižiūrėtojas vieną kartą pasirenka versijuotą politiką: `allowed_categories`, `allowed_namespaces`, `permission_envelope`, resursų/kainos/rate limitus, update kanalą, darbo laiką ir exceptions. Ši politika saugoma su digest ir auditu; agentas negali jos pats išplėsti. Rutininiai veiksmai jos ribose nevirsta nuolatiniu patvirtinimų dialogu.

**Pirmas siauras auto-merge lane:** mažas jau įdiegto adapterio deterministinio normalizavimo arba klaidos tvarkymo pataisymas. Nekeičia viešo kontrakto, leidimų, tinklo/secrets, vykdymo aplinkos, priklausomybių ar vertinimo taisyklių; turi baseline reproducer ir nepriklausomus golden/regression rezultatus. Diff dydis yra papildoma riba, o ne saugumo įrodymas.

- Triage klasę nustato deterministic policy ir source/diff patikros; modelis gali pateikti argumentus, bet jo confidence negali įjungti merge.
- Patikros siejamos su tikru candidate ir galutiniu merged tree. Po base ar reikšmingo diff pokyčio seni įrodymai nebegalioja; merge queue tikrina naują kombinaciją.
- Autoriaus pridėtas testas nėra vienintelis arbitras. PR negali pakeisti trusted runner, holdout, slenksčių, CODEOWNERS ar saugumo kontrolės, kad pats praeitų.
- Scope neatitikimas, licencijos neaiškumas, regresija, biudžeto riba ar neaiškus išorinis efektas sustabdo automatinį kelią. Pataisa lieka peržiūrima; nesėkmė nepaverčiama sėkmingu merge.
- Automatiniam stable release nereikia naujo žmogaus paspaudimo kiekvienai rutininės klasės pataisai, kai vienkartinė prižiūrėtojo politika tai leidžia ir visi gate įvykdyti.

**Atskira žmogaus review kategorija:** policy ir acceptance pakeitimai; secrets/auth/grant modelis; updater/supervisor/trust šaknys; saugumo ribos; negrįžtamos DB/data migracijos; naujos neįprastos host prieigos; signing/release privilegijos. Tai išimtys iš pasirinkto autonomijos scope, ne reikalavimas patvirtinti visus įprastus veiksmus.

**Pilot gate prieš stable:** įrodyti leidžiamos pataisos visą ciklą ir atskirai atmetamus atvejus: pakeisti gate, platesnės teisės, stale base, konkurentiniai merge/publish, blogas parašas, neteisinga platforma, timeout, regresija ir rollback. Pradėti nuo mažos canary grupės, su pamatuota review/compute apkrova ir veikiančiu kill switch. Šiame darbe gate **NOT_RUN**; 100 modulių arba 100 PR nėra būtina pirmo siauro lane sąlyga.

## 5. Kas gali siūlyti ir kaip priimami nauji moduliai

Siūlyti viešą repo gali bet kuris dalyvis. Trending nėra nei vienintelis atrankos kanalas, nei priėmimo sąlyga. Discovery jungia naujas užduočių spragas, nesėkmių statistiką be privačių logų, paklausą, upstream pokyčius ir periodines stars/trends apžvalgas.

Kelias: `submission → source/license triage → isolated draft adapter → trusted conformance → task corpus + resource measurements → experimental/canary → verified(release,OS,arch) → recommended → signed registry`.

- Public submission turi identifikuotą namespace, autentifikavimą pateikimui, rate/quota, fingerprint ir dublių patikrą. Sybil tapatybių skaičius negali didinti autoriteto; riboti ir bendrą projekto admission biudžetą.
- Agentas gali automatiškai peržiūrėti source ir sukurti adapterį izoliuotoje aplinkoje. Source skaitymas negali įjungti repo install scripts, AGENTS/SKILL komandų ar mokamų API.
- Licencijos, package/source mapping, transityvinių artefaktų kilmė, realus API, OS/arch, dependency conflict ir papildoma vertė tikrinami prieš vykdymo rekomendaciją. Inbox Zero tipo custom restriction → `reference_only/license_blocked`, ne numanomas leidimas.
- Naują riboto scope modulio release galima automatiškai priimti į experimental kanalą ir vėliau promuoti, jei tokia kategorija jau leista, įrodymai nepriklausomi ir jo teisės telpa esamame envelope. Kritinio scope ar neaiškios kilmės atveju reikalinga išimties peržiūra.
- Automatinis admission nėra visų klientų installation. Klientas parsisiunčia tik užduočiai reikalingą patikrintą release, jeigu telpa jo leidimų, kainos, RAM/disko/GPU ir modelių limituose; ne 100 repo vienu metu.
- Nauji secrets, papildomos paskyros, mokėjimai ar didelis modelis neįjungiami vien iš bendro „autonomija įjungta“. Ankstesnio scope viduje veiksmai unattended; scope išplėtimas – atskiras pasirinkimas.
- Fork, naujas commit, maintainer perdavimas ar tas pats paketo vardas neperima ankstesnio release patikimumo. Watch licencijos, CVE, kilmės ir maintainer pokyčius; tam pačiam vardui gali reikėti karantino.
- Revocation sustabdo naują diegimą ir naujus darbus su konkrečiu digest. Running jobs saugiai sustabdomi arba izoliuojami pagal riziką; vartotojo artefaktai neištrinami. Alternatyvus suderinamas modulis ir autorizuotas rollback turi aiškų kelią.

Queue fairness: atskiri interaktyvaus darbo ir contribution resursų fondai, vieno dalyvio active/retry/rate cap, aging ir srauto slopinimas pagal trusted review bei canary pajėgumą. Naujų submissions antplūdis negali išstumti naudotojų užduočių ar priversti silpninti gate.

## 6. Vienas update planas, keli skirtingi lifecycle

| Komponentas | Atskirai versijuojama | Automatikos riba |
|---|---|---|
| Launcher / desktop shell | OS/arch paketas, native parašas, supervisor protokolas | Bootstrap ir trust keitimas – kritinė kategorija; veikianti sena paleidimo/recovery galimybė būtina |
| API / core / DB schema | Suderinamas release ir migracijos | App/performance pataisa negali tyliai pakeisti duomenų interpretacijos |
| Gebėjimų moduliai | Tikslus source/package/image digest, kontraktas, platforma | Atskirai staging ir conformance; tik įdiegtų/reikalingų modulių dependency planas |
| Modeliai ir svoriai | Modelio, tokenizer, formato, licencijos ir artifact digest | Atskiras didelio download/GPU/cache biudžetas ir kokybės profilis; ne automatinė code update dalis |
| Registry / policy | Pasirašyta metadata ir politikos versija | Modulio autorius nekeičia admission ar klientų leidimų taisyklių |

`UpdatePlan` fiksuoja channel, platform/arch, `plan_id`, visų susijusių targets digests, dependency/contract suderinamumą, disk peak, DB schema intervalą, approval scope, health deadline, rollback target ir security floor. Galutinė desired kombinacija aktyvuojama atominiu planu; vien atskirų paketų „naujausios versijos“ netinka.

Queued/running task saugo exact core/module/model release pins. Pritaikytas update nekeičia jau pradėtos užduoties semantikos. Seni workeriai gali užbaigti tik su suderinama DB ir tebegaliojančiais grant; jų paketai nešalinami, kol yra aktyvių nuorodų. Dokumentai ir galutiniai artefaktai nėra cache.

## 7. Atsisiuntimas, aktyvavimas ir nepriklausomas rollback

1. Supervisor pagal pasirinktą kanalą periodiškai tikrina signed metadata. Vienas single-flight check; offline/backoff būsenos aiškios. Neprivaloma fono telemetrija vien tam, kad veiktų updates.
2. Verifikuoja trust chain, metadata versijas/galiojimą, target hash/size, platform/arch, publisher identity ir native parašą, kur taikoma. Neatitikimas → karantinas; niekada ne `git pull`, arbitrary install script ar savavališkas `latest`.
3. Iš anksto rezervuoja download, išpakavimo, rollback ir migracijos laikiną vietą. Nepakankama vieta sustabdo update, netrina darbų. Staging yra atskiras katalogas / image digest, ne gyvos programos perrašymas.
4. Patikrina prerequisite, dependencies ir suderinamą DB/migracijos planą. Sintetinis health testas neturi pasiekti naudotojo pašto, mokėjimų ar kitų realių side effects.
5. Drain: nepriimami nauji jobs, laukiama saugaus checkpoint; quiesce browser/procesai ir užtikrinamas effect ledger settlement. Jei negalima saugiai checkpointinti, update lieka pending, užuot aklai nutraukęs darbą.
6. Checkpoint ir backup saugomi nuo version katalogo atskirai. Išorinis timeout lieka uncertain; update negali panaudoti restart kaip preteksto veiksmui pakartoti.
7. Supervisor įrašo patvarią activation intent ir seną active pointer; įjungia naują kombinaciją ir laukia readiness su release identity, DB/schema check bei worker heartbeat per nustatytą deadline.
8. Jei nauja app nepasikrauna, supervisor pats grąžina ankstesnę suderinamą kombinaciją. Jo veikimas nepriklauso nuo naujos app updater, UI ar HTTP API sėkmės. Ribojamas boot loop ir pakartotinių bad release bandymų skaičius.
9. Sėkmę commitina tik po health kriterijų; canary rezultatui nepakanka „procesas gyvas“. Ankstesnė versija paliekama rollback grace laikotarpiui, priklausomai nuo aktyvių task pin ir disko kvotos.
10. Supervisor atnaujinimas turi atskirą bootstrap/handoff atkūrimo kelią arba OS installer transaction; seno supervisor, naujo paketo ir recovery įėjimo negalima prarasti vienu neatominiu perrašymu.

**DB/data riba:** pirmenybė expand/contract ir N/N−1 suderinamumui. Negrįžtama migracija nepatenka į rutininį unattended lane: jos kodui reikia atskiros žmogaus review, o klientui – konkretaus migracijos plano sutikimo ir patikrinto recovery; vien `stable-on` tokio sutikimo nesuteikia. Jei po migracijos jau atsirado naujų vartotojo duomenų, seno viso volume backup restore nėra automatinis rollback: jis prarastų naujus įrašus. Išsaugoti naują kopiją ir journal, tęsti saugų forward-fix arba prašyti konkretaus atkūrimo sprendimo. Laiškų išsiuntimo ar viešo publikavimo duomenų bazės grąžinimas neatšaukia.

## 8. Anti-rollback, revocation ir trust recovery

TUF tipo modelis atskiria ilgalaikes root, targets, snapshot ir timestamp roles; konkretus realizacijos paketas bei stabili versija pasirenkami po prototipo. Paprastas SHA tame pačiame nepasirašytame `latest.json` neapsaugo nuo užkrėsto update serverio.

- Senesnė snapshot/timestamp/root metadata arba negaliojantis target nepriimami. Versijų ir galiojimo rollback/freeze apsauga patvari per restart; offline režimas neleidžia ignoruoti parašų.
- Autorizuotas grįžimas į ankstesnį app binary nėra senos metadata replay: naujesnė patikima metadata aiškiai leidžia konkretų seną digest, suderinamą schema intervalą ir security floor. Semver mažėjimas savaime nėra pakankamas nei atmesti incident rollback, nei jį leisti.
- Release key revocation ir reguliari root rotacija turi patikrintą trust transition. Naujas URL su tuo pačiu pažeistu raktu nėra nauja pasitikėjimo riba.
- Root kompromiso atvejui iš anksto numatytas atskiras offline recovery root ir native-signed rescue installer / OS trusted package kelias. Jei kompromituotos ir šios šaknys, automatinė to paties kanalo saviatkūra neįmanoma: žmogus turi atkurti pasitikėjimą per nepriklausomai patikrintą įėjimą.
- Revocation ar pasibaigusi metadata neturi tyliai trinti dokumentų arba įjungti nepatikrinto paketo. Nauji updates sustabdomi, rodoma priežastis ir leistinas recovery; duomenys lieka.

## 9. Windows, macOS ir Linux pakuotės

Pirma palaikoma matrica: **Windows 11 x64, macOS arm64, Linux x64**. Kitos OS/arch atsiranda tik po tikrų installer/update/rollback bandymų. „Išeina sukompiliuoti“ nėra šios matricos palaikymas.

| Profilis | Siūlomas platinimas ir update savininkas | Ankstyviausia patikra |
|---|---|---|
| Windows | Pasirašytas `.exe` per-user installer; Squirrel arba NSIS schema pasirenkama packaging ADR. MSIX būtų atskiras alternatyvus paketo formatas | Authenticode identity, pirmas install, locked files/shutdown, nepavykęs start, UAC riba ir data-preserving uninstall |
| macOS | Pasirašyta ir notarizuota `.app`, platinama `.dmg` ar pasirinkta installer forma | Apple signing/notarization, Gatekeeper, arm64, būsenos keliai ir ankstesnės suderinamos versijos paleidimas |
| Linux user-owned | Kandidatas AppImage arba versijuotas portable paketas su supervisor | Tikras writable target, native dependencies, hash/signature, single instance, launcher/symlink ir rollback |
| Linux package-managed | `.deb` / `.rpm` ir patikimas repo; naujinimus valdo OS package manager | App neperrašo apt/rpm valdomų failų ir nesišaukia sudo/pkexec slapta; UI rodo deleguotą naujinimų savininką |

OS admin/UAC, Developer Program/certifikatų, Docker/WSL/virtualizacijos ar dar nepasirinktos paslaugos poreikis yra reali prielaida, ne teisė apeiti OS sutikimą. User-owned paketas gali rutiniškai atsinaujinti be pakartotinio admin dialogo; package-managed profilio automatinė politika įgyvendinama per OS kanalą, o ne dubliuojama app procesu.

Rakazo Electron egzistavimas dar neįrodo vieno native `.exe` su visu backend be Docker. P0 packaging spike turi pasirinkti ir pamatuoti: esamą deklaruotą engine prerequisite arba tikrai įgyvendintą native runtime bundle. Shell installer, backend, DB, engine/VM ir temporary disk kaštai pateikiami atskirai; ≤2 GB bazės tikslas neslepiamas engine išimtimi.

**PATIKRINTA ŠALTINYJE:** Electron native `autoUpdater` dokumentuoja tik macOS ir Windows; Linux rekomenduoja distro package manager. `electron-updater` iš electron-builder yra atskira biblioteka ir turi `AppImageUpdater`. Šių dviejų API negalima vadinti vienu cross-platform mechanizmu.

Papildoma aktualumo išvada: tikrintas electron-builder HEAD `AppUpdater.ts` jau aprašo `autoInstallEvent`; `autoInstallOnAppQuit` paliktas compatibility shim. Jo default atsisiuntimo/įdiegimo semantika neprivalo sutapti su mūsų drain/activation politika. Pasirinktos bibliotekos on-quit/on-next-launch auto-install kelias išjungiamas arba valdomas platforminio adapterio, kad negalėtų apeiti vienintelio supervisor aktyvavimo plano. Konkreti stabili package versija ir adapterio API fiksuojami po bandymo, ne iš atminties ir ne vien iš HEAD.

## 10. Operaciniai sustojimai ir minimalūs priėmimo vartai

- [ ] Vienas vietinis runtime, aiškus foreground/background ir atskiras OS autostart pasirinkimas; patvirtintas restart/missed-cron elgesys.
- [ ] Vienkartinė policy leidžia rutiną unattended, bet negali pati išsiplėsti; testai apima kritinės kategorijos eskalavimą ir kontribucijos išjungimą.
- [ ] Siauras auto-review → merge → build → signed release → canary → stable ciklas įrodytas prieš stable; neteisingas gate, base ir policy digest atmetami.
- [ ] Globalus coordinator, rate/fair-share, idempotency ir durable budget išgyvena runner restart; cloud outage nesukuria dvigubų merge/release ar neriboto catch-up.
- [ ] Viešas URL nepaleidžia kodo; naujas modulis įrodo licenciją, conformance, realią užduotį ir resursus; admission atskirtas nuo vietinio install.
- [ ] Windows/macOS/Linux matricoje išbandyti pirmas install, signed update, blogas hash/signature, neteisinga arch, disk-full, sleep ir uždelsti procesai.
- [ ] Nauja app sugenda iki updater start: senas supervisor savarankiškai atkuria veikiančią suderinamą versiją; bootstrap update taip pat turi recovery kelią.
- [ ] Drain/checkpoint ir neaiškus išorinis efektas nesukelia automatinio pakartojimo; užduoties exact pins ir artefaktai išlieka.
- [ ] Patikrinti suderinamos migracijos rollback ir negrįžtamos migracijos sustojimas; nėra automatinio restore, prarandančio naujus duomenis.
- [ ] Target revocation, metadata expiry/rollback, root rotation ir nepriklausomas kompromituotos trust šaknies recovery pademonstruoti izoliuotame pilotiniame profilyje.

Biudžetai patvarūs visai užduočiai ir centriniam priėmimo srautui, ne vien proceso RAM counter. Pasiekus limitą, didėjant klaidoms ar nežinomoms išlaidoms circuit breaker stabdo naujus darbus. Tikras vartotojo darbas turi prioritetą prieš SAI/discovery. Konkretūs schedules ir default limitai turi vieną norminį šaltinį pagrindinėje specifikacijoje, kad tarp dokumentų neatsirastų skirtingos politikos.

Nėra slaptos telemetrijos: update metadata užklausa atskiriama nuo pasirinktinų agregatų; privatūs prompts, dokumentai, workspace ir raw logs pagal nutylėjimą nesiunčiami. Uptime, backlog ir revocation auditui pakanka ribotų operacinių metaduomenų. Privačių duomenų eksportas niekada netampa būtina sąlyga gauti bugfix.

## 11. Perskaityti oficialūs šaltiniai ir jų ribos

Visi žemiau pateikti tekstai / kodas perskaityti nekintančiu GitHub SHA. Tai šaltinių snapshotai, ne pažadas, kad jų HEAD atitinka pasirinktą stabilų npm/Electron leidimą. TUF ir GitHub merge/release įvykių šaltinius lygiagrečiai tikrina pagrindinis agentas; šiame review jų runtime realizacija nepatvirtinta.

- [electron/electron / docs/api/auto-updater.md](https://github.com/electron/electron/blob/2766ef64b6593b647cc69a277e1555855a9de1e0/docs/api/auto-updater.md) – perskaityta 2026-10-16.
- [electron/electron / docs/tutorial/updates.md](https://github.com/electron/electron/blob/2766ef64b6593b647cc69a277e1555855a9de1e0/docs/tutorial/updates.md) – perskaityta 2026-10-16.
- [electron/electron / docs/tutorial/code-signing.md](https://github.com/electron/electron/blob/2766ef64b6593b647cc69a277e1555855a9de1e0/docs/tutorial/code-signing.md) – perskaityta 2026-10-16.
- [electron/electron / docs/tutorial/application-distribution.md](https://github.com/electron/electron/blob/2766ef64b6593b647cc69a277e1555855a9de1e0/docs/tutorial/application-distribution.md) – perskaityta 2026-10-16.
- [electron-userland/electron-builder / packages/electron-updater/src/AppUpdater.ts](https://github.com/electron-userland/electron-builder/blob/434f6e98b017c14176be9aaf06891f09624c88fc/packages/electron-updater/src/AppUpdater.ts) – perskaityta 2026-10-16.
- [electron-userland/electron-builder / packages/electron-updater/src/AppImageUpdater.ts](https://github.com/electron-userland/electron-builder/blob/434f6e98b017c14176be9aaf06891f09624c88fc/packages/electron-updater/src/AppImageUpdater.ts) – perskaityta 2026-10-16.
- [MicrosoftDocs/win32 / desktop-src/SecCrypto/signtool.md](https://github.com/MicrosoftDocs/win32/blob/ca8274decead49403d70ceeed4af8d4ca74eaf11/desktop-src/SecCrypto/signtool.md) – perskaityta 2026-10-16.


## 12. Galutinė plano 0.2 kritinė peržiūra

2026-10-16 perskaityti atnaujinti `PLAN.md`, `ROADMAP.md`, `docs/AUTONOMY-AND-UPDATES.md` ir `docs/MODELS-AND-TOOLS.md`. Tai dokumentų nuoseklumo patikra, ne runtime bandymas ar nepriklausomas saugumo auditas.

**Suderinti sprendimai:** vienas vietinis scheduler ir pasirinktos bazės DB; atskiras nuolatinis centrinis VPS coordinator su PostgreSQL ir secretless disposable workeriais. Ankstesnis šio review bendras CI/coordinator pasiūlymas šiuo centrinio diegimo profiliu patikslintas. Centras negauna privačių klientų credentials; vietinis produktas netampa priklausomas nuo nuolatinio centro ryšio visoms užduotims.

P3C pradinis esamo adapterio bugfix lane neleidžia naujų dependency ar permissions. Naujo izoliuoto modulio admission yra atskirai priimtas siauras profilis, ne šio draudimo apėjimas. Suderinamų upstream dependency bump unattended priėmimui reikia papildomo P5.11 shadow ir supply-chain profilio. P3D upstream watcher gali anksčiau aptikti, parengti ir išbandyti kandidatą; tai savaime neįgalina automatinio dependency merge. P3C pilotui reikalingas coordinator ir PostgreSQL negali būti atidėti iki vėlesnio P5.8 plėtimo.

Upstream lifecycle teisingai skiria immutable package/image/weights pins, fork sync ir hosted API kontrakto drift. Priėmimas priklauso nuo konkrečios naujos kombinacijos įrodymų; semver ar ankstesnė recommended žyma nepaveldima. `installed / verified latest / upstream latest` ir lag priežastys suteikia naudotojui tikrą būseną. Atšauktas senas target nėra amžinas fallback; darbai sustabdomi saugiame taške, išsaugant artifacts ir unknown-effect ledger, o ne ištrinant vartotojo duomenis.

**Išspręstas MAJOR patikslinimas po apsikeitimo kritika:** pirminėje šio raundo autonomijos specifikacijos §5.9 redakcijoje release job gaudavo signing identity ir tuomet kurdavo paketą / SBOM; tai prieštaravo aiškesniam ROADMAP P3C.6 build/sign atskyrimui. Pagrindinis agentas pataisė §5.9 ir centro lentelę; pakeistas vietas perskaičiau. Dabar tiesiogiai nurodyta: visas candidate source, install/build/package hooks ir SBOM kūrimas vyksta be signing, GitHub write ir coordinator DB paslapčių. Tik užbaigto artifact digest bei patikimų galutinio SHA / build atestacijų tikrintojas gauna signing identity; jis nevykdo kandidato repo kodo ar hooks. Tai ištaisytas būsimos realizacijos aprašo neaiškumas, ne aptikta jau veikiančio produkto pažeidžiamybė. §11A papildomai aiškiai nurodo P5.11, o iki jo bump priima maintainer / exception kelias.

Kituose tikrintuose punktuose blocker ar major architektūrinių prieštarų nerasta: updater ir nepriklausomas supervisor atskirti, OS package ownership išlaikomas, root recovery nepriklausomas, binary rollback neperrašo naujų duomenų, revocation neatkuria nepatikimo target. Visi veikimo, kaštų ir OS palaikymo teiginiai lieka būsimi vartai, **NOT_RUN**. Po šio pataisymo galutinių blocker ar major dokumentų prieštarų tikrintoje apimtyje neliko; pritarimas yra architektūros planui, ne jos būsimo veikimo garantija.


## 13. Ankstyvos oficialios svetainės ir paramos specifikacijos peržiūra

2026-10-16 perskaityta `docs/PUBLIC-WEBSITE.md`. Blocker ar major neatitikimų nerasta. Svetainė planuojama nuo ankstyvo etapo ir atskirta nuo vietinių darbų bei updater trust root. Public facts export → struktūriniai faktai → ribota modelio santrauka → trusted status/link/privacy patikros → build be publish paslapčių → atskiras publisher aiškiai apsaugo tą pačią source/build/privilegijų ribą kaip produkto release. Neaiški santrauka paliekama draft arba pakeičiama patikrintais struktūriniais faktais; merge nereiškia validated.

Pritariu source/status/metrics kilmės ir datų rodymui, private failų / promptų / raw logs bei neviešintų saugumo radinių išskyrimui dar prieš modelį. Viešos `installed / validated` būsenos turi nurodyti operatoriaus / canary instaliacijas arba su aiškiu sutikimu gautus agreguotus duomenis; iš privataus naudotojo instaliacijos negalima jų išvesti be atskiro telemetrijos pagrindo. Tai jau aprašytos privatumo politikos taikymas, ne naujas bendras telemetrijos reikalavimas.

Donate modelis proporcingas: tik savininko patvirtintas hosted paramos puslapis, jokio agentinio finansinės paskyros kūrimo ar gavėjo / payout pakeitimo. Finansų santraukos remiasi provider report / patikrintais webhook ir aiškina gross/fees/refunds/net, valiutą, laikotarpį bei nesuderintus duomenis. LLM nesugalvoja sumų, donorystė pati nedidina agentų išlaidų cap, neviešinama private donorų informacija.

Publisher vykdo tik patikrinto build publikavimą; neturi kandidatų hooks ar modelio komandų vykdymo su deploy teise. Donation nuorodos ir finansų politika nėra rutininio turinio lane dalis. Paskutinis teisingas build su data ir ribotas retry neimituoja sėkmingo publish. Šiuo metu parengtas planas: domenas, hostingas, mokėjimų paskyra ir viešas deploy neaktyvuoti, visi runtime vartai **NOT_RUN**.


## 14. Naudojimo statistikos ir viso viešo registry svetainės peržiūra

2026-10-16 perskaitytas visas `docs/USAGE-STATISTICS.md`, papildyti `docs/PUBLIC-WEBSITE.md` registry / coverage / consistency punktai ir ROADMAP P1S/P2S. **Blocker ar major prieštarų nerasta.** Vietinis execution/effect/budget ledger reikalingas darbui ir nieko savaime neviešina; atskiras opt-in eksportuoja ribotus dienos agregatus. Viešas dashboard sąžiningai rodo tik matomą imtį, ne visas instaliacijas ar pasaulinį įrankių rinkos reitingą.

Pritariu public-ID allowlist ir private/custom IDs, prompts, turinio, failų kelių bei credentials neeksportavimui. Pseudoniminis report nėra anonimiškumo įrodymas; IP / ingress logai ir jų retention įtraukti į privatumo ribas. Siūlomi 20 besidalijančių instaliacijų konkrečiame segmente ir 30 dienų pirminių report / dedup langas yra prieš aktyvavimą tikslintini parametrai; mažų imčių slėpimas nežada formalios anonimizacijos.

Task validator rezultatas, loginis tool call, attempts/retries ir network retransmisija atskirti; gateway/catalog search/get/endpoint nereiškia to paties naudojimo. Real user, contribution, operator CI ir synthetic canary turi atskirą provenance. Kainos unknown nėra nulis, sėkmingas HTTP nėra verified task, klientų p95 vidurkis nėra bendras p95. Client-reported skaičiai ir modifikuojamo kliento signature nėra realaus žmogaus darbo įrodymas; schema / cap / rate / anomalijų filtrai nevadinami Sybil-free garantija.

Įgyvendinimo riba: esant pseudonimo rotacijai ir tik daily agregatams, 7/30/90 dienų aktyvių instaliacijų skaičius turi aiškią apytikslio estimator metodiką; daily unique sumos negalima vadinti tiksliu laikotarpio unique. Pasibaigus dedup retention būtina vienareikšmė vėlyvo / backfill report cutoff arba revision apskaita, kad ištrintas report ID nelemtų pakartotinio susumavimo. Tai būsimo P2S kontrakto ir testų konkretinimas, ne dabartinio plano blocker.

Visi vieši integruoti registry moduliai lieka svetainėje net neturėdami pakankamos usage imties; source-only kandidatai aiškiai atskirti. Kortelės, JSON/CSV ir registry kyla iš tos pačios versijuotos faktų bazės; stats nevaldo acceptance, agento cap ar updater trust. Kol nėra tikros apskaitos, pateikiamas „duomenys dar nerenkami“ / pažymėtas operatoriaus testas, o ne demonstracinė klientų statistika. Visi skaitiklių, ingest ir dashboard runtime vartai **NOT_RUN**.


## 15. Dublikatų, panašių modulių ir pakeičiamumo kritinės išlygos

2026-10-16 papildoma kritika remiasi pagrindinio agento perduota būsimo `MODULE-SELECTION.md` kryptimi; šio komentaro metu failas dar nebuvo sukurtas. Jokie nauji repo ar runtime palyginimai neatlikti. Pritariu canonical repo / redirect / fork lineage atskyrimui nuo funkcinio overlap, vienam capability kontraktui su keliais adapteriais ir paaiškinamai naujo kandidato delta.

1. **Hard gates prieš Pareto:** licencija / platinimas, OS, data locality, grants ir išorinių efektų semantika yra leistinumo sąlygos, ne kompensuojami balai. Vienoda JSON schema ar embedding panašumas neįrodo pakeičiamumo; greitesnis adapteris negali laimėti dėl neleistino duomenų gavėjo ar kitokio write efekto.
2. **Dominavimas yra ribota išvada:** įrodymas galioja konkrečiai version + workload + hardware + model/config + grant kombinacijai. Lyginamos panašios tuning ir compute sąnaudos; mažos imties, triukšmo, daugkartinės atrankos ar prieštaringų užduočių atveju statusas `inconclusive`. Autorių teiginiai ir source-only delta nėra mūsų išmatuotas Pareto pranašumas; neskelbiama universali geriausių / silpniausių lentelė.
3. **Fallback nepriklausomumas vertinamas konkrečiam gedimui:** bendras upstream code, modelis, hosted backend, account/quota, regionas ar kritinė dependency gali palikti tą pačią gedimo priežastį dviejuose adapteriuose. Kitas adapterio vardas nėra nepriklausomas provideris. Fallback nekeičia data-recipient, billing, effect idempotency ar kitų jau suteiktų grants ribų.
4. **Archive / deprecate nereiškia duomenų ištrynimo:** išlieka provenance, notices, sprendimo įrodymai, instaliuotų / nebaigtų darbų pins ir artifacts nuorodos. Default pakeitimas taikomas naujiems darbams po leisto canary, ne perrašo veikiančią užduotį ar padidina privilegijas. Nebeprižiūrimas ar revoked runneris netampa saugus dėl rollback poreikio; nesant leistino pakaitalo modulis sustabdomas išsaugant darbus.

Šie reikalavimai nesukuria užduoties vykdyti visą katalogą. Naujas kandidatas pirmiausia gauna source-only delta ir konkrečią vertingą užduotį; ribota palyginimų eilė skiria laiką tik sprendimą galinčiam pakeisti įrodymui. Vienas oficialus core / scheduler / UI išlieka bendras. Visų būsimų palyginimų runtime būsena **NOT_RUN**.
