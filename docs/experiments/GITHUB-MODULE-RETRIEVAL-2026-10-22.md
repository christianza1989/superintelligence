# GitHub ir native modulių atrankos pataisa

2026-10-22, source / įdiegtas plugin **0.12.1, schema 1.13.1**. Tai development kvalifikacija prieš naują StudioDesk planų porą; ne programos integravimo ar kūrimo naudos įrodymas.

## Priežastis ir pakeitimas

Ankstesnė [0.11.1 pora](NATIVE-STUDIODESK-MODULE-PLANS-2026-10-22.md) negavo kandidatų. Reikalavimų frazės buvo jungiamos kaip privalomi GitHub raktažodžiai, o ilgesnės nei penkių žodžių frazės atmetamos. Paieškos tuštuma nebuvo Jev atsisakymas: modelis nebuvo kviestas.

[Dabartinis kelias](../MCP-MODULE-PLANNING.md) išsaugo pirminį poreikį, atpažintą projekto vardą pirmiausia ieško pavadinime, ribotai keičia nepakankamą užklausą ir sujungia vienodus HTTP search. Iki trijų repo tikrinami lygiagrečiai, todėl didelis pirmas repo neišstumia kitų. Modulio režimas skaito pinned root ir iki trijų aktualių submedžių, tada prioritetą teikia tikram kodui. Visas medis ar closure nepatvirtinamas. Viešumas, grant, tikslios tree/blob tapatybės, DNS/HTTPS, 12 s / 32 request / byte ribos lieka.

Native antraščių prototipai ir vieši C++ metodai tampa stebimais API faktais. Callback laukai nevadinami funkcijomis. Kelių parinkimas naudoja atskirus žodžius ir viešų įėjimo taškų heuristiką; `render` nebesutampa su `brender`, gramatiniai žodžiai neparankina katalogų. Jev shortlist pirmiausia apima skirtingus repo. Nėra StudioDesk ar atskirų projektų whitelist kode.

## Patikros prieš Jev

- **137/137** transporto, paieškos, modulio, receipt ir kliento offline kontrolės PASS.
- **36/36** tikros API/PostgreSQL/Graphile kontrolės su offline provider PASS; savas PostgreSQL sustabdytas.
- Adapters TypeScript ir Linux/Windows savarankiško paketo patikros PASS. 0.12.1 įdiegtas oficialia plugin CLI; native švaraus pokalbio patikra atskira.
- Gyva vienodų buvusių media frazių retrieval patikra per **7,228 s** atliko 3 search, perskaitė FFmpeg, GStreamer ir MLT pins bei aptiko du API vienetus: FFmpeg `libavcodec/avcodec.h`, MLT `src/mlt++/MltAnimation.h`. GStreamer aprėptis liko dalinė; šis faktas nėra jo modulio kvalifikacija. Dvi žemesnio rango repo apžiūros pasiekė bendrą request ribą; nesėkmės išsaugotos.

Trys ankstesni šios development iteracijos probe išsaugoti: atkurtos repo tapatybės, bet dar negauti moduliai; pirmų repo deadline išstūmė kitus; dalis API vietų buvo callback laukai. Jų rezultatai neperrašyti į PASS. Mokamų Jev kvietimų šiuose keturiuose tiesioginės paieškos probe buvo **0**. Tinkama repo tapatybė ar aptikta deklaracija dar nepatvirtina konkretaus vartotojo poreikio.

## Likę šios užduoties vartai

Pirmame šio įrašo commit gyva Jev patikra dar laukė. Vėlesnė **0.12.1** API/worker kontrolė per **23,428 s** gavo tris pinned repo, bet Jev grąžino `abstained / insufficient_module_fit_evidence`. Jo pasirinkimuose buvo tik `avcodec.h` ir `MltAnimation.h`; tai ne įrodymas, kad repo netinka, ir ne sėkmingas laiko juostos modulio pasirinkimas. Vienas tikras Jev kvietimas: 3 332 input / 44 output, **0,000139944 USD** provider usage. Ankstyva kontrolerio readiness klaida turėjo 0 MCP / 0 mokamų kvietimų. Abu originalai išsaugoti, backend sustabdytas ir grant atšauktas.

Nustatyta papildoma priežastis: failų rikiavimas gaudavo paieškos frazes, bet ne jau perduotą modulio įvesties/išvesties poreikį. Viešos bendros antraštės importai taip pat nebuvo panaudoti konkrečiai sąsajai pasiekti. Vien repo paieškos pataisos nepakako; natūrali pora nepradėta.

Tik po tikro Jev pasirinkimo ir semantinės peržiūros leidžiama nauja natūrali StudioDesk A/B pora su nepakeistu promptu ir SPEC, sustojant po planų žmogaus peržiūrai. Cumulative mokamo profilio biudžetas neatstatomas; Jev input paliekamas auditui, bet neįtraukiamas į pagrindinį Codex tokenų palyginimą.

