# Dešimt projektuojamų užduočių

Data: **2026-10-16, Europe/Kiev**. Visų scenarijų būsena **NOT_RUN / NEBANDYTA**. Tai architektūros patikrinimas mintiniu vykdymo keliu; repo programos šiame tyrime neįdiegtos ir užduotys realiai neatliktos. PASS bus galimas tik išsaugojus tikro bandymo įrodymus.

## Bendros planavimo prielaidos

Pirmo CPU scenarijaus bandymų host orientyras: Linux x86_64,8 loginiai CPU,16 GiB RAM, SSD, vienas scheduler ir iki 2 workerų. Tai siūlomas bandymų host, ne patikrintas visų projektų minimalus reikalavimas. Desktop darbui papildoma išmetama VM, GPU medijai ir vietiniams modeliams – atskirai pasirinkta aparatūra pagal konkretų modelį.

Žemiau pateikti laikai yra **pradinis laiko rezervas / projektavimo įvertis**, o token skaičiai – **biudžeto ribos**; nė vienas nėra matavimo rezultatas. Kaina apskaičiuojama pagal bandymo metu užfiksuotą tarifą:

`USD = input_tokens × P_in / 1e6 + output_tokens × P_out / 1e6 + tool/API mokesčiai + compute_hours × P_compute + storage/egress`.

Cache ir modelio thinking tokenai apskaitomi pagal providerio sutartį. Vietinis vykdymas gali neturėti išorinio API mokesčio, tačiau turi aparatūros, elektros ir priežiūros kainą. Dabartinių tarifų šiame darbe nepatvirtinome; nežinomi įkainiai lieka nežinomi.

## S01. Nedidelės programos sukūrimas

**Prašymas:** „Sukurk vietinę išlaidų registravimo programą su CSV eksportu. Parodyk veikiančią peržiūrą ir testus.“

**Repo ir vaidmenys:** FastAPI/Pydantic – API; React/assistant-ui – bendras darbo UI; pytest – sukurto darbo patikra; Playwright – programos bandomasis naudojimas. Kodo modulis naudoja ribotą Git/diff adapterį; Aider gali būti vėlesnis palyginimo įrankis.

**Seka:** specifikacija ir5 priėmimo taisyklės → izoliuotas workspace → minimali schema/API/UI → unit ir API testai → preview viename worker endpoint → browser testas „įvesti išlaidą, eksportuoti CSV“ → artefakto registravimas. Host publish nėra šio lokalaus scenarijaus dalis.

**Artefaktai:** source archive arba diff, dependency lock, test report, CSV pavyzdys, screenshot, paleidimo receptas. **Patikra:**1 įvestas įrašas matomas sąraše ir CSV; suma apskaičiuota aritmetiškai; netaisyklinga įvestis atmetama; restart išsaugo duomenis pagal specifikaciją.

**Gedimas / atkūrimas:** testui nepraėjus grąžinamas konkretus failing case; iki 2 ribotų taisymo bandymų. Worker žūtis atkuria workspace nuorodą ir užduoties būseną. Neleidžiama paskelbti „baigta“ vien gavus serverio start log.

**Rezervas:**10–30 min.; iki 30k input ir6k output tokenų; CPU workeriui2–4 CPU/4 GiB pradinis cap. Kainą fiksuoja aukščiau pateikta formulė, modelio pasirinkimas dar nepadarytas.

## S02. Rinkos tyrimas ir pagrįstas verslo planas

**Prašymas:** „Palygink penkis viešus konkurentus mano nurodytoje rinkoje ir parenk verslo plano juodraštį. Kiekvieną kainą ir faktą pagrįsk šaltiniu.“

**Repo:** Playwright arba Crawl4AI – puslapių gavimas; Trafilatura/Scrapling – teksto/laukų išgavimas; DuckDB – kainų suvestinės; python-docx – redaguojamas dokumentas. Vienai užduočiai parenkamas vienas gavimo profilis, abu crawleriai automatiškai nepradedami.

**Seka:** tikslinė rinka ir ribotas20 šaltinių planas → puslapių momentinės kopijos su laiku → kainų normalizavimas su valiuta/periodu → patikrintų faktų atskyrimas nuo išvadų → verslo scenarijų skaičiavimas → citatų tikrintuvas → ataskaita.

**Artefaktai:** šaltinių registras, HTML/teksto kopijų nuorodos, konkurentų CSV, DOCX/Markdown, prielaidų lentelė. **Patikra:**100% konkrečių kainų turi citatą su tikrinimo laiku; citata atitinka teiginį; mokamų pajamų/rinkos dydžio duomenų nežinomi skaičiai neišgalvojami; finansinės sumos perskaičiuojamos kodu.

