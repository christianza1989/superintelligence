# GitHub prisijungimas ir repo pateikimo portalas

> **Planuojama produkto specifikacija · peržiūrėta 2026-10-17.** Aprašo siekiamą elgesį; schemų pavyzdžiai ir maketai savaime nėra įgyvendintos funkcijos. Daliniai foundation komponentai nekeičia viso vartų statuso. Datuotos įgyvendinimo pastabos žemiau nėra atnaujinta būsenos suvestinė; senos kainų/auth/source prielaidos tikrinamos prieš realų profilį. Dabarties autoritetas: [būsena](IMPLEMENTATION.md), [priimta architektūra](DECISIONS.md), [roadmapas](../ROADMAP.md).

Plano 0.2 papildymas, 2026-10-16. **Naudotojo sprendimas: svetainės prisijungimas per GitHub.** Tas pats svetainės account naudojamas repo paraiškoms, video pateikimui ir upvotes. Tai įgyvendinimo reikalavimas, **ne jau veikianti autentifikacija**; GitHub OAuth/App registracija ir tikri login/API bandymai neatlikti.

## 1. Pirmas contributor kelias

1. Paspaudžia „Sign in with GitHub“, mato pasirinkto realaus GitHub kliento informaciją ir minimalų šiam login reikalingą teisių profilį.
2. Sugrįžta į savo svetainės paskyrą. Ekrane „Submit your repository“ pasirenka savo viešą repo arba įklijuoja jo nuorodą. Organizacijos repo rodomas tik su aiškiai patikrinama priklausomybės/valdymo apimtimi; nematomas repo nevadinamas neegzistuojančiu.
3. Nurodo vieną konkretų gebėjimą / realų darbą, kuo skiriasi nuo rodomų panašių kandidatų ir kokį demo/testą turi. Sistema padeda užpildyti draft iš viešo README, bet gavėjo patvirtinimo nepakeičia išgalvotu AI tekstu.
4. Prieš submit mato viešinamus laukus, savo ryšį su repo, pasirinktą statuso pranešimų kanalą ir faktą, kad pateikimas yra kandidatūra. Marketing/newsletter/video co-promotion pasirinkimai atskiri ir neprivalomi.
5. Gauna paraiškos puslapį: būsena, žinomos spragos, AI/validator paaiškinimas, panašūs moduliai ir konkretus tolesnis veiksmas. Vien `submit` nepaleidžia source tiesiogiai pagrindiniame VPS.
6. Jei kandidatas tinkamas ir eilė/budget leidžia, atskira ribota užduotis kuria adapterį bei įrodymus. Techninės politikos vartus praėjęs release gali būti priimtas ir paskelbtas registry/svetainėje. Jeigu nėra resursų ar būtina išimtis, rodoma tikra eilės/blokavimo priežastis, ne netikras „integruota“.

Pradiniame viešame portale **tik public repo**. Private repo nėra klonuojamas į bendrą discovery ar viešinamas. Jo būsimas įgaliotas vietinis/projekto profilis turi atskirą kelią ir nepaveldi public submission sutikimo.

## 2. Vienas account, trys atskiri veiksmai

| Veiksmas | Ką leidžia pradinis GitHub website login | Ko automatiškai nesuteikia |
|---|---|---|
| Repo paraiška | Susieti submission su mūsų svetainės account ir skaityti leistiną viešą informaciją | Repo failų keitimas, fork/PR, secrets, Actions/workflow/admin ar merge |
| Video submission | Identifikuoti submitter ir saugoti jo paraišką | YouTube kanalo nuosavybės įrodymas ar jo YouTube paskyros valdymas |
| Upvote / undo | Serverio valdoma vieno account/video būsena | Balsai kitų vardu, anoniminio kliento nurodyta suma ar „vienas žmogus“ garantija |

Modelių OpenAI/Claude/OpenRouter/local autentifikacija ir Treg tools yra kiti produkto bindings, o ne svetainės login pakaitalas. GitHub account nepriskiria žmogui esamos Codex sesijos paskyros teisių. Kad prisijungtų prie svetainės, nereikia mokamo AI providerio.

## 3. Kas yra „mano repo“

Tapatybę siejame su patikimu GitHub vartotojo ID, repo – su kanoniniu adresu ir stabiliu repo ID, kai jis gaunamas oficialiu keliu. Username/repo rename nekeičia autorystės vien pagal tekstą; pervadinimai, transfer ir account pasikeitimai apdorojami su patikrintu kilmės ryšiu.

