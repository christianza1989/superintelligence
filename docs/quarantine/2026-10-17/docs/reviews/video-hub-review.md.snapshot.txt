# Video Hub, GitHub portalo ir intake biudžeto kritinė peržiūra

Data: 2026-10-16, Europe/Kiev. Perskaityti [VIDEO-HUB.md](../VIDEO-HUB.md), [CONTRIBUTOR-PORTAL.md](../CONTRIBUTOR-PORTAL.md) ir [INTAKE-AND-BUDGETS.md](../INTAKE-AND-BUDGETS.md). Tai dviejų agentų projektavimo kritika ir dokumentų nuoseklumo peržiūra, ne nepriklausomos audito organizacijos patikra ar tiekėjų live API bandymas.

**Būsena: planas, NOT_RUN.** Nebuvo login, GitHub / YouTube API kvietimų, paskyrų / OAuth klientų kūrimo, video atsisiuntimo, tikrų balsų, naujų repo paleidimo ar publikavimo. Tikslios provider API / auth / retention / naudojimo sąlygos lieka P0 patikros dalis; pasiūlytos kvotos nėra patvirtintos paslaugų kainos ar throughput rezultatai.

## 1. Svarbiausi sprendimai ir apsikeitimas kritika

Pritariu vienam GitHub website account repo paraiškoms, Video Hub pateikimui ir balsavimui. Public katalogo peržiūra gali būti be login. Modelių, Treg, YouTube kanalo ir GitHub repo write / merge prieigos yra atskiri grants, ne vieno social login pasekmė.

Anksti pateikiau šias esmines išlygas, kurios įtrauktos į perskaitytą specifikaciją:

- Keywords ir modelio confidence neįrodo video turinio. Metadata-only listing turi matytų šaltinių ribą; naudinga kritika nėra netinkamumas vien dėl neigiamo vertinimo.
- GitHub login neįrodo YouTube kanalo valdymo; community submission nėra autoriaus endorsement ar partnerystė.
- Case-sensitive video ID, viena kanoninė kortelė, allowlisted oficialus fetch ir saugus iframe saugo nuo URL dublių bei savavališko fetch.
- Vote API nustato norimą būseną, ne atlieka nepatvarų toggle. Išliekantis pirmo balso laikas ir projection revision apsaugo nuo undo/revote boost bei seno outbox įvykio.
- Vėluojantis approval negali prikelti hidden / rejected / revoked ar jau pakeisto objekto. Ši state-race kritika priimta ir pataisytas vietas perskaičiau: Video Hub ir intake specifikacijos tiesiogiai reikalauja dabartinės objekto / policy / generation kombinacijos CAS.

**Po pataisytų vietų pakartotinio skaitymo galutiniuose trijuose dokumentuose blocker ar major prieštarų neberadau.** Pagrindinei architektūros krypčiai pritariu su žemiau nurodytomis įrodymo ir įgyvendinimo ribomis. Čia nevertinamas dar nesukurtos svetainės faktinis saugumas.

## 2. GitHub tapatybė, „mano repo“ ir scope

Portale aiškiai pasirinktas **GitHub** prisijungimas, ne bendras visų provider login. Account remiasi stabiliu GitHub vartotojo ID; repo remiasi stabiliu repo ID ir patikrintu canonical / rename / transfer ryšiu. Kintamas login, display name ar email nėra pakankamas account sujungimo raktas.

Repo owner, įgaliotas organization maintainer ir community pasiūlytojas turi skirtingus teiginius. Organizacijos narystė, viešas URL, sutampantis vardas ar nuosavas fork savaime neįrodo upstream maintainer įgaliojimo. Jei rolė nepatikrinta, rodoma unverified; community pasiūlymas vis tiek gali būti vertingas. Fork nepradeda turėti originalaus upstream namespace ar jo techninio trust.

Public repo picker / URL pateikimas nėra pagrindas prašyti plataus private `repo`, write / workflow / admin ar private email scope. Pirmas portalas public-only. Būsimas private / PR veiksmas naudoja atskirą selected-repository GitHub App / grant ir atskirą revoke eigą. Login pats neleidžia PR, merge, Actions, modelių sąskaitų, email ar marketingo.

`proposed / source_checked / queued / experimental / verified / installed` nėra sinonimai. AI gali nuspręsti, ar verta kandidatą toliau vertinti, bet negali vien santrauka suteikti leidimo vykdyti source pagrindiniame VPS ar priskirti verified statuso. Įkelta nuoroda taip pat nesuteikia nuosavybės į code / weights / data licencijas.

Callback / state / konkretaus oficialiai palaikomo auth metodo apsauga, Secure / HttpOnly / SameSite session, CSRF ir account-switch / logout / revoke turi realius P0/P1 testus. Modelis ir metadata worker negauna account tokenų; website sesija neimportuoja šio pokalbio ar kitų programų credentials.

## 3. YouTube URL, metadata ir teisėta įrodymų apimtis