**Gedimas / atkūrimas:** neprieinamas šaltinis įrašomas su būsena; ieškoma kita oficiali publikacija riboto biudžeto ribose. Konfliktuojantys šaltiniai pateikiami abu. Trūkstant duomenų mažinamas išvados pasitikėjimas, o ne sugalvojamas skaičius.

**Rezervas:**15–45 min.; iki 60k/8k tokenų,30 puslapių užklausų cap, browser1instancija. Mokamo SERP/datų API šiame plane automatiškai nėra.

## S03. Dokumentų lentelės ir skaičių patikra

**Prašymas:** „Iš šio20 puslapių PDF ištrauk sąskaitų lenteles į CSV ir nurodyk, iš kurio puslapio atėjo kiekviena eilutė.“

**Repo:** Docling – struktūra; Tesseract/OCRmyPDF pasirenkamas papildomas OCR profilis; DuckDB – sumų ir duplikatų patikra. Pirmas testas su sintetiniu PDF ir žinomu atsakymu.

**Seka:** įkelto artefakto savininko patikra → failo tipas/dydis/page limit → izoliuotas parsing → kiekvienai eilutei page/span provenance → schema, currency/decimal normalizavimas → sumų kontrolė → artefaktų peržiūra.

**Artefaktai:** originalo nuoroda, JSON, CSV, puslapio overlay preview ir validation report. **Patikra:** tiksli eilučių bei stulpelių forma, expected numeric totals, kilmė kiekvienam laukui; neryškūs arba nepasitikimi laukai pažymėti.

**Gedimas / atkūrimas:** parserio klaida išsaugo bandymo įrašą; vienas kitas parserio/OCR profilis tik įvertinus jo dydį/teises. SAI demonstracijai naudojama pažymėta test-only adapterio klaida, jos nepriskiriame Docling autoriams.

**Rezervas:**2–10 min. po cache sušilimo, iki 15k/4k tokenų; pirmas modelių atsisiuntimas atskirai. Parserio pradinis RAM cap8 GiB; faktas turi būti pamatuotas.

## S04. Naršyklės užduotis su patvirtintu veiksmu

**Prašymas:** „Mūsų testinėje svetainėje sukurk demonstracinį kontaktą ir parodyk, kad jis atsirado sąraše.“

**Repo:** Playwright deterministiniam adapteriui; Browser-use arba Stagehand tik vėlesniam semantinio valdymo palyginimui. **Seka:** tikslinė testinė paskyra ir write grant → formos laukų peržiūra → effect intent ir idempotency key → įvedimas/pateikimas → serverio būsenos nuskaitymas → patikra → receipt.

**Artefaktai:** išvalytas trace, screenshot, užmaskuotas receipt su testinio objekto ID. **Patikra:** testinės DB/API būsena atitinka laukus;1 objektas; realaus kliento sistemos nepasiekiamos. DOM tekstas negali pakeisti grant.

**Gedimas / atkūrimas:** timeout po submit → `unknown_after_timeout`; prieš pakartojimą read-only paieška pagal testinį unikalų identifikatorių. Jei būsenos nustatyti neįmanoma, sustoti konkrečiam žmogaus sprendimui.

**Rezervas:**3–10 min., iki 20k/3k tokenų,5 veiksmai ir1commit veiksmų cap; papildomas cloud-browser mokestis taikomas tik pasirinkus tokią paslaugą.

## S05. Desktop programos valdymas

**Prašymas:** „Testinėje darbalaukio aplinkoje atidaryk mano paveikslą, pakeisk jo dydį ir išsaugok redaguojamą projektą bei PNG.“

**Repo:** CUA pasirinktas driver/VM komponentas; GIMP arba Krita – redagavimo programa; native API pirmiau už trapius GUI paspaudimus. **Seka:** failo staging į testinę VM → programos paleidimas → veiksmas per scripting arba desktop driver → išsaugojimas į output katalogą → failų importas į artefaktų saugyklą → patikra.

**Artefaktai:** redaguojamas projekto failas, PNG, veiksmo receptas, screenshot. **Patikra:** PNG matmenys ir formatas; originalas išsaugotas; projektas atidaromas; output ne tuščias. Vizualinis žmogaus įvertinimas gali būti papildomas.

