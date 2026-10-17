# RepositoryZero MVP roadmapas


Aktualūs faktai, komandos ir neužbaigti vartai: [įgyvendinimo būsena](docs/IMPLEMENTATION.md). Pirmas [patvarių baigtinių rezervų pjūvis](docs/BUDGET-FOUNDATION.md) išbandytas atskirai; pilno account/modelių brokerio vartų tai neuždaro. Rakazo adaptacija pasirinkta įgyvendinimui; pilnas backend/live-model acceptance dar laukia.
2026-10-16. Tai atskiras mažo veikiančio produkto kelias, išvestas iš [viso roadmapo](ROADMAP.md). **Dabar: pirmas MVP UI/svetainės pjūvis įgyvendintas; norminiai produkto vykdymo vartai dar nepriimti.** Šis dokumentas nesuteikia naujų teisių, nekeičia techninių vartų ir nežada naujo termino. Bendras produkto paaiškinimas [V1 dokumentacijoje](docs/PROJECT-V1.md).

## 1. Koks yra pirmas mažas MVP

**Vienas veikiantis vietinis branduolys su vienu pasirinktu pagrindiniu modeliu, Jev routeriu per naudotojo OpenRouter ir trimis pradiniais gebėjimais: browser/research, PDF lentelės ir ribotas kodo/testų ciklas.** Jev parenka iš riboto tinkamų tools sąrašo; pagrindinis užduoties modelis generuoja/kuria ir yra atskira funkcija. Žmogus pateikia užduotį, mato realius veiksmus, gauna failą ar diff ir atskirą rezultato patikrą. Klaida, cancel ir restart nepraranda autoritetingos būsenos ar aklai nepakartoja išorinio veiksmo.

Tai **vidinis techninis MVP**, skirtas įrodyti darbo ciklą prieš plečiant produktą. Jis nėra visos vizijos ar viešos beta užbaigimas. REA ir Treg išlieka privalomi planuojami produkto etapai; jų nepašaliname dėl šio mažesnio pirmo pjūvio.

Pradinė mokama masinė viešų kandidatų atranka: **0**. Portalas/katalogas gali turėti source-only ir queued/deferred būsenas, o mokami triage kvietimai neįjungiami be skirtų realių lėšų ir baigtinio cap. Naudotojas atskirai pasirinko **MVP Jev/OpenRouter routing** ir įgyvendinimo metu pateiks secret; jam būtinas atskiras baigtinis routing ir bendras account spend rezervas. Pagrindinio generuojančio modelio profilis pasirenkamas atskirai pagal turimą paskyrą/resursus. Fake modelis tinka infrastruktūros testams, bet ne produkto/routerio kokybės įrodymui.

## 2. M0 — pasirinkti vieną bazę ir užrakinti bandymo sąlygas

- [ ] Palyginti Rakazo adaptaciją/fork ir minimalų variantą pagal tuos pačius nedidelius fixtures; pasirinkti vieną scheduler/UI. P0.28 atskirai palygina realų Rakazo UI reuse ir OpenCode UI adaptavimą; [hibrido ribos](docs/UI-FOUNDATIONS.md).
- [ ] P0.29 Reuse planas naujam projektui: tinkamas esamas pagrindas ir komponentai, žmonių patikros/source įrodymai, licencijos, API ir ribotas bendras biudžetas; [scenarijus](docs/PROJECT-CREATION.md).
- [ ] Užfiksuoti pirmą Linux x86_64 profilį, actual model/auth ir turimų resursų ribas.
- [ ] Parengti capability/ToolCall/artifact/grant/budget ir patvarios užduoties kontraktus.
- [ ] Parengti 30 sintetinių kūrimo užduočių: po 10 browser, PDF ir coding; atskirti būsimą nepriklausomą holdout.
- [ ] Pamatuoti bazės cold install/steady/peak kaštus ir izoliavimo galimybę; dideli nežinomi turi feasibility sprendimą arba bloką.
- [ ] Pagal P0.26 užrakinti tikrą Jev/OpenRouter model ID ir decision API/auth/rate/usage mapping, secret per aplinkos saugyklą ir baigtinį cap, palyginti su baseline. Laya weights/hardware neblokuoja MVP; nepasiekiamas Jev rodomas blocked/baseline fallback, ne tariamai veikianti Jev integracija.

**Rezultatas:** pagrįstas pasirinkimas, atkuriami fixtures ir sąžininga palaikomo profilio riba. Norminiai darbai P0.0–P0.14; nauji identity/intake/receptų reikalavimai pagal jų P0 ADR. Visų vartų tikslai aprašyti [ROADMAP.md](ROADMAP.md).

## 3. M1 — vienas patvarus užduoties ciklas

