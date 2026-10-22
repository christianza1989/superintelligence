# StudioDesk: tik B pakartojimas su įdiegta 0.12.3

2026-10-22. **0.12.3 įdiegta, vienas naujas švarus native B planas baigtas. A nekartotas ir nepakeistas.** Konkrečių modulių B nepasirinko, nauda neparodyta. Sustota po plano žmogaus peržiūrai; programa nekurta.

## Eiga ir palyginimo riba

Naudota ta pati užšaldyta [StudioDesk specifikacija ir promptas](../../benchmarks/native-studiodesk-plans/v1/README.md), be GitHub, Zero ar žinomų kandidatų užuominų. Išsaugoto [v9 A](NATIVE-STUDIODESK-MODULE-REPEAT-2026-10-22.md) originalūs plano, transcript ir usage baitai patikrinti hash; jo projekto failai nepakeisti. Abu actual host profiliai `gpt-6-luna / high`, core `0.163.0-alpha.11.1`.

Tai **naujas B prieš istorinį A**, ne nauja kontroliuota pora. Bandymo momentas, cache, eilė ir Zero versija skiriasi. Santykiai aprašo rodmenis, o ne įrodo priežastinį pataisos poveikį ar pakartojamą pagreitėjimą.

Patikrintas 0.12.3 paketas įdiegtas per oficialią Codex CLI: pakeista tik savo vietinio marketplace nuoroda ir atliktas `plugin add`; senas paketas išsaugotas. [Oficialus marketplace kelias](https://developers.openai.com/plugins/build/plugins). Įdiegto cache bundle hash sutampa su kvalifikuotu paketu. Nauja atskira B preflight sesija patvirtino skill, serverį **0.12.3 / schema 1.13.3**, veikiantį public GitHub ir mokamą source atrankos leidimą.

Ankstesnis B katalogas išsaugotas, naujam nukopijuoti tik tie patys SPEC ir bendrų operatoriaus AGENTS gairių baitai bei nauja scoped konfigūracija. Kontrolinės Whisper atrankos rezultatas modeliui nepateiktas. Prieš pagrindinę sesiją užfiksuoti 232 source failai, įdiegtas paketas, backend policy/binding, runtime/collector pagalbininkai, aktualių globalių TOML nustatymų projekcija ir A originalai. Poros promptas ir source kodas vykdymo metu nekeisti. A/B darbo failų vientisumas patikrintas po B.

## Rodmenys

| Rodiklis | Išsaugotas A be Zero | Naujas B su Zero 0.12.3 |
|---|---:|---:|
| Planavimas ir tyrimas | 82,184 s | 109,874 s |
| Codex input | 196 658 | 422 390 |
| Iš jų cached | 174 976 | 389 376 |
| Input be cache | 21 682 | 33 014 |
| Cached dalis input | 89,0 % | 92,2 % |
| Codex output | 7 783 | 8 883 |
| Codex total | 204 441 | 431 273 |
| Modelio atsakymo ciklai | 5 | 10 |
| Zero MCP kvietimai | 0 | 10, įskaitant vieną atmestą |
| Jev dispatch | 0 | 1 |
| Konkrečių modulių pasiūlymai / panaudojimas | netaikoma | 0 / 0 |

B rodmenys: **33,7 % daugiau laiko**, **2,11 karto daugiau host tokenų** nei istorinio A. Cached input jau įtrauktas į input; reasoning yra output poaibis. Cache nekontroliuotas, host prenumeratos USD nežinomas. Laikas skaičiuotas iš originalių `task_started` → `task_complete`, be preflight ir vėlesnio observer darbo.

Vienas realus Jev kvietimas, reported `typesafe/jev-1.13-20260917`: **0,000156744 USD**, 3 732 input tik auditui ir 44 output atskirai nuo Codex. Ankstesnė tikslinė Whisper kontrolė į šio B kainą neįtraukta. Cumulative USD3 konservatyvus rezervas padidėjo nuo 2,30 iki 2,40 USD; rezervas nėra faktinė provider kaina ir neatstatytas.

## Kas įvyko atrankoje

B pats pasirinko tirti bendrą vaizdo / garso peržiūros ir eksporto grandinę. **Whisper užklausos šiame plane nebuvo.** Atskirai [teigiamai kvalifikuotas Whisper kelias](WHISPER-MODULE-QUALIFICATION-2026-10-22.md) todėl nepatvirtina šio natūralaus B pasirinkimo.

Atliktas vienas `zero_status`, septyni `zero_search` ir du `zero_discover` bandymai. Pirmo discovery užklausos eilutė turėjo 106 simbolius, viršijo 80 ribą ir buvo atmesta iki job ar mokamo kvietimo. Modelis pats pataisė pateiktį. Antras discovery sukūrė vienintelį darbą ir tame pačiame atsakyme pateikė SHA patikrintą terminalinį sprendimą; host papildomai neskaitė raw artifact puslapių.

Galiojančios frazės buvo bendrinės: `cross-platform offline audio video timeline preview renderer export library` ir `desktop media pipeline synchronized playback and export engine`. Užfiksuoti trys HTTP search, 11 repo sutapimų, trys pinned repo apžiūros ir 32 GET. Terminas / rate limit nepasiekti; viena code apžiūra pasiekė resource ribą. Tarp kandidatų pateko su medijos apdorojimu nesusijęs .NET mediator, o canonical MLT ar FFmpeg tikrintoje imtyje nebuvo.

Jev iš tiesų svarstė du konkrečius vienetus: `MDIsmatullah/CuteCut-Pro:run_renderer_test.py` ir `BreakingY/Media-Cognition-Pipeline:Media/MediaCommon/AAC.h`. Nepriklausoma peržiūra juos įvertino kaip renderer test harness ir AAC/ADTS pagalbines funkcijas, nepagrindžiančias prašomo bendro laiko juostos variklio. Grąžinta `abstained / insufficient_module_fit_evidence`. Tai **tikras Jev susilaikymas**, skirtingai nuo v9, kuriame modelis nebuvo pasiektas.

B perskaitė tikrą terminalinį sprendimą ir galutiniame plane sąžiningai nurodė, kad konkretaus modulio nepasiūlyta. Vėlesnis read-only collector patikrino viso originalaus receipt SHA. Šio audito API skaitymai nėra native modelio planavimo ciklai.

## Planų kokybė ir išvada

Abu planai apima Qt/C++, projekto būseną, rational time, undo/redo, vietinį veikimą, pasirenkamus AI modelius ir būsimas priėmimo patikras. Naujas B aiškiai numato nekintamą projekto snapshot eksportui ir failų / checksum / dublikatų kontrolę; pastarąsias patikras turi ir A. Tačiau istorinis A jau pasiūlė MLT + FFmpeg ir ankstyvą Windows/Linux vertikalų prototipą; B palieka neapibrėžtą savo FFmpeg pagrįstą bendrą laiko juostos komponavimo sluoksnį. Papildomo konkretaus reuse integravimo plano B nepateikė.

Naujas B daugiausia lietuviškas, bet archyvavimo sraute liko vienas mongoliškas fragmentas. Istorinis A taip pat turi vieną sugadintą mišrių kalbų pastraipą. Kalbos ar architektūros skirtumų negalima šiuo palyginimu priskirti Zero pataisai. Abiem dar lieka konkretūs AI modeliai / balsai, išteklių ribos ir build, dependency, codec bei licencijų patikros.

Įdiegimas ir natūralus Zero/Jev kvietimas patvirtinti. Tinkamas modulis, jo integravimas, actual use, kodo kokybė ir viso kūrimo nauda **nepatvirtinti**. Dabar matoma silpnoji vieta yra bendrinio gebėjimo pavertimas tinkamais repo ir API kandidatais; teisinga žinomo dotted vardo paieška šios problemos visai neišsprendžia. Po plano naujų pataisų ar bandymų nepradėta.

Originalūs A/B planai, transcript, prompto / failų freeze ir visos nesėkmės išsaugoti. API/worker ir savas PostgreSQL sustabdyti, scope grant atšauktas. Įdiegtas 0.12.3 papildinys paliktas; MVP ir naudos vartai neuždaryti.
