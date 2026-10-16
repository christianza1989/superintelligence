# RepositoryZero Video Hub

Plano 0.2 papildymas, 2026-10-16. Naudotojo reikalavimas: prisijungęs žmogus pateikia su projektu susijusį YouTube video; sistema patikrina tinkamumą, paskelbia kataloge ir leidžia balsuoti. **Būsena: suprojektuota, NOT_RUN; nėra account sistemos, veikiančio katalogo, API kvietimų ar tikrų balsų.** [Kritinė peržiūra](reviews/video-hub-review.md), [kūrėjų augimo programa](GROWTH-AND-OUTREACH.md).

## 1. Naudotojo kelias

1. Svetainėje atidaro „Videos“, mato viešą katalogą ir kategorijas. Peržiūrai prisijungti nereikia.
2. „Submit a video“ arba „Vote“ paprašo **prisijungti per GitHub**, kaip ir repo pateikimo portale. Tai naudotojo pasirinktas pirmas website identity metodas; modelių API/OAuth ar Treg paskyros atskiros. [Bendras account ir repo portalas](CONTRIBUTOR-PORTAL.md).
3. Pateikia YouTube nuorodą, pasirenka kategoriją ir susijusį viešą modulį / repo, trumpai paaiškina naudą. Gali siūlyti savo video arba viešą kito autoriaus video, aiškiai nurodydamas, kad nėra jo autorius.
4. Sistema kanonizuoja nuorodą, parodo rastą video/kanalą ir esamą dublį, jei toks yra. Naudotojas patvirtina teisingą objektą; nepridedama privataus ar neišvardyto video nuoroda kaip vieša vien dėl jos įklijavimo.
5. Tikrinamas prieinamumas, embed galimybė, kilmė, projekto temos atitikimas ir taisyklės. Aiškiai tinkamas įrašas pagal išbandytą politiką gali būti priimtas automatiškai; neaiškus gauna review būseną su priežastimi.
6. Paskelbtas įrašas turi savo puslapį ir atsiranda kataloge. Prisijungęs naudotojas gali skirti vieną upvote, jį atšaukti, pranešti problemą; submitter mato savo paraiškos būseną ir gali apskųsti atmetimą.

Kūrėjas gali patvirtinti savo kanalo valdymą tik atskirai įgyvendintu oficialiu metodu. Vien GitHub login ar sutampantis vardas to neįrodo. Community pateiktame įraše rodome „submitted by“ ir tikrą YouTube kanalą; „channel owner confirmed“ žyma suteikiama tik su tikru valdymo įrodymu. Pateikti viešą nuorodą nėra subscription, partnerio reklamos ar neriboto kontaktavimo sutikimas.

## 2. Katalogas ir įrašo kortelė

| Kategorija | Pavyzdys / paskirtis |
|---|---|
| RepoZero explained | Kas yra projektas, architektūros paaiškinimas, parengties apžvalga |
| Use cases | Tikras darbas, kurį autorius atliko su platforma |
| Tutorials | Diegimas, modelių/auth pasirinkimas, įrankiai ir konkretus žingsnių receptas |
| Integration stories | „How my project was accepted into RepoZero“, adapterio kūrimas ir testai |
| Build with us | Techninis kūrimas, contribution eiga, klaidos/pataisos paaiškinimas |
| Reviews / comparisons | Nepriklausomas bandymas, kritika, palyginimas ir apribojimai |

Kortelė: tikras pavadinimas, kanalas ir nuoroda į originalą, thumbnail pagal leistiną naudojimą, paskelbimo data/trukmė/kalba kai prieinama, mūsų trumpas faktinis paaiškinimas, kategorija, susiję public modules/releases, katalogo approval data, embed prieinamumas ir platformos upvotes. Aiškiai atskiriami **YouTube views/likes** iš datuoto šaltinio, jei teisėtai/prieinamai renkami, nuo **Video Hub balsų**; nė vienas skaitiklis neišgalvojamas.