## 0.12.2: tikras poreikis pasiekia failų ir API atranką

Source ir įdiegtas paketas **0.12.2 / schema 1.13.2** perduoda `module.inputs/outputs` kelių rikiavimui bei deklaracijų imčiai. Tuščios bendros antraštės atveju leidžiama sekti jos realius santykinius importus į jau stebimą pinned medį; nėra naujo mokamo modelio etapo ar projekto vardų taisyklių. Named build konfigūracijų eksportai nebevadinami runtime moduliais.

**141/141** offline kontrolės, **36/36** tikros API/PG/worker kontrolės su offline provider, TypeScript ir Linux/Windows paketas PASS. Nauja tiesioginė kontrolė per **11,610 s** rado `TimelineModel.h` su tikromis `trim_clip_in/out`, `insert_clip`, perėjimų ir takelių deklaracijomis bei susijusią transition antraštę. Pirminės vardų paieškos šiame probe nutrūko; išsaugotos jų nesėkmės ir konkrečios atsarginės užklausos. Tai tinkamumo tyrimo įrodymai, ne garantuotas API elgesys ar licencijų patvirtinimas. Gyvas Jev pakartojimas šio papildymo commit metu dar laukia.

## Gyvas 0.12.2 modulio pasirinkimas

Vėlesnė atskira API/PostgreSQL/Graphile/įdiegto MCP kontrolė **PASS**: per **16,731 s** gauti trys pinned repo, tikras Jev pasirinko `mltframework/mlt` **8f605c9486d8c1d0f8283d9baf5e94592a10bd6c**, **src/mlt++/MltMultitrack.h**, failo SHA-256 **62a0461911dca62900a8ec54ef305899183b995491c9c3bbdbffe8b4cd0e1526**. Vienas `zero_discover` jau turėjo SHA patikrintą trumpą sprendimą; dar aštuoni kontrolerio artifact puslapių skaitymai papildomai patikrino visą originalą ir nėra native host planavimo sąnaudos. Source tyrimas išnaudojo 32 GET ribą, deadline nepasiekė, dalinė aprėptis ir likusių skaitymų nesėkmės išsaugotos.

Vienas realus Jev dispatch, reported `typesafe/jev-1.13-20260917`: 5 787 input / 59 output, **0,000243054 USD**. Jo input yra audit-only. Tai nepriklausoma kontrolė, ne A/B poros darbas. Abiejų mokamų kontrolinių bandymų faktinė kaina **0,000382998 USD**, konservatyvūs ledger holds išlieka atskiri ir neatstatyti.

Nepriklausoma source peržiūra priėmė šį C++ vienetą kaip takelių komponavimo primityvą: `connect/insert/disconnect`, `track/count` ir `refresh` su tikromis source pastabomis apie track tvarką, borrowed pointer ownership ir trukmės atnaujinimą. Tai **ne** visas render engine ar izoliuotai nukopijuojama antraštė. Trim, transitions, preview frames ir eksportas dar neįrodyti; būtinas Producer lifecycle / ID / būsenos host adapteris, matching MLT++/framework realizacijos, generated config, build ir licencijų closure. `prepared`, `runtimeTested`, `licenseApproved` lieka false. Repo primary-language metadata C nepaverčia šios C++ sąsajos C API.

Kontrolinis backend sustabdytas ir grant atšauktas. Natūrali pora pradedama atskirame švariame scope tik po šios kontrolės, be užuominų bendrame vartotojo prompte ir sustojant po planų.

## Išsaugotas baseline izoliacijos gedimas

Pirma po šios kvalifikacijos pradėta native A sesija netiko palyginimui: išjungtas plugin ir švari startup metadata neapsaugojo nuo modelio `Get-ChildItem .. -Recurse`. Jis perskaitė gretimo B projekto AGENTS ir vėliau įdiegtą Zero skill. A galutinis planas netgi minėjo išjungtą Zero. Originalas išsaugotas kaip užterštas bandymas; B main nepradėtas, neskaičiuojamas laimėtojas. Modelis Luna/high, 139,040 s, 756 745 host tokenai; Zero/Jev kvietimų 0. Backend sustabdytas ir grant atšauktas.

Kartojimo izoliacijos protokolas: A neturi Zero vardų ar komandų savo projekto konfigūracijoje; tik šio plugin globalus enabled laikinai išjungiamas, o B turi atskirą aiškų projekto opt-in. B frozen pradinis katalogas fiziškai neprieinamas A tėvinio medžio peržiūrai, kol A baigia; tie patys B failų baitai atkuriami prieš naują B sesiją. Konfigūracijos būsena, slėpimo/atkūrimo momentai ir hash įtraukiami į private freeze. Po poros atkuriamas tik pakeistas globalus plugin enabled, išsaugant kitus nustatymus. Tai bandymo kontrolė, ne bendras OS sandbox ar garantija prieš tyčinį viso disko skaitymą. Vartotojo promptas, SPEC, modelis ir source kodas nekeičiami.
