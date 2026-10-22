# StudioDesk: 0.12.2 natūrali planų pora

2026-10-22. **Palyginama planų pora baigta; Zero pranašumas neparodytas.** B pasiekė GitHub source tyrimą, bet konkretaus modulio negavo ir iki Jev modelio neišėjo. Programos nekurtos; sustota žmogaus pilnų planų peržiūrai.

## Kas tiksliai lyginta

Du nauji native Codex desktop pokalbiai, faktinis host profilis **gpt-6-luna / high**, core `0.163.0-alpha.11.1`, eilė **A → B**. Source commit `5f9b8b59149688630e24a82ab5c92cc40e917c9b`, įdiegtas plugin **0.12.2 / schema 1.13.2**. [Tas pats užšaldytas promptas ir SPEC](../../benchmarks/native-studiodesk-plans/v1/README.md); nėra prašymo ieškoti GitHub ar naudoti Zero.

B intervencija: įdiegtas skill/MCP, bendros operatoriaus projekto AGENTS gairės ir atskiras source-only API/PostgreSQL/Graphile scope su leistina vieša GitHub/Jev atranka. A neturėjo Zero startup metadata, instrukcijų ar įrankių; jo projekto konfigūracija tuščia. A įprasta paieška ir bibliotekos leistos. Tai viso papildomo pagalbos paketo, ne vien MCP transporto palyginimas.

Prieš planus atskiri preflight patvirtino abi aplinkas; jie neįtraukti į lentelę. Užfiksuoti 232 source failai, paketas, backend policy/binding, stebėjimo pagalbininkai ir aktualių globalaus TOML nustatymų kanoninis hash. Visas B pradinis katalogas per A vykdymą ir jo rezultato fiksavimą buvo už bendro tėvinio katalogo ribų. Tik po sėkmingo A surinkimo jis atkurtas su identiškais baitais prieš kuriant B pokalbį. Abu pagrindiniai promptai sutampa, abiejų darbo failai nepakito.

Laikas yra originalių `task_started` → `task_complete` įvykių intervalas. Host cache nekontroliuotas, nėra cold-cache ar statistinio kartojamumo teiginio. Ankstesni [izoliacijos ir kontrolerio gedimai](GITHUB-MODULE-RETRIEVAL-2026-10-22.md) išsaugoti ir į šią porą neįtraukti. Šios poros daugiau nebekartota.

## Laikas ir tokenai

| Rodiklis | A be Zero | B su Zero |
|---|---:|---:|
| Planavimas ir tyrimas | 82,184 s | 139,420 s |
| Codex input | 196 658 | 549 871 |
| Iš jų cached input | 174 976 | 493 184 |
| Input be cache | 21 682 | 56 687 |
| Cached dalis input | 89,0 % | 89,7 % |
| Codex output | 7 783 | 9 846 |
| Codex total | 204 441 | 559 717 |
| Modelio atsakymo ciklai | 5 | 13 |
| Zero MCP kvietimai | 0 | 5 |
| Konkrečių modulių pasiūlymai | netaikoma | 0 |
| Jev dispatch / provider USD | 0 / 0 | 0 / 0 |

B planavimas **69,6 % ilgesnis**, host tokenų **2,74 karto daugiau** (+173,8 %). Cached input jau yra input dalis; reasoning yra output poaibis. Net input be cache B yra 2,61 karto didesnis. Host prenumeratos USD be kainos receipt neapskaičiuotas. Naudotojo pasirinkimu Jev input yra audit-only; šiame native bandyme jo 0.

B atliko vieną `zero_status`, tris `zero_search` ir vieną `zero_discover`. Kompaktiškas SHA patikrintas sprendimas perskaitytas tame pačiame discovery atsakyme; papildomų host artifact skaitymų nereikėjo. Originalų receipt vėliau pilnai patikrino atskiras read-only collector, po abiejų planų. Jo darbas neįtrauktas į native planavimo laiką ar tokenus.

13 atsakymo ciklų prieš 5 reiškia daug kartų pakartotą host kontekstą. B paskutinė input imtis buvo 55 823, A 50 447 tokenai, apie 10,7 % skirtumas; sukaupto input skirtumas daug didesnis. Tai rodo ciklų sąnaudų svarbą, bet nėra kontroliuotas kiekvieno įrankio ar skill atskiros kainos išskaidymas. Vien sutrumpinti receipt neužteko.

## Kvalifikacija ir tikras native pasirinkimas skyrėsi