URL naudojamas parseriui: leistina YouTube forma → case-sensitive video ID → fiksuotas oficialus endpoint. Tracking / timestamp / Short / watch variantai nesukuria atskiro vote objekto. Playlist / channel nėra video. Provider metadata, thumbnail ir redirect taip pat validuojami; vien leistinas pradinis host neturi leisti redirect į privatų VPS adresą.

oEmbed nėra viso description ar visų transkriptų garantija. Captions gaunami tik realiai leistinu, prieinamu metodu. Missing transcript nėra priežastis apsimesti, kad modelis matė video; metadata / aprašas gali būti pakankami teminei listing paraiškai, tačiau ne video rezultatų sertifikavimui. Oficialaus player embed neperduoda teisės rehostinti video ar naudoti jo iškarpas reklaminiam B-roll.

Pirmas profilis public-only; unlisted / private nuoroda netampa vieša vien dėl submitter veiksmų. Iframe generuojamas iš patikrinto šablono, ne priimamas submitter HTML. Third-party player įkėlimas turi aiškų play / privacy pasirinkimą. Serverio API key ir quota negali būti išdalinti naršyklei ar modelio prompt.

Patvirtintas deleted / private faktas ir laikina API klaida yra skirtingos būsenos. Quota / timeout / vieno regiono neprieinamumas negali ištrinti viso katalogo. Embed-disabled atveju konservatyvus rekomendavimo sustabdymas pagrįstas pasirinktu profiliu; galimas vėlesnis link-only / istorinis rodymas yra atskiras produkto ir terms pasirinkimas, ne būtinas pradžios reikalavimas.

## 4. Relevance, moderation ir stale approval

Prasminga sąsaja su use case / tutorial / review vertingesnė už „RepositoryZero“ kartojimą apraše. Pagal signalus galima rasti kandidatą, tačiau keyword stuffing, suklastotas acceptance ar prompt instrukcijos description lauke nesuteikia publish teisės. Metadata worker pateikia ribotą report; patikimas valdiklis taiko pasirinktą politiką ir caps.

`approved for listing` reiškia katalogo teminį sprendimą, ne visų video teiginių teisingumą, creator ownership, viso produkto endorsement ar modulio QA. `My project was accepted` oficiali žyma tikrinama pagal registry būseną; nuomonė, kritika ar bloga patirtis nėra automatinis atmetimo pagrindas.

Review įrašas saugo realiai matytus šaltinius / snapshot hash, model/config ir policy revision. `human_review` savaime taip pat nereiškia, kad žmogus matė visą video. Po kritikos galutinė specifikacija tiesiogiai atskiria actor nuo faktiškai seen_sources/modality ir aprėpties; žmogus, skaitęs tik metadata, negali suteikti „visas video peržiūrėtas“ žymos.

**Esminis state kontraktas:** evaluation / moderation rezultatas siejamas su `video_revision`, metadata snapshot hash, `policy_revision` ir `moderation_generation`. Patikimas publisher su CAS priima tik dabartinei kombinacijai ir leidžiamai būsenai skirtą rezultatą. Edit / recheck / reject / report / hide / revoke gali invaliduoti ankstesnį generation; senas lėtas worker report negali prikelti įrašo ar patvirtinti naujo aprašo pagal seną evidence. Tai užfiksuota po tarpusavio kritikos, ne jau veikiančio produkto gedimo nustatymas.

## 5. Balsai, reitingai ir privatumas

Pritariu `(user_id, video_id)` unikalumui, atominiam `active` keitimui, idempotency ir monotoniškai revision. `set_vote(true/false)` saugiau kartojamas nei toggle. Viešas count kyla iš autoritetingų DB / įvykių, o ne iš kliento nurodyto skaičiaus. Senas outbox replay nepakeičia naujesnės projection būsenos.

Undo / revote išlaiko pirmo balso laiką ir tam būtiną record / tombstone. Top7/30/90d apibrėžiamas aktyviais leistinais balsais, pirmą kartą duotais tame lange; tai nėra video views, žmonių skaičius ar pasaulinis kokybės reitingas. Account delete / retention ribos ir duomenų politika negali būti apeitos tariama amžina žmogaus tapatybe.

Login reiškia paskyrą, ne vieną žmogų. Caps, global / per-account ribos, anomalijos ir ribotas friction sumažina manipuliavimą, bet nesuteikia Sybil-free garantijos. Reviewer ir paid placement negali tyliai pridėti organic votes; naudojimas, creator populiarumas ir upvotes nekeičia modulio verified / merge / release teisių.

Viešos sumos neatskleidžia, kas už ką balsavo. Private email, kitų žmonių istorija ir account/session duomenys nepatenka į public projection. Usage telemetry, submission status notifications, newsletter ir co-promotion turi atskirus pasirinkimus. Submitter ir tikras YouTube kanalas rodoma taip, kad community pateikėjas negalėtų apsimesti autoriumi.

## 6. 100 / 1000 / 2000 nuorodų ir pradinis biudžetas

