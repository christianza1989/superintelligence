# Whisper: tikslinė Zero / Jev modulio kvalifikacija

2026-10-22. **PASS ribotai source paieškai ir konkretaus modulio pasirinkimui.** Naudotojui paprašius patikrinta tik Zero pusė. A nekartotas, naujų native pokalbių ir naujos A/B poros nebuvo. [Ankstesnės 0.12.2 planų poros nesėkmė](NATIVE-STUDIODESK-MODULE-REPEAT-2026-10-22.md) išsaugota nepakeista.

## Priežastis ir pataisa

Ankstesnė paieška neatpažino mažosiomis raidėmis rašomo tašku atskirto `whisper.cpp` vardo. AND frazės nuvedė į wrapper ir tutorial repo; tinkamo API vieneto negauta, todėl Jev nebuvo kviestas.

**0.12.3 / schema 1.13.3**, source `94a87e3f71fcfbb472b898c1f28fb7220155cd0e`, keičia tris dalis:

- Bendras dotted name atpažinimas pirmiausia ieško pavadinime ir sujungia tą patį vardą turinčias užklausas. Veikia ir su vardu vėlesnėje frazės vietoje bei raidžių registro variantais; skaitinės versijos nelaikomos vardais. Runtime nėra konkrečių repo savininkų ar užduoties whitelist.
- API atranka pereina visą jau ribotą source failą, atmintyje laikydama daugiausia 12 tinkamesnių deklaracijų. Ankstesnė pirmų 64 parašų riba nebeslepia ilgos antraštės apatinėje dalyje esančios aukštesnio lygio API. Gretimi `//` ir `/* */` komentarai papildo įvesties/išvesties signalus. Subalansuotų skliaustų patikra nebepriima deprecated wrapper fragmentų kaip tikros funkcijos; callback duomenų laukai lieka atskirti.
- Jev gauna iki 12 × 120 deklaracijų simbolių vietoje 6 × 240, su aiškiu `declarationsTruncated`. Simbolių allowance ir 22 000 baitų state riba nedidinami. Pilno modulio pasiūlyme lieka iki 12 × 240 simbolių su exact source kilme.

12 s / 32 request, source failo / receipt baitų ribos, public-only autentifikacija, grant ir pin/hash patikros nepakeistos. Šios heuristikos nėra AST, vykdymo patikra ar garantuota viso GitHub aprėptis.

## Patikros prieš mokamą kvietimą

**149/149** offline transport/source/receipt/client regresijos ir adapters TypeScript PASS. Kontrolės apima canonical upstream prieš wrapper, bendrus `llama.cpp` ir kitus dotted vardus, case dedup, versijų atskyrimą, 80 pagalbinių API prieš tikrą apdorojimo funkciją, callback / annotation klaidas ir vėlesnės deklaracijos patekimą į realiai serializuojamą Jev state. Seni media testai išliko.

Linux savarankiško paketo, jo optional execution HTTP fixture ir Linux/Windows portable transport patikros PASS. Kvalifikuotas **atskirai sugeneruotas 0.12.3 paketas**; globalaus native plugin 0.12.2 diegimas ir nustatymai nekeisti. Tai naujo host įdiegimo ar sesijos acceptance teiginio nesukuria.

Atskiras nemokamas, tik read-only retrieval probe su tais pačiais v9 ASR parametrais per **7,044 s** pirmu kandidatu gavo canonical repo, jo pinned antraštę ir kviečiamas deklaracijas. Paieškos ir source klaidų nebuvo. Probe ir gyvas Jev kelias turi atskirus originalius artefaktus.

## Tikras API / worker / MCP / Jev kelias

Naujas atskiras API/PostgreSQL/Graphile scope ir realus supakuotas MCP išsiuntė **nepakeistą ankstesnio B `zero_discover` argumentų objektą**, patikrintą pagal originalaus transcript ir argumentų SHA. Tikslas, visos trys frazės, LT/EN, PCM/failo įvestis, timestamped JSON, progress/cancel, native Windows/Linux ir CPU/GPU reikalavimai nebuvo susiaurinti pagal žinomą atsakymą. Kandidatai neįterpti rankiniu būdu.