- [ ] Realiai pernaudotas pasirinktas workspace/composer; UI → užduotis → vienas scheduler → worker → artefaktas → validator → matoma būsena.
- [ ] Juoda/salotinė default tema, bendri theme tokens, registras ir persist/fallback; pakeitimo mechanizmas be ekranų perrašymo, daugiau temų vėliau.
- [ ] Preview/Changes/Checks, matomas Stop ir blocked/unknown/reconnect; maketas nėra veikimo įrodymas.
- [ ] 8locale UI/tekstų keys ir pagrindiniai srautai, EN/RU technical quickstart bei trumpi kitų locale guide; locale persistence/fallback nekeičia API/contracts.
- [ ] Events/outbox, lease/fence, grant ir atominis budget rezervavimas; būsena išlieka po restart.
- [ ] Vienas modelio adapteris ir brokerio credentials; nėra raktų prompt/log/renderer.
- [ ] Jev/OpenRouter ToolSelector pasirinkto MVP darbo profiliui: shortlist-only IDs/abstain, actual dispatch/cost apskaita, timeout/schema/missing/grant bandymai; nėra mokamo masinio intake per šį raktą.
- [ ] EN/RU routerio/search fixtures, aiškus kalbų/profile tikslumas ir žmogui suprantamos klaidos abiem kalbomis.
- [ ] SSE/reconnect, cancel, aiški klaida ir atskiras `unknown_after_timeout` kelias.
- [ ] Deterministinis fake tool fault rinkinys ir backup/restore, nepriskiriant fake rezultato modelio kokybei.

**Rezultatas:** mažas vertikalus pjūvis ir G1 atitinkantys įrodymai apibrėžtame profilyje. Norminis P1. Prieš daugiau modulių išspręsti būsenos/biudžeto/izoliavimo trūkumus.

## 4. M2 — trys naudingi gebėjimai su tikrais rezultatais

- [ ] Browser: savo/sintetiniai puslapiai → ribotas tyrimas ir šaltinių ataskaita.
- [ ] PDF: originalas → lentelių CSV/JSON → skaičių ir puslapių provenance patikra.
- [ ] Coding: seeded testinė klaida → mažas diff → testai ir tikras smoke rezultatas izoliuotoje aplinkoje.
- [ ] P2.14 Ribotas naujo projekto reuse pjūvis: brief → esamos bazės/komponento pasirinkimas → isolated build → app preview → testas → source/lock perdavimas. Buhalterinės programos maketas nepadaro pilnos ERP pirmo MVP reikalavimu.
- [ ] Kiekvienas modulis turi pin/lock, conformance, measured resources, timeout/cancel/uninstall ir klaidų ataskaitą.
- [ ] Su faktiniu pasirinktu modeliu atlikti 30 užduočių, saugant failures/caps; tikslas 24/30 ir bent 7/10 kiekvienoje srityje pagal iš anksto nustatytus kriterijus.
- [ ] Naujas žmogus paleidžia palaikomą profilį, gauna artefaktą ir supranta, ką patvirtino tikrintojas.

**Rezultatas:** įrodytas trijų gebėjimų techninis MVP. Šios 30 kūrimo užduočių nėra nepriklausomas aukštesnio intelekto benchmark. M2 savaime nereiškia, kad užbaigti visi platesnio P2/G2 darbai, įskaitant Treg ir kelių providerių metodų testus. Neišbandyti profiliai lieka NOT_RUN/blocked.

## 5. Lygiagrečiai nuo pradžios — lengvas viešas projekto paviršius

- [ ] P0W/P1W: sąžiningas oficialus research/planning puslapis, roadmap, viešas katalogas, changelog ir donate/account pending kai dar nekonfigūruota.
- [ ] P1C: GitHub login, public repo submit, own/org/community žyma ir paraiškos būsena; login nesuteikia write.
- [ ] P1Q: no-LLM ingress/dedup/cache, bounded metadata ir queue, atominis cap0/budget brokeris prieš viral srautą.
- [ ] Kategorijų/search karkasas ir mašininis capability indeksas iš tų pačių šaltinių; source-only nevadinamas ready-to-use.
- [ ] P0M: partner/creator/badge/press draft ir taisyklės; jokio neegzistuojančių integracijų viešinimo kaip veikiančių.

Šie darbai neturi versti perkurti branduolio ar apmokėti tūkstančių source analizių. Jei nėra realaus hostingo/identity/account, yra tik peržiūrimas preview ir aiškus parengties statusas. Video Hub ir realus outreach turi savo P2V/P2M readiness vartus, o ne tariamą bendruomenės veiklą.

## 6. M3 — nuo techninio MVP iki viešos beta

