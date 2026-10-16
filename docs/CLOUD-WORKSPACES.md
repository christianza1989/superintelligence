# Projektai debesyje ir Google Drive

2026-10-16. Naudotojo reikalavimas: kurti projektą debesyje, nelaikant jo savo kompiuterio diske, su galimybe prijungti Google Drive. **Pradinė architektūros specifikacija; remote compute ir Drive OAuth integracija dar neįgyvendinti.**

## Darbo vieta ir failų saugykla

Projekto profilis atskiria vykdymo vietą nuo saugojimo: `local` darbo aplinka arba `remote` valdomas workspace, o failų tikslas gali būti vietinis volume/Git ar pasirinktas Drive aplankas. Cloud profilyje naršyklė valdo darbą, kodas ir testai vykdomi nuotoliniame workeryje; naudotojo PC neturi privalomo nuolatinio projekto checkout. Tinklo cache ir aiškiai parsisiųsti failai atskiri nuo pilno projekto laikymo.

Google Drive saugo failus/versijų snapshotus, o nuotolinis runtime vykdo kodą, dependencies, testus ir preview. Drive pats nėra programos vykdymo hostas. DB, node_modules, aktyvūs lock/socket ar worker lease failai nėra tiesiog sinchronizuojama Drive darbo direktorija. Runtime turi izoliuotą darbui reikalingą diską; tai operatoriaus cloud resursas, ne naudotojo PC.

## Numatytas srautas

1. Naujo projekto vieta: vietinis arba pasirengęs cloud workspace profilis; neįgyvendintas profilis aiškiai planned.
2. Google paskyra prijungiama tik per mūsų klientui leistiną OAuth metodą. Kiek įmanoma naudojama pasirinkto failo/aplanko `drive.file` aprėptis; realių Google scopes/prieigos ir publisher verification poreikį tikrina integravimo etapas.
3. Pasirenkamas konkretus aplankas ir darbo/snapshot taisyklė. Stabilūs Drive file IDs, revisions/ETag ir projekto identitetas, ne vien failo vardas.
4. Cloud worker gauna laikiną konkretaus projekto lease ir trumpalaikį brokerio grant. Kodas/testai kuriami jo izoliuotoje aplinkoje; preview eina per autentifikuotą tinkamą origin/proxy, ne visas VPS portas internete.
5. Patikrintas source/lock/artefaktų snapshot su manifestu ir digest išsaugomas pasirinktame Drive/Git profilyje. Iš šio snapshot projektą galima atkurti naujame workeryje.

Konfliktas, nutrūkęs ryšys ar pasibaigęs token turi aiškią unsynced/blocked būseną; svetimo pakeitimo aklai neperrašome. Reikalingi incremental/idempotency, retry/cap, revision conflict, kvotų, upload/download, didelių failų ir restore bandymai. Paslaptys nepatenka į source/snapshot ar Drive failus. Atsijungimas, retention ir projekto ištrynimas atskiria mūsų kopijas nuo naudotojo Drive duomenų; trynimas neslepiamas po logout.

## Etapai ir biudžetas

Vietinis pirmas profilis įrodo bendrą project/workspace/artifact kontraktą. P0.30 užfiksuoja remote/Drive kontraktą ir cloud resursų kainą; P5.14 įgyvendina tikrą remote workspace + pasirinktą Drive snapshot profilį. Nuolatinis cloud darbas naudoja baigtinius compute/storage/model limitus ir veikia tik jei operatoriaus hostas iš tiesų paleistas. VPS projekto priežiūros coordinator nėra automatiškai kiekvieno naudotojo hostingo paslauga.

Tai papildo [naujo projekto kūrimą](PROJECT-CREATION.md), [autonomijos/VPS architektūrą](AUTONOMY-AND-UPDATES.md) ir [modelių/auth ribas](MODELS-AND-TOOLS.md). Drive failų profilis nėra išankstinis leidimas skaityti visą paskyrą, publikuoti programą ar neribotai naudoti cloud resursus.