Filtrai: kategorija, kalba, modulis, aktuali versija ir data. Vaizdai: naujausi, top7/30/90d, visų laikų upvotes ir teminės kolekcijos. Pasenusi pamoka gali likti istorijoje su versijos/aktualumo žyma; jos negalima rodyti kaip dabartinio quickstart vien dėl didelio balsų skaičiaus. Katalogas priima argumentuotą kritiką, ne tik teigiamą reklamą; disclosure ar nuomonė nėra automatinė atmetimo priežastis.

## 3. Duomenų šaltiniai ir YouTube ribos

Siūlomas kelias – oficialūs YouTube metadata/embedded player mechanizmai, jų tuo metu galiojančios sąlygos ir operatoriaus API quotas. Tikslūs endpointai, auth, allowed caching/retention, branding, embed ir attribution reikalavimai patvirtinami P0 ADR prieš runtime aktyvavimą. Šiame plane tai nėra naujai atliktas teisinis ar live API auditas.

- `youtube.com/watch`, `youtu.be`, Shorts ir leidžiami embed URL normalizuojami į vieną case-sensitive video ID. Playlist/channel URL nėra atskiras video; tracking/query variantai nekuria naujos kandidatūros. ID patvirtinamas tiekėjo duomenimis, ne vien panašiu regex.
- Oficialus oEmbed gali būti pagalbinis embedding/pagrindinių metaduomenų šaltinis; **viso video description ir transkripto vien iš oEmbed nelaikome gaunamais**. Pilnas aprašas, status/embedding informacija ir kiti laukai tikrinami pagal tinkamą oficialų API ir jo galimybes.
- Captions/transcript naudojami tik kai juos leidžiama ir įmanoma gauti konkrečiu metodu; nėra pažado automatiškai parsisiųsti visų svetimų video transkriptus. Trūkstant jų galima vertinti pakankamus kitus įrodymus arba palikti žmogaus review; modelis neišgalvoja, ką „matė“ video.
- Default pirmas profilis – vieši video, leidžiami embed ir atitinkantys katalogo taisykles. Private ir unlisted automatiškai neviešinami. Būsimas verified autoriaus unlisted publikavimo kelias reikalautų atskiro aiškaus pasirinkimo ir taisyklių; MVP jį atmeta.
- Svetainė saugo nuorodą/metaduomenis, savo review ir votes. Ji neparsisiunčia ir neperpublikuoja video failo. Embedding nereiškia teisės iškirpti video reklaminiam B-roll; tam atskira autoriaus/teisių bazė.
- Iframe kuriamas iš mūsų patikrinto šablono ir leistino ID/host, ne iš savavališko submitter HTML. Aprašas/thumbnail URL, redirects ir provider response validuojami; jokių JS/scripts iš UGC. Player įkeliamas po aiškaus play/third-party pasirinkimo su tinkamu privacy nustatymu, ne slaptu auto-play/background tracking.

URL fetch leidžia tik patvirtintus YouTube/API host ir jų skirtus kelius. Trumpa nuoroda negali tapti savavališku vidinių VPS URL fetch ar naudotojo pateikto serverio iframe. API keys laikomi serverio brokerio viduje; submitter neduoda prieigos prie savo modelių ar el. pašto paskyrų. Channel ownership metodas prašo tik realiai būtino scope, ne upload/delete/manage teisių iš įpročio.

## 4. Automatinis tinkamumo patvirtinimas

„RepoZero“, „RepositoryZero“, patvirtintas projekto handle/domain ir jų prasmingi variantai pavadinime/apraše yra **atrankos signalai**. Paieškos variantų sąrašas versijuotas ir siejamas su tikra projekto tapatybe; kol `@repozero` ar domeno nuosavybė nepatvirtinti, jų nelaikome oficialiu mūsų kanalu. Vien keyword stuffing ar klaidinanti nuoroda automatinio approval nesuteikia.

Triage vertina: tikrą video objektą/kanalą ir viešumą; prasmingą aprašo/paaiškinimo turinį; konkrečią use case/tutorial/review sąsają; susijusius module/release įrodymus kur yra; dublius; klaidingo mūsų ar upstream endorsement riziką ir projekto turinio taisykles. Semantinis modelis pateikia struktūrinę rekomendaciją su matytais šaltiniais ir confidence/unknown, tačiau jis neturi publish/grant teisių. Video/title/description/transcript tekstas yra nepatikima įvestis, negalinti pakeisti jo moderavimo instrukcijų.