**Gedimas / atkūrimas:** pasikeitęs GUI modal sustabdo veiksmus po riboto skaičiaus nesėkmių; išsaugomas screenshot. VM atstatoma iš žinomo image, naudotojo artefaktai laikomi už jos ribų.

**Rezervas:**5–15 min., iki 15k/2k tokenų; VM RAM8 GiB pradinis rezervas, OS ir programos dydis matuojami atskirai. Šio Linux host Mac driver palaikymo nepatikrina.

## S06. REA reverse engineering — privalomas projekto scenarijus

**Prašymas:** „Išanalizuok mano testinę JavaScript programą: parodyk įėjimo taškus, duomenų srautą ir kur formuojama nurodyta API užklausa.“

**Repo:** REA (`morluto/rea`) – statinio profilio MCP; ast-grep arba tree-sitter – atskira struktūrinė patikra; Ghidra skirta vėlesniam atskiram native scenarijui. Repo README rasta6.5.0 integracijos schema patvirtinta kodo įėjimo vietomis, npm paketo veikimas dar nebandytas.

**Seka:** vartotojo failų scope ir versijos digest → patikrinto paketo `rea mcp` → leidžiamų static tools discovery → analizė ir failų/eilučių žemėlapis → AST patikra → rezultatų atskyrimas į faktus bei interpretacijas → peržiūra.

**Artefaktai:** išvadų Markdown, struktūrinis žemėlapis, šaltinio span nuorodos, tool snapshot ir validation report. **Patikra:** žinomi fixture entrypoints/call sites rasti, neegzistuojančių funkcijų nepridėta, API užklausos formavimo vieta sutampa su nepriklausomu etalonu.

**Gedimas / atkūrimas:** įrankis prašo runtime/native/download teisių → static profilis jų nesuteikia; likęs darbas pateikiamas kaip užblokuotas. Nežinomas tool fingerprint ar source/package neatitiktis blokuoja aktyvavimą. Native/process capture reikės atskiro VM profilio.

**Rezervas:**10–30 min. iki 100fixture failų, iki 30k/4k tokenų; CPU2/RAM4 GiB pradinis matavimo cap. Nėra automatinio mokamos dekompiliatoriaus licencijos įsigijimo.

## S07. Duomenų analizė ir tikrinamos diagramos

**Prašymas:** „Iš100000eilučių pardavimų CSV parodyk mėnesinius pokyčius ir neapibrėžtumą. Pateik duomenis ir interaktyvią diagramą.“

**Repo:** DuckDB – SQL; Pandas arba Polars pasirinktas transformacijų profilis; SciPy – statistiniai skaičiavimai; Plotly – HTML. **Seka:** schema ir missing values → importas su ataskaita → fiksuotos SQL transformacijos → skaičiavimo patikra → iš anksto aprašytas statistinis metodas → grafikas ir komentarai.

**Artefaktai:** SQL/Python receptas, išvalytas Parquet/CSV, skaitinė ataskaita, HTML. **Patikra:** total rows prieš/po transformacijos, aritmetiniai totals, teisinga laiko zona/valiuta, etaloninis mažas rinkinys; koreliacija nevadinama priežastiniu ryšiu.

**Gedimas / atkūrimas:** tipų konversija sustabdo prie klaidingo lauko; RAM viršijus taikomas ribotas chunk/lazy planas arba užduotis užblokuojama. Laikinas diskas turi cap ir atskirą valymą.

**Rezervas:**2–10 min., iki 5k/2k tokenų; dataset dydis ir transformacijos svarbesni už modelio kontekstą. Pradinis CPU4/RAM8 GiB cap, GPU nereikalaujamas šiame scenarijuje.

## S08. Vaizdai, garsas ir trumpas video

**Prašymas:** „Pagal patvirtintą produkto scenarijų parenk30sekundžių pristatymo klipą su trimis iliustracijomis, subtitrais ir įgarsinimo juodraščiu.“

**Repo:** HyperFrames HTML kompozicijai arba MoviePy/FFmpeg montažui; Diffusers/ComfyUI pasirinktas image profilis; Piper/Sherpa pasirinktas voice profilis. Naudojant jau turimus vaizdus ir balsą generavimo moduliai nereikalingi.

**Seka:** tekstas ir shot list → teisėtai pasirinkti assets/modeliai → asset generavimas arba importas → balso ir subtitrų laikas → versijuotas montažo receptas → render → automatinė failo ir žmogaus vizualinė peržiūra.