Prieš porą [atskira gyva kvalifikacija](GITHUB-MODULE-RETRIEVAL-2026-10-22.md#gyvas-0122-modulio-pasirinkimas) per 16,731 s ir vieną Jev kvietimą pasirinko tikrą MLT `src/mlt++/MltMultitrack.h` takelių komponavimo sąsają su exact pin ir failo SHA. Provider kaina 0,000243054 USD; 5 787 input ir 59 output. Nepriklausoma peržiūra priėmė ribotą komponavimo primityvą, ne visą render engine ar išbandytą integraciją. Šis atskiras tyrimas nėra B plano pasirinkimas ar poros sąnaudos.

Natūralus B pasirinko tirti kitą poreikį: **vietinį LT/EN transkribavimą su timestamp, progresu ir atšaukimu C++ aplinkoje**. Prašė trijų frazių:

- `whisper.cpp offline transcription library`
- `local Lithuanian speech recognition C++ timestamps`
- `whisper.cpp API streaming cancellation`

Užfiksuoti penki HTTP search rezultatai ir 21 sutapęs repo. Tik trys pasiekė pinned failų skaitymą: Go inference/server projektas, Android JNI wrapper ir senas LT PocketSphinx tutorial. Išnaudota 32 request riba ir 12 s tyrimo terminas; rate limit nepasiektas, likusių dviejų apžiūrų nesėkmės išsaugotos. Backend etapas truko 12,194 s.

`whisper.cpp` negavo name-anchor paieškos: dabartinė taisyklė atpažįsta acronym / mixed-case vardus, o mažosiomis raidėmis rašomo tašku atskirto vardo neatpažino. Pilna AND frazė grąžino vieną wrapper, sumažinta `whisper.cpp API` užklausa ir `Lithuanian speech` pateikė platesnius rezultatus. Kanoninis `ggml-org/whisper.cpp` nepasiekė tikrintų kandidatų. Skaitytas Go CLI įėjimas, JNI realizacija ir tutorial skriptai nepateikė atrankai atpažįstamos, poreikį atitinkančios modulinės sąsajos.

Galutinis originalas: `selection.status=missing`, `reason=no_inspected_module_interface`, `inspectedModules=[]`, `dispatchAttempts=0`. **Tai retrieval ir API įrodymų spraga prieš Jev, ne Jev atsisakymas iš gerų kandidatų.** MCP transporto klaidų 0; terminalinis abstention nėra sėkminga atranka. B skaitė tikrą sprendimą ir neišgalvojo pasirinkto modulio.

## Planų kokybinė peržiūra

Abu planai savarankiškai pasiūlė Qt/C++, MLT/FFmpeg, savo kanoninį laiko juostos modelį ir adapterį. A šią kryptį rado be Zero. B nepateikė papildomo pinned API ar konkretaus modulio integravimo žemėlapio.

- A siūlo Qt Widgets/C++20 ir projekto SQLite; B — QML/C++ ir versijuotą `project.json` su atskiru SQLite bibliotekos indeksu. Tai alternatyvos, kurių laimėtojas šiame bandyme nematuotas.
- Abu apima didžiąją dalį SPEC srautų, rational time, atkūrimą, pasirenkamus vietinius AI modelius ir būsimas patikras. B konkrečiau mini archyvo symlink / expansion ratio ir darbų įvesčių/išvesčių hash; A konkrečiau aptaria to paties projekto konfliktus, VFR ir platformų medijos build riziką.
- **B didžioji plano dalis po lietuviškos įžangos parašyta mongolų kalba.** A taip pat turi vieną sugadintą mišrių kalbų pastraipą, tačiau likęs planas lietuviškas. Šiam naudotojui A yra geriau perskaitomas. Šios vienos poros kalbos gedimas neįrodo, kad jį sukėlė Zero.
- Abiem lieka konkretūs image AI / TTS modeliai ir balsai, faktinės CPU/RAM/disko ribos, patikrinta build/dependency/codec ir licencijų visuma. Nei vienas planas nėra patikrintas įgyvendinimas.

Kodo kokybė, realus modulio iškvietimas, eksportų atitiktis ir kūrimo pagreitėjimas **NOT_RUN**: tolesnis kūrimas laukia žmogaus planų peržiūros. Didesnis B tokenų kiekis ar šaltinio hash nėra geresnės architektūros įrodymas.

## Ką rezultatas keičia

Paieškos pataisa ir atskira MLT kvalifikacija veikia savo patikrintoje apimtyje, tačiau natūralaus darbo nauda dar nepasiekta. Kitas taisymo taikinys yra bendras mažosiomis raidėmis / skyryba rašomų repo tapatybės atkūrimas, kanoninių bibliotekų ir adapterių atskyrimas prieš ribotą apžiūrą, API įėjimo taškų aprėptis bei mažesnis host valdymo ciklų skaičius. Tai būsimas pakeitimas, ne šiame bandyme jau veikianti funkcija. Negalima įrašyti šios užduoties atsakymų ar konkrečių repo whitelist į bendrą vartotojo promptą.

Originalūs abu planai, transcript, freeze, nesėkmių istorija ir visi receipt išsaugoti vietiniuose artefaktuose. API/worker ir savas PostgreSQL sustabdyti, scope grant atšauktas, atkurtas tik laikinai pakeistas globalus Zero plugin nustatymas. Konservatyvūs ankstesnio USD3 ledger rezervai neatstatyti; native poroje naujų mokamų kvietimų nebuvo. MVP ir pakartojamos naudos vartai neuždaryti.