Rezultatas per **13,632 s** grąžintas vienu `zero_discover` su `decision.integrityVerified=true`. Pagrindiniai faktai:

| Rodiklis | Rezultatas |
|---|---|
| Jev pasirinktas repo | `ggml-org/whisper.cpp` |
| Commit | `231638a0717b7822784297e5980965ffcec05810` |
| Konkretus vienetas | `include/whisper.h` |
| Failo SHA-256 | `a7d19f7feb5be52426628ff07e0602de28a30dc4312d0d0603e1e536753f76dd` |
| Tikri Jev dispatch | 1 |
| Reported model | `typesafe/jev-1.13-20260917` |
| Provider kaina | 0,000264768 USD |
| Jev input, tik auditui | 6 304 |
| Jev output, atskirai | 51 |
| Source GET | 32; rate limit ir deadline nepasiekti |
| Source nesėkmės | 0 |

Vardų paieška ir generic fallback davė tris tikrintus pinned repo. Jev po state sutalpinimo svarstė tris konkrečias Whisper sąsajas, o pasirinko pagrindinį upstream. Tai nėra visų GitHub kandidatų ar globaliai geriausio modulio palyginimas.

Pilname pasirinkime išliko 12 tikrų source deklaracijų, tarp jų `whisper_full`, `whisper_full_n_segments`, `whisper_full_get_segment_text`, `whisper_full_get_token_t0` ir `whisper_lang_auto_detect`. [Pasirinktas pinned originalas](https://github.com/ggml-org/whisper.cpp/blob/231638a0717b7822784297e5980965ffcec05810/include/whisper.h). Jev pasirinko source vienetą; bendrą adapterio žingsnių ir patikrų pasiūlymą sudaro Zero iš stebimų faktų bei pateikto poreikio.

Kontroleris papildomai perskaitė ir pilnai SHA patikrino originalų receipt. Iš viso buvo 12 MCP kontrolerio kvietimų: status, discovery ir 10 papildomų artifact puslapių. Tai kvalifikacijos auditas, ne 12 native host planavimo ciklų; papildomas pilnas originalo skaitymas neįtrauktas į 13,632 s sprendimo grąžinimo intervalą. Kitų mokamų modelio kvietimų nebuvo.

## Ką iš tikrųjų patvirtina PASS

Nepriklausoma source peržiūra priėmė pasirinkimą kaip tikrą native transkribavimo sąsajos primityvą. Antraštė viena neįgyvendina viso vartotojo kontrakto. Būtina matching C++ realizacija, ggml, build konfigūracija ir atskirai tinkami modelio svoriai; `prepared`, `runtimeTested`, `licenseApproved` lieka false.

Host adapteriui dar reikia dekoduoti / resamplinti ir tikrinti audio, valdyti modelio bei context lifecycle ir lygiagretumą, konfigūruoti kalbą / timestamps / progress / abort, normalizuoti laiko žymas, klaidas ir atšaukimą į tikrinamą JSON/SRT išvestį. Callback laukų ir visų timestamp semantikų negalima patvirtinti vien trumpa deklaracijų imtimi. Pinned antraštės peržiūra pagrindžia tolesnį integravimo tyrimą, bet elgesiui būtini tikri testai.

Windows/Linux, CPU/GPU, LT/EN kokybė, resursai, licencijų ir modelių platinimas dar nekvalifikuoti. Programos, modeliai ir šis upstream kodas nebuvo diegiami ar vykdomi. Kūrimo pagreitėjimas, kodo kokybė ir naujas natūralus B planas **NOT_RUN**.

Po patikros API/worker ir savas PostgreSQL sustabdyti, scope grant atšauktas. Cumulative USD3 ledger rezervas padidėjo nuo 2,20 iki 2,30 USD, o faktinė šio vieno provider kvietimo kaina nurodyta lentelėje; rezervai neatstatyti. A bandymas nekartotas, jo planas ir tokenai nepakeisti. MVP ir pakartojamos naudos vartai neuždaryti.