Review record fiksuoja `review_basis: metadata_only | authorized_transcript | human_review`, matytų šaltinių snapshot/hash, model/config ir policy revision. Jei matytas tik pavadinimas/aprašas, galima patvirtinti tik **metaduomenimis pagrįstą teminį listing**, ne teigti, kad peržiūrėtas visas video ar patikrintas jo rezultatų teisingumas. Aprašą galima suklastoti; confidence neperrašo šios įrodymo ribos. Katalogas aiškiai rodo tikrinimo pagrindą ir turi report/recheck kelią.

**Auto-publish profilis:** po piloto pakankami patikimi metaduomenys ir aiški teminė sąsaja, nėra neaiškių teisių/autorystės/endorsement ar report signalų, atitinka užfiksuotą turinio politiką ir caps. Missing metadata, nepatvirtintas galimai faktinis claim ar ribinis relevant turinys → review, ne automatinis priėmimas / amžinas ban. Category/description trūkumą galima patikslinti, autoriaus nepriverčiant skelbti reklaminio teksto. Rankinis sprendimas ir apeliacija turi reason/audit.

„My project was accepted“ kategorijos faktinę sąsają su registry patikrina sistema: research candidate nėra integruotas/verified modulis. Neįrodytas acceptance negauna oficialios žymos; kūrėjo nuomonė ar kritinė apžvalga savaime nėra klaidingas claim. **Approved for listing** nėra techninis video teiginių sertifikatas, partnerystė ar viso mūsų produkto endorsement. Jei reklama apmokėta ar medžiaga partnerio, rodomas realus disclosure, ir tai nepagerina organinio balsų skaičiaus.

## 5. Būsenos ir pakartotinės patikros

`submitted → metadata_checked → evaluating → approved → published`; šalutinės būsenos `needs_review`, `rejected`, `duplicate`, `unavailable`, `hidden`, `withdrawn`. Priežastis ir faktinio check laikas išsaugomi. Submit/edit ribos, apskundimas ir sprendimo versija matomi submitter; viešai pateikiami tik tinkami minimalūs duomenys. Katalogo approval ir channel-owner proof turi atskirus records.

Vienam video ID vienas kanoninis įrašas su keliomis submissions nuorodomis/autorystės faktais. Pakeistas URL ar title nekuria antro vote objekto. Tikri reuploads kitu ID negali būti patikimai automatiškai laikomi tuo pačiu video vien iš pavadinimo; similarity gali pasiūlyti review, ne ištrinti teisėtą skirtingą turinį.

Moderation report pririštas prie `video_revision + metadata_snapshot_hash + policy_revision + moderation_generation`. Po edit/recheck/report/hidden/reject/patvirtinto unavailable generation padidėja; publisher CAS taiko tik dabartinį leidžiamą derinį ir būseną. Senas lėtas approve nepublikuoja naujo aprašo ir neatgaivina paslėpto ar panaikinto įrašo. `human_review` nurodo reviewer tipą, ne tai, kad žmogus matė visą video: report atskirai fiksuoja actor ir faktiškai seen_sources/modality bei aprėptį.

Kai pasikeičia viešumas, title/description, embed leidimas, esminis turinys ar projekto statusas, atliekamas recheck. Pradinis siūlomas grafikas: patikra pateikiant, report metu ir kas24h aktyviems/frequently viewed įrašams; likusių peržiūra pagal quota/budget ADR. Tai nėra garantija, kad visada matysime momentinį tiekėjo pakeitimą.

Deleted/private/embedding-disabled patvirtintas faktas sustabdo viešą player ir rekomendavimą pagal politiką, išsaugant minimalų audit/vote ryšį; teisių/revoke report gali slėpti iškart iki review. API timeout, quota exhausted ar vieno regiono negalimumas nėra įrodymas, kad visi video ištrinti. Rodomas `status unknown / last checked`, naudojamas leistinas ribotas cache, backoff ir operatoriaus eilė. Public user gali reportuoti klaidą arba aktualumo problemą; teisėtas report turi kelią ir į žmogų.