Public repo kortelė gali būti pateikta paties owner, autorizuoto organization maintainer arba pažymėta **community suggestion**. Kiekvienas gali pasiūlyti vertingą viešą repo, tačiau negali dėl to prisistatyti jo savininku. GitHub login ir vien vardas neįrodo org admin/maintainer teisių; jei oficialus dabartinis įrodymas neprieinamas, ownership/role pažymima unverified. Neaiški community submission nepanaikina tikro upstream autoriaus attribution.

Namespace patvirtinimas, maintainer confirmation ir leidimas publikuoti adapterį svetimu vardu turi atskirą tikrinamą pagrindą. Net repo owner patvirtinimas nepakeičia code/weights/data licencijų vartų; ne visi assets priklauso vien repo savininkui. Ownership claim, code acceptance ir reklaminis endorsement yra trys atskiri dalykai.

Tą patį repo pateikus kitam žmogui, paraiška susiejama su kanoniniu kandidatu ir esama darbo rezervacija. Atskirai išlaikomas pasiūlytojo indėlis; nekuriami keli adapterio build darbai vien iš naujų submissions. Tikslingas naujas įrodymas ar release gali inicijuoti naują versioned vertinimą pagal biudžetą. [Panašių modulių ir dublių taisyklės](MODULE-SELECTION.md).

## 4. GitHub auth ir repository prieigos atskyrimas

P0 identity ADR pasirenka oficialų GitHub OAuth/App flow, realią kliento registraciją, callback URL, `state` ir konkretaus metodo palaikomą PKCE / kitą dokumentuotą apsaugą, trumpalaikę serverio session ir account lifecycle. Dabartinė oficiali API/SDK/terms/config patikrinama prieš įgyvendinimą; šiame plane jų nevadiname jau veikiančiomis.

Website login prašo tik būtinos tapatybės informacijos. Public source ir own-public-repo picker nepadaromi priežastimi reikalauti plataus private `repo`, write/admin/workflow ar el. pašto scope. Viešai naudojamas pasirinktas display name/profile; private email nereikia balsavimui. Jei papildomas GitHub API kvietimas reikalauja naujos teisės, ji pagrindžiama konkrečia funkcija, ne numanoma login pasekme.

Jei vėliau reikia automatinio PR į pasirinktą repo ar įgalioto private/local darbo, naudojamas atskiras GitHub App installation / konkretaus veiksmo grant: pasirinkti repo ir minimalios permissions, trumpalaikiai tokenai, atskira audit ir revoke eiga. Contents read neperauga į contents write/PR/merge. Viešo repo nuorodos submit savaime nereikalauja App install; bazinį source vertinimą galima atlikti leistinu public read keliu.

Callback/session/refresh raktai lieka serverio credential brokeriui, ne renderer, modelio prompt, public JSON, logs ar PR. Session slapukai turi patikrintą Secure/HttpOnly/SameSite profilį, mutations CSRF kontrolę, vienareikšmį account binding ir login redirect allowlist. Account switch/login/logout negali sujungti dviejų žmonių paraiškų/balsų pagal vien email ar display name. Disconnect/revoke ir account delete turi aiškiai skirtingą poveikį pasirinktiems repo grants ir istorijai; local logout neapsimeta provider-side revocation.

Website login tapatybė, centrinių discovery worker public read, marketingo PR/email ir trusted release signer yra skirtingi pasitikėjimo kontekstai. Svetimas README ar video description negali ištraukti login token ar vykdyti komandos su coordinator DB/App write teise.

## 5. Ką AI ir tikrintojai daro po submit

| Etapas | Patikra / rezultatas |
|---|---|
| Tapatybė ir kilmė | Kanoninis repo, public status, submitter ryšys, dubliavimas ir upstream/fork istorija |
| Paskirtis ir delta | Konkreti užduotis, esami capability/adapteriai, reikšminga nauda LT/CPU/kainos/kokybės ar kitame profilyje |
| Licencijos / source | README/manifest/license/API, code/model/data sąlygos, tikras pin, dependencies/hooks ir permissions; public GitHub nėra automatinė open-source licencija |
| Adapterio kandidatas | Izoliuota ribota aplinka, vienas bendras kontraktas, mažas peržiūrimas diff ir kilmė; ne kitas globalus scheduler |
| Conformance / realus darbas | Trusted fixtures ir domeno kriterijai, CPU/RAM/VRAM/diskas/kaina, failures/cancel/restart ir izoliavimo testai |
| Priėmimas | Patikimas valdiklis pagal pasirinktą kategorijos politiką arba exception review; agento nuomonė viena nepatvirtina |
| Canary / registry / svetainė | Pasirašytas konkretus modulio leidimas, parengties/source/versijos puslapis, atnaujinimų ir revocation stebėjimas |

