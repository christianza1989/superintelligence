# Tas pats promptas: coding CLI ir Zero katalogo kontekstas

2026-10-16. **Pirma Claude prenumeratos pora atlikta ir importuoti artefaktai patikrinti.** Lyginamas tas pats oficialus Claude CLI su statiniu Zero katalogo kontekstu ir be jo. Pilno RepositoryZero runtime, Jev ir Auto palyginimas lieka NOT_RUN. [Rezultatai ir pirmos poros nesėkmės](CLAUDE-CALIBRATION.md).

## Vienodos pradinės sąlygos

Prieš startą užfiksuojamas tikslus promptas, tie patys pradiniai failai/source pins, pageidaujama platforma, leidžiamos išorinės paslaugos, laiko ir finansų cap bei nepriklausomi rezultato priėmimo kriterijai. Privatus promptas ar rezultatas automatiškai neviešinamas. Jei vienai sistemai leidžiame GitHub reuse, kita taip pat gauna galimybę jį naudoti; konkretūs jos rasti šaltiniai yra rezultato dalis.

Abi sesijos pradeda be ankstesnio šios konkrečios užduoties pokalbio. Cold setup ir jau paruoštos aplinkos darbo laikas žymimi atskirai. Modeliai, Auto režimas, modelio parametrai, turimi įrankiai, concurrency ir infrastruktūra užrašomi, o žinomi skirtumai nepaslepiami.

Dabartinis naudotojo pasirinkimas — Claude prenumerata, `claude-sonnet-5-5` ir effort `high` abiem pusėms. Codex auth ir OpenRouter lenktynes praleidžiame. Tikrinamas katalogo konteksto priedas; retrieval+Jev ir Auto vėliau turi atskirus [kalibravimo profilius](CALIBRATION.md).

Daugkartinis modulis [Zero Lab](ZERO-LAB.md) turi veikiantį offline plano sudarymą. Pirma [SprintDesk užduotis ir API acceptance](../benchmarks/sprintdesk-v1/README.md) paruošti prieš generavimą. Prompt-v2 poroje jie taikyti abiem tikroms sugeneruotoms programoms, o šioje integracijoje pakartoti pagal tą patį candidate source digest be naujų modelių kvietimų.

## Ką matuojame

| Metrika | Kaip fiksuojama |
|---|---|
| Laikas | Starto data ir monotoniškas elapsed laikas; atskirai iki pirmo paleidžiamo rezultato ir iki acceptance; setup ir žmogaus laukimas pažymėti |
| Modelių naudojimas | Tik faktiniai provider/session usage kvitai, per modelį atskirti input/output/reasoning/cache tokenai, kai prieinami |
| Bendra kaina | Jev + pagrindiniai/child/review modeliai + retry/repair + mokamos source/compute paslaugos; actual ir uncertain atskirai |
| Naudotojo išlaidos | Hosted antkainis/platformos mokestis atskirai nuo grynos provider kainos; CLI prenumeratos sąnaudos neapsimetamos tikslia vieno call API kaina |
| Žmogaus darbas | Papildomi promptai, taisymo prašymai, rankiniai veiksmai ir jų laikas |
| Veikimas | Tie patys nepriklausomi build/start/persistence/error-path ir užduoties testai; passed/failed/skipped/not-run atskirai |
| Kokybė | Sutartas feature rinkinys, klaidos, aiškumas, UX jei yra UI, priežiūros ir licencijos/source handoff; subjektyvus vertinimas atskirai |
| Atkuriamumas | Artefakto/source digest, lockfile, leidimai ir aiškios paleidimo instrukcijos; pakartojimo baigtis |

RepositoryZero skaičiuoja ir routerio, Jev, deleguotų agentų bei papildomo konteksto paruošimo sąnaudas. Iš pigesnio vieno prompt negalima išvesti pigesnės visos užduoties.

Jei coding CLI sesija neatskleidžia tokenų ar faktinės kainos, laukas yra **unavailable**, ne0 ir ne iš simbolių skaičiaus „tiksliai apskaičiuotas“ skaičius. Galima atskira aiškiai pažymėta apytikslė tekstinė statistika, tačiau jos nelyginame su tikrais provider invoice duomenimis kaip lygiaverčių tokenų. Matomos spragos lieka ataskaitoje.

## Nepriklausoma kokybės patikra

Acceptance nustatomas prieš abiejų implementacijų startą. Tikrintojo failai ir taisyklės laikomi atskirai nuo agento redaguojamo projekto, candidate negali pats panaikinti ar susilpninti vartų. Galutinį artefaktą tikriname švarioje palaikomo profilio aplinkoje; klaida ar cap išnaudojimas yra rezultatas.

Pirmam bandymui tinka nedidelė, aiškiai patikrinama programa: konkretūs įvedimai, laukiamas rezultatas, neteisingų duomenų elgesys ir aiškus persistence poreikis. Pilnos šalies apskaitos ar kitų plataus teisinio domeno reikalavimų nedarome tariamu mažo smoke testo PASS. Jei žmogus vertina UI, vienodas brief ir kiek įmanoma nuasmenintas A/B pateikimas mažina vertintojo lūkestį.

Užbaigus pirmą bandymą rodome vieno konkretaus atvejo išvadą. Bendresniam teiginiui reikės kelių skirtingų užduočių ir pakartojimų, įskaitant nesėkmes; iš anksto nefiksuojame pageidaujamo laimėtojo ar sutaupymo procento.

## Atlikta ir likę vartai

- [ ] Veikiantis RepositoryZero modelių/brokerio kelias ir izoliuotas tikros užduoties kūrimo profilis.
- [x] Pirmas konkretus SprintDesk promptas ir nepriklausomas API acceptance paruošti; proceso restart/SQLite ir riboti desktop/mobile/keyboard tikrinimai prijungti bei patikrinti kontroliniu fixture. Subjektyvi dizaino kokybė nevertinama automatiškai.
- [x] Claude prenumeratos normalizuotas input/output/cache usage ir source/prompt/profile kilmė patikrinti; kaina lieka nežinoma.
- [ ] Faktiniai pilno RepositoryZero brokerio provider usage/model/invoice kvitai.
- [x] Ribotas pirmas Claude vykdymas, artefaktų perėmimas ir pakartotinė abiejų rezultatų patikra.
- [ ] Kaitaliojamos eilės pakartojimai, kita užduotis ir atskiras holdout.

Šis protokolas papildo [VALIDATION](VALIDATION.md), [Jev matavimo planą](JEV-APPLICATIONS.md) ir [reuse veikimo principą](PROJECT-CREATION.md), nekeisdamas norminių MVP30užduočių vartų.