## 6. Balsavimas ir katalogo tvarka

Pirmame variante **upvote + atšaukimas**, ne penkių žvaigždučių kokybės sertifikatas. Viena authenticated svetainės paskyra vienam video turi vieną būseną. Tai „viena paskyra“, ne neįrodytas „vienas tikras žmogus“.

DB unikalus `(user_id, video_id)` raktas, server-side session/auth/CSRF ir atominiu būdu keičiamas `active` su monotoniška revision. API priima norimą true/false, ne nepatvarų „toggle“; request retry ir worker outbox replay nesukuria dviejų balsų. Skaitiklis yra DB/event agregatas, ne kliento nurodyta suma. Public counts galima recompute iš autoritetingų eilučių, o kiekvienas keitimas turi idempotency/revision.

Undo nekeičia pirmo balso laiko ir neištrina jo taip, kad recreate duotų „fresh“ vote; saugomas ribotas tam būtinas record/tombstone pagal duomenų politiką. Projection naudoja aggregate revision, todėl vėliau atėjęs senas outbox event negali perrašyti naujos būsenos. Account delete/retention ir tokios minimalios istorijos pagrindas iš anksto apibrėžiamas, ne imituojama amžina asmens tapatybė.

Piloto siūlomos ribos: iki2 submissions per paskyrą per24h, iki2 jos pending submissions ir iki30 vote būsenos pakeitimų per24h; bendri/kanalo/rinkimo limitai pagal pajėgumą. Rate/race ir naujų paskyrų anomalijų kontrolė taikoma server-side; įtartini balsai gali laikinai neįeiti į public rank su audit/appeal. Atskirai pasirinktas friction/challenge tik pagal riziką; nepaprašome visų ID dokumentų vien dėl upvote. Šios priemonės nesuteikia Sybil-free garantijos.

Repo ir video submissions turi bendrą2/account/24h ir2pending intake ribą, ne po atskirą apeinamą kvotą. Kasdienė modelio atranka neįvyksta kiekvienam submit: [globali filtrų ir biudžeto kaskada](INTAKE-AND-BUDGETS.md) numato no-LLM pirmas pakopas, ribotą metadata ir iki10faktinių triage modelio dispatch attempts per24h bendrai repo+video. Pasiekus cap arba eilės talpą rodoma queued/blocked/deferred, ne netikras approval.

Pirma aiški tvarka: „Top7/30/90d“ = aktyvūs, nelaikomi netinkamais upvotes, kurių **pirmo balso** laikas tame lange; „All time“ = visi tokie aktyvūs balsai. Tie-break deterministinis, pvz. published date + canonical ID. Undo/revote nekeičia first-vote laiko, todėl nėra naujo boost vien paspaudus iš naujo. „Newest“ nepriklauso nuo balsų. „Trending“ galima pridėti vėliau pagal paskelbtą versijuotą formulę ir patikras, ne tyliai sukeisti su apmokėtais placement.

Teminiuose/home blokuose galima aiškiai pažymėta redakcinė įvairovė ir kanalo cap; ji nekeičia pilno top sąrašo skaitiklių ar nepanaikina mažų kanalų istorijos. Paid/sponsored įrašai atskirai pažymėti ir negauna nupirktų organic votes. Kūrėjo populiarumas/balsai niekada nesuteikia jo moduliui verified statuso ar auto-merge teisės. Vote API negali keisti registry, release ar finansų.

## 7. Svetainės ir VPS architektūra

Pagrindinė svetainė gali likti statinė, o Video Hub yra jos **dinaminis papildymas**: website identity + server API + atskira loginė PostgreSQL sritis, moderation queue ir public projection. Coordinator užregistruoja jobs, izoliuotas metadata/relevance worker neturi tiesioginės publish/auth/vote DB ar signing paslapčių. Patikimas valdiklis priima jo ribotą report ir vykdo politiką.

