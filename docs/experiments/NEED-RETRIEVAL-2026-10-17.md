# Poreikių paieškos kūrimo rinkinys

2026-10-17. Bendras source katalogo matcher papildytas ribotu LT/EN žodynu ir nepriklausomais hard constraints. Frozen katalogas, source pins, datuotas metadata snapshot ir ankstesnės kohortos nepakeisti. Tai deterministic source atranka, ne runtime tinkamumo ar palyginamos produkto naudos įrodymas.

## Matavimo eiga

Prieš matcher keitimą užfiksuotos 48 užklausos: po 24 LT ir EN, kiekvienoje kalboje 16 source-fit bei 8 no-fit lūkesčiai. Teigiami lūkesčiai susieti su esamais capability tekstais. Pirminis matcher atitiko 34/48 originalių lūkesčių. Pirmas pakeitimas atitiko 46/48, tačiau du likę atvejai parodė klaidą pačiuose lūkesčiuose: pasirašymo poroje buvo praleistas dar vienas tikrą capability turintis šaltinis. Development žymos papildytos pagal tą tekstą. Singleton kontrolė patikslinta į kategoriją, kurioje yra tikrai vienas available repo; population=1 tikrinama atskirai.

Originalūs fixture, baseline ir nesėkmės išsaugoti. Senasis matcher iš naujo paleistas su pataisytomis development žymomis: **33/48**, naujas matcher: **48/48**. Šie rezultatai priklauso nuo kūrimo metu matyto ir pataisyto rinkinio. Jie nėra nepriklausomas holdout ir neįrodo bendros 100 % paieškos kokybės.

## Ką tikrina kodas

- Kiekvienas turiningas neatpažintas užklausos terminas išlieka privalomas; nėra fuzzy ar singleton fallback.
- Exact canonical repo paieška nepanaikina explicit kalbos, pin objekto, runtime, license approval ar OS reikalavimo.
- Datuota pagrindinė kalba, pin objekto buvimas, katalogo runtimeTested ir licenseApproved yra nepriklausomi faktai. Nežinomas OS palaikymas neduoda fit.
- Užklausa virš 256 simbolių atmetama prieš normalizavimą; papildomai riboti normalizavimo expansion, terminų skaičius ir ilgis. Library URL išlaiko ribotą overflow žymą, kad truncation nepaslėptų galutinio reikalavimo.
- Įprastos image editor užklausos, nežinomi reikalavimai, nesusijęs vienintelis source ir source-only CSV no-fit yra aiškios kontrolės.

Agentas kvalifikavo **98 focused unit patikras** ir core/web TypeScript. Integruotoje versijoje papildomai praėjo 74 pasirinktos normalization/dev-corpus/repository adapter/MCP proceso regresijos. Šių skaičių nesumuojame į nepriklausomų produkto užduočių skaičių.

## Likusios ribos

Maintainer laikomas nematytas holdout dar NOT_RUN. Source matcher neteikia išgalvoto CSV kandidato, kai kataloge nėra capability įrodymo. Atskirai kvalifikuotas d3-dsv preparer egzistuoja už source katalogo ribų; jo paieškos sluoksnis pagal A05 dar atskiras darbas. Vien paieškos rezultatas nesuteikia install/execute grant, licencijos patvirtinimo ar projekto verification. NEED1 bendras vartas lieka atviras iki likusios aprėpties priėmimo.