Autonominis triage gali priimti/atmesti **kandidatūros tinkamumą vertinti**, tačiau tai nėra automatinis leidimas vykdyti kodą ar universalus techninis acceptance. Vykdomas kodas tik atskiroje patikrintoje lane be svetimų paslapčių. Nuolatinis VPS coordinator tvarko eilę ir statusą; workeriai kviečiami pagal resursų profilį ir cap. Default naujų submissions cap siūlomas2per account per24h ir2pending; bendras central cap/fair share pagal operatoriaus profilį, neturint biudžeto rodoma queued.

Ši submit riba bendra repo+video, ne kiekvienam atskirai. [Intake kaskada](INTAKE-AND-BUDGETS.md) pirma naudoja taisykles, cache ir ribotus oficialius metaduomenis be LLM; globalus pilotinis AI triage cap iki10faktinių dispatch attempts per24h.2000nuorodų nesukelia2000modelio analizių. Aktyvios eilės/bytes/amžiaus ribos ir aiškus deferred-capacity atsakymas saugo nuo neaptarnaujamo backlog; katalogo discovery be skaičiaus lubų nėra neribotos analizės pažadas.

## 6. Paraiškos būsena ir žmogui suprantamas grįžtamasis ryšys

UI kalba: **Pateikta → Tikrinami šaltiniai → Reikia papildymo / Laukia bandymo → Testuojama → Eksperimentinė integracija → Patikrinta integracija**. Alternatyvos: **Dublis / Tinkama kitam profiliui / Atidėta / Atmesta su priežastimi**. Backend turi versioned submission/evaluation records ir atskirus registry/install statusus. „AI patiko repo“ niekada neperrašoma „įdiegta visiems“.

Žmogus mato, kodėl trūksta įrodymų, kokie esami moduliai panašūs ir ką gali pagerinti. Gali papildyti testą/versiją arba pateikti vieną reasoned appeal pagal cap. Atmetimas išlaiko originalų report ir sprendimo datą; naujas evidence neištrina ankstesnio vertinimo. Visos757kandidatų semantinis palyginimas dar neatliktas, todėl sistema negali šiandien deklaruoti baigtos jų atrankos.

Viešas techninis įrašas rodo projekto ir modulių parengtį, upstream attribution ir contributor pasirinktą viešą tapatybę. Nebūtini account/email/metaduomenys neviešinami. Submission status notification pagal pasirinktą funkcijos kanalą atskirtas nuo naujos marketingo kampanijos; atsakymas į statusą nesuteikia neriboto outreach leidimo.

## 7. Priėmimo vartai

- [ ] Tikras GitHub login ir stable account binding, minimalūs scopes, callback/session/account-switch/logout/revoke ir CSRF neigiami testai; jokio token renderer/model/loguose.
- [ ] Own/org public picker, URL paste ir community suggestion nesupainioja ownership; rename/transfer/role-change/neprieinamas permission turi tinkamą būseną.
- [ ] Public source read nevirsta private/write/Admin scope; papildomas App installation/PR veiksmas tik konkrečiame grant, jokio paveldėjimo iš login.
- [ ] Submit→triage→duplicate/delta/license→queued isolated eval→decision→registry scenarijus su baseline ir neigiamu pavyzdžiu, ne vien AI santrauka.
- [ ] Du naudotojai pateikia tą patį repo ir gauna vieną kanoninį kandidatą/darbą, teisingą attribution ir ribotą pakartotinio vertinimo eigą.
- [ ] Malicious README/URL/private source nepasiekia host paslapčių ar public export; grants/caps išlieka po restart.
- [ ] Vienas GitHub account veikia video submission/upvote be YouTube ownership ar modelio paskyrų perėmimo; API kiekvienam veiksmui tikrina session ir išteklių teises.

Įgyvendinimo etapai: P0 identity/contract ADR, P1C account/submit/triage portalas, P3C esamas isolated adapter/evidence/admission. Video specifika [Video Hub plane](VIDEO-HUB.md), modelių ir tool auth [atskirame dokumente](MODELS-AND-TOOLS.md). Visi runtime vartai šiuo metu **NOT_RUN**.