Vieši video puslapiai/index gali būti cached/SSG projekcija; balsų ir paskyros veiksmai eina per API. Nereikia redeploy visos svetainės po kiekvieno upvote. Page build/publisher su UGC nevykdo contributor kodo. Public read cache, auth/vote ingest ir media API quota turi atskirus limits, kad viral video nesustabdytų pagrindinio projekto PR/update darbo. DB migrations ir backup/restore laikosi bendrų duomenis išsaugančių vartų.

Modelis gali pasiūlyti kategoriją, trumpą paaiškinimą ir susijusius modules; negali paversti savo rekomendacijos sau suteiktu publish grant ar pridėti balsų. OAuth/provider secrets lieka brokeriui, o vieši puslapiai atskleidžia tik pasirinktą submitter display name, kanalą ir su turiniu susijusius faktus.

## 8. Privatumas, taisyklės ir kūrėjo vertė

Vieši vote totals, kategorijos ir paskelbtas katalogas. **Kas už ką balsavo pagal nutylėjimą neviešinama.** API negrąžina kitų naudotojų balsų/privataus email; galima savo istorija ir jos valdymas. Saugoti tik būtinus account/session/moderation/vote įrašus pagal iš anksto pasirinktą retention/ištrynimo politiką, su minimaliu dedup/abuse pagrindu. Client-reported usage ir vote state yra skirtingi duomenų rinkiniai; sutikimas vienam neįjungia kito.

Community pateikta trečiosios šalies nuoroda nėra leidimas perkelti jų klipą į mūsų reklamą ar apsimesti partneriais. Kūrėjas gauna tikrą source/channel nuorodą, atrandamumą pagal temą, savo pateikimo būseną ir pasirenkamą susijusių recipe kortelių vietą. Su jo pasirinktu sutikimu priimtas video gali patekti į savaitinę kūrėjų kolekciją; submit nepakeičia atskiro email/newsletter/co-promotion pasirinkimo.

Pagrindinės turinio taisyklės, disclosure, report/takedown ir apeliacijos viešos. Priimtina naudinga kritika ir palyginimai, skirtingos kalbos bei maži kanalai. Tuščias keyword spam, impersonation, neleistina medžiaga ar klaidinga oficialaus patvirtinimo žyma neturi auto-publish kelio. Taisyklių ir moderavimo ataskaita pateikia apibendrintus sprendimus, ne privačius gavėjų duomenis.

## 9. Priėmimo vartai ir etapas

- [ ] URL variantai / case-sensitive ID / dublikatai, netinkamas host/redirect/iframe ir playlist/channel atmetimas.
- [ ] Website login/session/CSRF ir channel ownership įrodymai atskiri; neautorizuotas autorius nepakeičia svetimo video ar partnerio statuso.
- [ ] Official metadata/description/captions availability ir quotas patikrintos; missing transcript neperrašomas „video perskaitytas“.
- [ ] Relevant tutorial/use case/review ir naudinga kritika priimami; keyword-only, klaidingas acceptance, instructions-in-description ir fake endorsement nesuteikia approval.
- [ ] Approval/review/appeal/audit ir atskiras public publisher, be agentui atiduoto statuso ar vote pakeitimo.
- [ ] Du requestai/tie patys retry/undo/revote/outbox replay ir worker restart išlaiko vieną paskyros balsą bei teisingą count/window; per-user totals negali pakeisti klientas.
- [ ] Deleted/private/embedding-disabled atvejis teisingai pašalinamas iš rekomendacijų; API outage/quota nepanaikina viso katalogo.
- [ ] Public votes neatskleidžia individualių rinkėjų/email, fraud report ir teisių apeliacija veikia, stats outage neblokuoja produkto.
- [ ] Svetainės static dalis, dinaminė API, cached katalogas, backup/restore ir resource fair-share išbandyti su realiu palaikomu profiliu.

P0M/P1W parengiami modelis, taisyklės ir UI; P2V pilotas pateikia submit→relevance→approval→catalog→vote→recheck ciklą. Svetainė gali startuoti anksčiau su tuščiu sąžiningu Videos vaizdu ir paaiškinimu; demo/fake submissions ar balsai nerodomi kaip tikra bendruomenės veikla. Šiame darbe visų vartų būsena **NOT_RUN**.