**Artefaktai:** scenarijus, HTML/projekto failas, MP4, audio, SRT, atskiri assets, modelių/licencijų manifestas. **Patikra:** ffprobe trukmė/stream/rezoliucija, subtitrų ribos, girdimas garsas, nėra tuščių kadrų; kokybė pagal paskelbtą rubricą. Failo egzistavimas nėra kūrybinės kokybės PASS.

**Gedimas / atkūrimas:** GPU OOM sumažina pasirinktą profilį tik pagal leidžiamą planą; baigtos scenos išsaugomos; render tęsiamas nuo artefaktų. Nepatikimas ComfyUI node kodas neveikia kontrolės aplinkoje.

**Rezervas:**10–60 min. pasirinktam render profiliui, iki 10k/2k tekstinių tokenų, atskiras vaizdų/audio/GPU biudžetas. Tiksli VRAM ir weights kaina nežinoma iki modelio pasirinkimo; jos neįtraukiame į bazę.

## S09. Parametrinė CAD detalė

**Prašymas:** „Sukurk80×40×4mm laikiklį su dviem6mm skylėmis30mm atstumu; pateik STEP, STL ir patikrink matmenis.“

**Repo:** build123d pirmam headless CAD moduliui; CadQuery alternatyvai; Trimesh mesh patikrai; FreeCAD žmogaus peržiūros/importo profiliui. **Seka:** geometrijos specifikacija ir koordinačių sistema → Python CAD receptas izoliuotame workeryje → B-rep validacija → STEP/STL eksportas → nepriklausomas reimport/matmenų tikrinimas → preview.

**Artefaktai:** CAD kodas, STEP, STL, PNG/GLB peržiūra ir matmenų ataskaita. **Patikra:** bounding box, skylių diametrai/atstumas ir vientisumas pagal iš anksto pasirinktą toleranciją; vienetų konvertavimas aiškus. Tai ne mechaninio stiprumo ar gamybos sertifikatas.

**Gedimas / atkūrimas:** boolean/fillet klaida sukuria dalinį artefaktą ir tikslų failing geometry case; iki 2 remonto bandymų. OCCT ABI konflikto atveju atstatoma paskutinė patikrinta izoliuota aplinka.

**Rezervas:**5–20 min., iki 20k/4k tokenų; CPU4/RAM8 GiB pradinis cap, OpenCascade aplinkos dydis matuojamas atskirai. CAD GPU render neprivalomas.

## S10. Verslo darbo eiga

**Prašymas:** „Iš mano patvirtinto testinių klientų CSV parenk kontaktų importo juodraštį ERP sistemoje. Prieš įrašydamas parodyk pakeitimus.“

**Repo:** DuckDB/Pandas – duomenys; Activepieces arba Node-RED pasirinktai jungčiai; ERPNext – naudotojo jau turimas testinis API taikinys. ERP sistemos diegimas nėra bazinio produkto dalis.

**Seka:** schema/duplikatai → planuojamų pakeitimų diff → tikslinės testinės paskyros grant → efektų rezervas ir stabilūs raktai → limituotas batch → serverio read-back → receipt ir ataskaita.

**Artefaktai:** nuasmenintas importo receptas, change preview, patvirtinimo receipt, testinių objektų ID ir validation report. **Patikra:** kiekvienas laukas ir tikslus objektų skaičius, dublių nebuvimas, atskiras netaisyklingų eilučių sąrašas. Viešame SAI reproducer naudojami tik sintetiniai duomenys.

**Gedimas / atkūrimas:** API429 seka backoff pagal retry terminą; timeout po write reconciliuojamas pagal raktą. Kompensacinis trynimas gali būti atskiras žmogaus patvirtintas veiksmas; jo nevadiname garantuotu rollback.

**Rezervas:**2–10 min. iki 20 testinių įrašų, iki 5k/1k tokenų, jungties/API kainos pagal realią vartotojo paslaugą. Credentials scope ir endpoint patikrinami prieš vykdymą, ne prašomi šiame tyrime.

## Aštuoni bendro tobulinimo gedimo scenarijai

Pilni keliai, įrodymai ir būsimi acceptance kriterijai pateikti [antros peržiūros lentelėje](reviews/architecture-independent.md#9-aštuoni-privalomi-sai-gedimo-scenarijai): nešvarūs privatūs PDF duomenys, du autoriai vienai klaidai, upstream lūžis, vienos srities pagreitėjimas kitos sąskaita, naujas repo, didelis modelis, bandymas pakeisti vertinimo taisykles ir regresinio atnaujinimo atšaukimas. Jų bendra dabartinė būsena taip pat NOT_RUN.
