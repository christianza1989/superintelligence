# StudioDesk: 0.11.1 modulių planavimo pora

**Rezultatas nepatvirtino StudioDesk modulių atrankos ar kūrimo naudos.** Naujas MCP kelias grąžino vieną pilnai hash patikrintą sprendimą be host polling/artifact ciklų, bet GitHub užklausos nerado kandidatų. Todėl native poroje **Jev dispatch 0, source pins 0, modulių pasiūlymų 0**. Tai ne Jev priimtas kandidatų netinkamumo sprendimas: modelis nebuvo iškviestas. Ankstesnė [atskira PapaParse kvalifikacija](MODULE-PLANNING-2026-10-22.md) patvirtina ribotą tikrą pasiūlymo kelią, tačiau jos rezultatas nepriskiriamas šiai porai.

## Užfiksuotos sąlygos

Du nauji native Codex pokalbiai, vienodi originalūs [StudioDesk SPEC ir prompt](../../benchmarks/native-studiodesk-plans/v1/README.md) baitai, be užuominų apie GitHub, Zero ar reuse. Faktiniai abiejų `turn_context`: `gpt-6-luna` / high; core 0.163.0-alpha.11.1. Eilė **A → B**. Atskiros naujos preflight sesijos patvirtino A be Zero metadata/gairių ir B su 0.11.1 / schema 1.12.1, įdiegtu skill, bendromis operatoriaus AGENTS gairėmis ir scoped public-only GitHub/Jev profiliu.

Source commit `46610461f551401d0961b2a20322e3442104d847`, 232 source failų, visas įdiegtas paketas, backend policy/binding ir collector užfiksuoti prieš pirmą planą. Jų hash ir abiejų starter failai išliko nepakitę per capture. Pataisų poros viduje nedaryta. A neturėjo prieigos prie B projekto. Naujas backend turėjo 0 ankstesnių kvalifikacijos darbų; controller nepateikė source ar mokamų užduočių. Programos nekurtos, priklausomybės ar AI modeliai neįdiegti.

## Faktiniai planavimo rodikliai

| Rodiklis | A be Zero | B su Zero |
|---|---:|---:|
| Visas native planavimo turn | 113.930 s | 119.042 s |
| Codex input | 515,574 | 622,484 |
| Cached input, jau įtrauktas | 459,264 | 555,776 |
| Uncached input | 56,310 | 66,708 |
| Codex output | 11,526 | 9,863 |
| Reasoning, output poaibis | 4,563 | 3,372 |
| Codex total | 527,100 | 632,347 |
| Modelio atsakymo usage įrašai | 11 | 13 |
| Zero MCP bandymai | 0 | 4 |
| Jev kvietimai / provider USD | 0 / 0 | 0 / 0 |

B laikas +4.5 %, total +20.0 %, uncached input +18.5 %. Cached dalys 89.1 % ir 89.3 %. Output B mažiau, bet viso host USD iš prenumeratos nežinomas; suminių tokenų santykis nėra kainos santykis. Jev input naudotojo pasirinkimu neįtraukiamas į pagrindinį palyginimą; šioje poroje jo ir output yra 0.

Ankstesnė [0.10.5 pora](NATIVE-STUDIODESK-PLANS-2026-10-22.md) turėjo B 57 MCP kvietimus ir 30 modelio atsakymų. Dabar B 4 MCP bandymai ir 13 atsakymų, bet nauja atranka atliko gerokai mažiau source darbo: kandidatų nerasta, Jev nekviestas. Skyrėsi versija, tvarka ir planų apimtis, todėl to negalima laikyti kontroliuotu naudingo reuse pagreitėjimo matavimu.

## Kur sustojo atranka

B atliko `zero_status`, vieną bendrą `zero_search` ir du `zero_discover` bandymus. Pirmas discovery atmestas schemos lygmeniu: dvi paieškos frazės viršijo penkių žodžių ribą. Bendras SDK klaidos atsakymas išsaugotas. Antra užklausa korektiškai aprašė vieną montažo/peržiūros/eksporto variklio įvesties ir išvesties sąsają, naudojo trumpesnes frazes ir `waitMs: 20000`.