Pritariu intake kaskadai: bounded auth / format / canonical dedup / cache / metadata / struktūrinė forma pirma, ribotas semantinis vertinimas vėliau. Pakopos 0–3 neslepia mokamų „trumpų santraukų“. NoLLM nereiškia nemokamo ar neriboto network / CPU / DB / egress / API quota; mokamas metadata provider taip pat turi išlaidų rezervą.

Siūlomi iki 100 naujų objektų metadata, iki 10 gilesnių source apžiūrų, iki 10 globalių repo + video triage LLM kvietimų ir iki 1 naujo adapterio darbo per parą yra **piloto politikos ribos**, ne išmatuotas serverio pajėgumas ar 10 gilių analizių garantija. Modelis / kainoraštis / input / output / reasoning / timeout turi konkrečias ribas prieš vykdymą; default išorinės mokamos išlaidos 0, kol nėra pasirinkto account ir baigtinio cap.

Po ankstyvos cost kritikos patikslinta privaloma riba: faktiniai dispatch attempts apima retry, repair ir SDK transparent retries; triage naudojami summarizer / embeddings / reranker taip pat negali turėti neapskaitomo mokamo kelio. Kitų rolių ir deep build / CI / VM darbams reikia atskirų baigtinių rezervų, kurie neviršija viso centro call/token/compute/pinigų ribų. Vien 10 aukšto lygio užduočių limitas šių garantijų nesukuria.

Patikimas brokeris vienu DB sandoriu, su unikaliu invocation ID ir concurrency / lease / fence kontrole, rezervuoja globalų bei lane call-slot, konservatyvų token / kainos / compute upper-bound. Check-then-increment ar workerio RAM counter nepakanka. Tikras receipt sutikrina spent/reserved/uncertain; failure nebūtinai nemokamas. Po crash / timeout unknown spend laikomas rezervuotas iki patikimos reconciliacijos, ne automatiškai grąžinamas į biudžetą. Viena operatoriaus dienos / rolling24h politika nėra atkuriama kiekvieno worker vietiniu laikrodžiu.

Jei kasdien ateina 2000 naujų objektų, o metadata aptarnaujama 100, neaptarnautų daugėtų 1900 per dieną. Todėl katalogas be skaičiaus lubų nėra begalinės aktyvios queue / payload saugojimo pažadas. `deferred_capacity`, `blocked_budget`, bounded draft / source-only ir reali coverage yra sąžiningesni už „AI analizuoja visus“. Prioritetų / fair-share / exploration dalis palieka kelią mažai žinomam projektui; mažai stars ar trumpas README nėra globalus silpnumo įrodymas.

Cache turi tikrą repo SHA / video metadata hash, profile, evidence coverage / completeness, policy ir moderation generation bei atitinkamą TTL. 403, nutrūkęs fetch ar truncated LICENSE nėra complete trusted patikra. Dalinis / unknown cache gali taupyti pakartotinius kvietimus, tačiau neperduoda PASS naujam source ar panašiam repo. Refresh / security turi atskirus baigtinius rezervus, kad nei apeitų cap, nei išstumtų visą naujų kandidatų peržiūrą.

## 7. Galutinio įgyvendinimo vartai ir šios išvados riba

- [ ] Tikras GitHub login, minimalūs scopes, own/org/community ir account-switch / revoke / CSRF neigiami atvejai; jokio token modelyje / renderer / logs.
- [ ] Official YouTube metadata, captions, embed / caching / privacy / quota taisyklės patikrintos pasirinktam metodui; nėra neleistino downloader ar rehosting.
- [ ] Keyword-only, klaidinantis aprašas, kritinė teisėta apžvalga, trūkstamas transcript ir fake endorsement gauna teisingą listing / review statusą su evidence scope.
- [ ] Senas approve po naujo metadata / report / hide / policy generation nepaskelbia objekto; votes undo / replay / reorder nepakeičia first-vote laiko ar naujausios projection.
- [ ] 100 / 1000 / 2000 sintetinių submissions nesukuria paslėptų LLM kvietimų ankstyvose pakopose; concurrent workers / retry / midnight / SDK retry / unknown spend neapeina rezervų.
- [ ] API outage nesunaikina katalogo; private/unlisted netampa public; resource exhaustion neperduoda svetimam source pagrindinio VPS paslapčių; public export neturi privačių account/vote duomenų.

Perskaitytų dokumentų kryptis suderinama. Pateikta esminė stale-approval ir atomic-cost kritika priimta pagrindinio agento; pataisytas CAS/generation, reviewer apimties, SDK dispatch, invocation/concurrency ir cache coverage vietas pakartotinai perskaičiau. Jos konkrečios būsenų / rezervavimo ribos yra būtini būsimos realizacijos vartai. Šio review pritarimas nereiškia veikiančio account, tikrų balsų, įvykusios integracijos, teisinių sąlygų patvirtinimo ar įrodyto apkrovos / kainos rezultato. Visi runtime vartai **NOT_RUN**.