- [ ] P3B: privalomas **REA static** profilis ir jo tikras conformance/domeno/resource testas; package/source kilmė patikrinta.
- [ ] P2.11–P2.13: **Treg** read-only vertikalus scenarijus ir provider/auth matrica pagal realiai išbandytus account/method profilius; OAuth tik oficialiai tinkamu keliu.
- [ ] P3A: seeded reproducer → patch → atskiros patikros → tikras pasirinktas PR/release → antros instaliacijos update → verified result.
- [ ] P3C: siauro leistino auto acceptance/registry lane shadow ir neigiami testai; atskiras secretless builder ir trusted signer.
- [ ] P3D: signed managed-local update, nepriklausomas supervisor, blogo starto recovery, data/pins išsaugojimas, upstream bump ir revocation atvejai.
- [ ] P4: vieša beta tik praėjus visiems jai taikomiems G2/G3A–G3D/G4 vartams, su tikra supported matrica ir nepriklausomais bandomaisiais naudotojais.

**Vieša beta nėra vien gražus demo ar trijų modulių skaičius.** Jei trūksta GitHub teisių, actual provider/Treg account, runner/izoliavimo ar biudžeto konkrečiam vartui, tas vartas lieka atviras. Vidinį MVP galima toliau gerinti ir rodyti su tikra jo stadija; ribos neslepiamos.

## 7. Kas neturi užblokuoti pirmo mažo techninio pjūvio

Visos pasaulio kategorijos ir šimtai integracijų, visų modelių auth, native desktop OS matrica, platus cinematic/GPU/CAD/science portfelis, didelės marketingo kampanijos, mokami placement ir platesnė autonomija turi vėlesnius atskirus vartus. Jie lieka plane, tačiau negali pakeisti pirmo veikiančio užduoties/rezultato ciklo.

Windows/macOS/Linux installer/update patikra yra P4D, platesnis gebėjimų portfelis P5/P6, didesnė autonomija P7. Donorystė gali suteikti daugiau tikslinio biudžeto pagal pasirinktą politiką; ji automatiškai nepadaro neišbandyto modulio patikimu ar naujo profilio nemokamu.

## 8. Kaip žymime pažangą

`[x]` tik atliktam darbui su peržiūrimu source/config, atkūrimo receptu, tikrais testų/artifact/cost rezultatais ir apribojimais. Ankstesni techninio MVP vykdymo vartai lieka atviri;9skiltyje atskirai pažymėti atlikti Zero Lab planavimo darbai. Dokumentų/schema/link patikra nepakeičia produkto acceptance.

Visas backlog ir priklausomybės [ROADMAP.md](ROADMAP.md); numatyta produkto vertė ir scenarijai [PROJECT-V1.md](docs/PROJECT-V1.md). Dokumentuose rastas prieštaravimas sprendžiamas aiškiu ADR/patikslinimu, ne tyliai paskelbiant vartą priimtu.


Papildomas reikalavimas: [cloud darbo aplinkos ir Google Drive](docs/CLOUD-WORKSPACES.md). Vykdymo vieta atskirta nuo failų saugojimo; pradinis veikiantis profilis vietinis, remote/Drive konformansas P0.30/P5.14.

## 9. Zero Lab — nuolatinis gerinimo modulis

Aktyvus coding eksperimentas: oficialus Claude CLI su prenumerata, Sonnet5.5/high. [Viena prompt-v2 pora](docs/CLAUDE-CALIBRATION.md) praėjo automatinį kontraktą abiem programoms. Tai statinio Zero katalogo konteksto naudos bandymas; pilnas runtime/Jev/Auto dar atskiri. Codex auth ir OpenRouter lenktynės atidėtos.

- [x] Daugkartinio [Zero Lab](docs/ZERO-LAB.md) modulis ir [kalibravimo metodas](docs/CALIBRATION.md) suplanuoti, peržiūrėtas esamas eval kodas.
- [x] `npm run lab:plan`: paruoštas manifestas, prompt/grader digest,4profilių not-run JSON, model call0.
- [x] Kontrolinio fixture API/SQLite/desktop/mobile/keyboard pipeline ir vietinis konservatyvus reportų palyginimo CLI.
- [x] Viena tikra Claude baseline/retrieval v2 pora, secretless artefakto runtime, nepriklausomas API/restart/UI acceptance ir CLI usage; pakartotinė abiejų programų patikra be modelių.
- [ ] Baseline/candidate versijos, kelių užduočių kartojimai, quality/time/total-cost palyginimas ir atskiras holdout.
- [ ] Lab UI, regresijos ir baigtiniu biudžetu valdomas periodinis gerinimas.

Šie atlikti planavimo pjūviai neuždaro ankstesnių techninio MVP vykdymo vartų.