Tačiau net ir šios frazės buvo ilgos AND kombinacijos: `MLT timeline renderer desktop editor`, `GStreamer media editing render pipeline`, `FFmpeg timeline render library`. Serveris du kartus atliko numatytą deployment žodžių pašalinimą, bet liko per daug reikalavimų vienoje paieškoje. Penki GitHub HTTP atsakymai grąžino 0 kandidatų; du pažymėti `incomplete: true`. Rate-limit, grant ar research deadline nesėkmės nebuvo. Tai ne įrodymas, kad tinkami MLT, GStreamer ar kiti komponentai neegzistuoja.

Vienas durable job baigėsi `phase: module-proposed`, state `abstained`, selection `missing/no_inspected_module_interface`. B tame pačiame discovery kvietime gavo ir perskaitė SHA patikrintą `decision`; papildomų job ar artifact kvietimų nereikėjo. Observer vėliau atskirai perskaitė ir pilnai patikrino tą patį vienintelį originalų receipt. **4 yra host MCP bandymai, 5 — atskiros vidinės GitHub HTTP užklausos.**

Ši native nesėkmė išlieka rezultatu. Paieškos, skill ar checker nekeisti jai vykstant, papildoma pora be žmogaus planų peržiūros nepaleista. Aiškus likęs apribojimas: serveris dar nepaverčia pilnų AND frazių į savarankiškus gebėjimo terminus ir neatlieka atskiro įvardyto repo tapatybės išsprendimo. Deployment žodžių pašalinimo vieno nepakanka. Bounded kandidatų gavimą reikia sustiprinti prieš kitą full-source/Jev naudos tyrimą.

## Planų peržiūra

A siūlo Tauri/React/TypeScript/Rust, projekto SQLite ir FFmpeg; pateikia daugiau AI vykdiklių kandidatų, įskaitant `whisper.cpp`, `stable-diffusion.cpp` ir lietuviško balso galimybę. B siūlo Qt Quick/QML/C++, projekto JSON su atskiru SQLite indeksu ir tipuotą FFmpeg grafų kompiliatorių. B įkelia bendrą undo/autosave/recovery į ankstyvą trečią etapą; A undo pateikia penktame etape, nors duomenų modelyje istoriją numato anksčiau. A turi tikslesnį SQLite/WAL backup aprašą ir platesnį priėmimo scenarijų sąrašą; jo originale išliko nelietuviškas fragmentas. Planų originalai netaisyti.

Abu apima klipus/sluoksnius, tikslią laiko bazę, originalų išlaikymą, atsargines kopijas, atominius eksportus, nepatikimus archyvus/SVG ir atskirai įjungiamus vietinius AI. Nei kvalifikuotas sluoksnių kompozitorius, nei preview/export atitiktis, resursų ribų faktinis vykdymas ir LT modelių kokybė neįrodyti. B pats aiškiai paliko Zero komponentą nepasirinktą. Jo Qt/FFmpeg sprendimas nėra sėkmingos Zero/Jev atrankos rezultatas.

Skirtingos architektūros savaime nenustato kokybės laimėtojo. Kodo, integravimo, realaus komponento iškvietimo ir viso kūrimo testai NOT_RUN. Naujas laukimas ir kompaktiškas sprendimas sumažino host valdymo ciklų poreikį, tačiau šioje užduotyje nesukūrė pernaudojimo vertės.

## Sustojimas

Abu darbo aplankai liko nepakitę. Visi ankstesni bandymai, nesėkmės, promptai ir hash išsaugoti. Bandymo API, Graphile worker ir tik šiam fixture priklausantis PostgreSQL sustabdyti, grant atšauktas; host valdomi kitų pokalbių MCP procesai masiškai nestabdyti.

Kumuliacinis papildomas USD3 ledger išlaiko USD2.00 rezervą per 20 invocations; tai ne provider nurašyta suma. Ši native pora rezervo nepridėjo ir provider sąnaudų neturėjo. Senasis USD1 biudžetas nepakeistas. Sustota po abiejų planų žmogaus peržiūrai; MVP ar pakartojamos naudos vartai neuždaromi.
