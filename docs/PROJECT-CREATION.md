# Kaip iš žmogaus prašymo kuriamas naujas projektas

2026-10-16. **Pilna projekto kūrimo eiga dar NOT_RUN; vietinis katalogas ir agento read-only paieškos įrankis jau įgyvendinti.** Pagrindinė idėja — AI pirmiausia panaudoja tai, ką žmonės jau sukūrė ir išbandė, tada kuria trūkstamą dalį. Tai pagrindinis RepositoryZero vertės scenarijus: **atrasti → palyginti → pasirinkti pagrindą → papildyti → sukurti → patikrinti**. [Produkto V1](PROJECT-V1.md), [įrankių registras](AGENT-CAPABILITIES.md), [modulių atranka](MODULE-SELECTION.md), [įgyvendinimo faktai](IMPLEMENTATION.md).

## 0. Katalogas nėra visų repo atsisiuntimas

**Į naudotojo programą nesiunčiami visi atrinkti repo.** Vienas branduolys reiškia bendrą koordinavimą, būseną, modelių ir įrankių jungtis, o ne viso GitHub kodo sujungimą į vieną programą. Katalogo augimas ir įdiegtos programos dydis yra atskiri dalykai.

| Sluoksnis | Kas jame saugoma | Kada reikia source ar diegimo |
|---|---|---|
| RepositoryZero branduolys | UI, koordinatorius, darbų būsena, paieškos ir vykdymo kontraktai | Tik paties produkto ir pasirinkto vykdymo profilio priklausomybės |
| Bendras katalogas | Repo nuoroda, kategorijos, paskirtis, versija/SHA, licencijos faktai, įrodymų datos ir parengtis | Metadata ir riboti indeksuoti fragmentai; ne privalomas pilnas kiekvieno repo checkout |
| Atrankos kontekstas | Mažas užduočiai tinkamų kandidatų sąrašas ir aktualūs dokumentacijos/kodo fragmentai | Tikslinė source analizė pagal poreikį; viso katalogo ar viso repo į modelio prompt nekrauname |
| Kuriamas naudotojo projektas | Pasirinktas produkto pagrindas, bibliotekos, adapteriai ir naujas kodas | Tik reikalingi ir leistini, tiksliai užfiksuoti komponentai izoliuotoje darbo aplinkoje |
| Pasirenkamas cache | Pagal tikslų SHA/paketo digest išsaugotas source, analizė ar build artefaktas | Pakartotiniam naudojimui, su dydžio limitu; cache nėra autoritetinga projekto duomenų kopija |

Numatyta eiga: **užklausa → indeksas ir filtrai → keli kandidatai → tikslinis GitHub/package/documentation skaitymas → reuse planas → reikalingų komponentų paruošimas → build/test**. GitHub yra vienas source šaltinių; tinkamesnis gali būti oficialus paketų registras, pasirašytas release arba jau turimas patikrintas cache. Hosted/API/MCP įrankiui dažnai pakanka jungties ir leistinos paskyros, bibliotekai — užrakinto paketo, o produkto adaptacijai gali reikėti viso fork/checkout. Atsisiunčiami modelių weights ir jų įrangos poreikiai vertinami atskirai.

Todėl galime turėti didelį daugelio kategorijų katalogą be tokio pat dydžio instaliacijos. Katalogas neturi dirbtinės100repo ribos, tačiau metadata saugojimas, GitHub rate limits, source analizė, cache, testai ir priežiūra vis tiek kainuoja. Paieška ir shortlist remiasi indeksu; mokama gili analizė vykdoma ribota eile pagal užduoties biudžetą, ne visam katalogui po kiekvienos užklausos.

**„Confirmed“ nėra bendras pažadas apie visą repo.** Rodome, kas tiksliai patvirtinta: source/metadata peržiūra, bendruomenės naudojimo įrodymas ar konkrečios versijos, adapterio, OS ir užduoties testas. Peržiūrėtas repo nėra automatiškai įdiegtas, o mūsų neišbandytas kandidatas nepaveldi `verified` vien iš stars ar upstream CI.

Source ir analizės cache rišamas prie tikslaus SHA/digest, failų ir analizės versijos. Cache dydžio valymas negali pašalinti projekto vienintelės naudojamo source/artefakto kopijos; projekto failai ir provenance saugomi atskirai. Naujiena upstream sukuria naują vertinimo kandidatą: jau kuriamo projekto lock/pin nekeičiamas tyliai, nauja versija nepaveldi senos patikros. Ribotos peržiūros rezultatas turi datą; pasenusi ar atšaukta rekomendacija parodoma kaip tokia.

Šis atskyrimas sutartas abiejų agentų po naudotojo patikslinimo. Dabartinis MVP indeksas veikia iš su produktu pateikto metadata snapshot; automatinis tikslinio source atsisiuntimo, cache ir izoliuoto build pipeline dar nėra užbaigtas.

## 1. Vienas pagrindas ir tinkami papildymai

Žmogus pateikia norimą rezultatą. Agentas ieško tinkamiausio esamo pagrindo šiai užduočiai ir ją papildančių sprendimų. Tai gali būti produkto fork/adaptacija, vienas framework ir kelios bibliotekos, atskiras API/MCP modulis arba naujai kuriama trūkstama dalis. Kartais tinkamo produkto pagrindo nėra; to neslepiame po „geriausias“ etikete.

**Nesujungiame trijų pilnų konkuruojančių programų vien dėl jų populiarumo.** Vienas domeno duomenų modelis, aiški autentifikacija, konkretūs komponentų kontraktai ir priklausomybių ribos svarbiau už repo skaičių. Paieškos tikslas — geriausias pagrįstas fit žmogaus situacijai, ne vien daugiausiai stars.

| Panaudojimo būdas | Ką agentas padaro | Kaip tai mato žmogus |
|---|---|---|
| Adaptuoti/forkinti produktą | Pritaiko didelę tinkamą bazę, išlaiko upstream ryšį ir licencijos pareigas | „Šį pagrindą pasirinkome dėl šių darbų; tiek reikės pakeisti.“ |
| Integruoti biblioteką ar įrankį | Prijungia ribotą funkciją per tikrą palaikomą API/CLI/kontraktą | „PDF dalį įgyvendina šis komponentas; jo versija ir sąlygos.“ |
| Perimti UX ar architektūros idėją | Savo aplinkoje įgyvendina pagrįstą sprendimo principą | Aiškiai atskirta nuo tiesioginio upstream kodo pernaudojimo |
| Sukurti trūkstamą dalį | Rašo reikalingą glue, naują funkciją ar adapterį | Matomas kodas, priežastis ir acceptance; nėra tariamai jau egzistuojančio modulio |

Kopijuojamo kodo, dependencies, assets ir modelių teisės tikrinamos pagal konkretų scope. Išlaikomi notices ir autorystė; copyleft ar kitų sąlygų negalima pašalinti pervadinus failą ar pavadinus jį idėja.

## 2. Konkretus pavyzdys: „sukurk buhalterinę programą“

1. **Brief.** Naujas projektas → tikslas. Išsiaiškinama šalis, veiklos tipas, kas naudosis, pradinės funkcijos, platforma, duomenų vieta ir biudžetas. Jei dar trūksta sprendimo, galima rengti aiškiai pažymėtą prototipą su demonstraciniais duomenimis.
2. **Atranka.** Indeksas randa kandidatus pagal funkcijas; hard filters pašalina netinkamas teises, OS, resursus ir nesuderinamus profilius. Siūlomas pradinis giliau lyginamų variantų dydis2–5, su vienu bendru baigtiniu laiko/source/model cap, apimančiu child/retry/embedding/routing kvietimus per tą patį brokerį; ne atskiri pilni biudžetai kiekvienam kandidatui ir ne visas GitHub kiekvienai užduočiai.
3. **Reuse planas.** Agentas paaiškina vienos bazės ir komponentų pasirinkimą. Pvz., pagrindinė apskaitos sistema ar web framework, sąskaitų/PDF biblioteka ir banko išrašų parseris. Šie trys vaidmenys yra architektūros pavyzdys, ne šiame darbe atrinkti ir patikrinti finansiniai repo.
4. **Suderinimas.** Patikrinamos API, duomenų modeliai, auth, licencijų platinimo sąlygos, version pins ir palaikymo kaina. Funkcijų sąrašas iš README dar nėra įrodyta integracija. Parodoma alternatyva bei atmetimo priežastys; mažas neapibrėžtas skirtumas nežymimas įrodytu laimėjimu.
5. **Kūrimas.** Izoliuotoje projekto aplinkoje kuriama sutarta dalis. Centre matomas planas ir tikri veiksmai; dešinėje Preview/Changes/Checks. Stop sustabdo leistinus naujus veiksmus, o ne apsimeta atšaukęs jau įvykusį išorinį efektą.
6. **Patikra.** Build, testai ir tikras local smoke; sąskaitų skaičiavimai su decimal/currency, apvalinimas, sumos, CRUD/persistence ir pasirinkto duomenų scope patikros pagal brief. Sintetiniai testai nepatvirtina visos šalies apskaitos/mokesčių atitikties.
7. **Perdavimas ir iteracija.** Veikiantis palaikomo profilio startas, source/lock/attribution, testų įrodymai, žinomos spragos ir tolesni darbai. Žmogus gali rašyti „pridėk PDF eksportą“ ir tęsti tame pačiame projekte.

Tikslinė patirtis — žmogus vertina savo kuriamą programą ir rezultatą, agentas tvarko pagrįstą reuse ir techninį darbą pasirinktoje apimtyje. Galutinis vartotojo produktas turi savo UI; RepositoryZero yra jį kurianti darbo aplinka.

## 3. Kas ką parenka

Bendruomenės naudojimo/patikros įrodymai turi source, versiją/scope ir datą: realių naudotojų patirtis, nepriklausoma apžvalga, issue sprendimas, release ir konkretus testas. Stars ir upstream CI nėra mūsų integracijos PASS; rinkodaros teiginys nėra žmogaus nepriklausomas patikrinimas. Bendruomenės įrodymų stiprumas matomas atskirai nuo mūsų adapterio/užduoties testų. Trūkstami duomenys lieka unknown, o naujas nišinis projektas gali patekti į experimental palyginimą.

Pagrindinis reasoning/coding modelis sudaro produkto ir reuse planą, aiškina kompromisus ir kuria. **Jev yra siauras tools selector po hard filters**, o ne garantuotas geriausio pasaulio repo architektas. Index/search ir žinomi testų rezultatai apriboja bei pagrindžia pasirinkimą. Jei registry nežino tinkamo įrankio, rodoma missing/proposed ir planuojamas ribotas tyrimas, ne išgalvojamas jau veikiantis modulis.

Paprasta katalogo paieška remiasi indeksu/cache. Interaktyvus projekto tyrimas/kūrimas naudoja jo atskirą pasirinktą modelio/routing/source/compute cap; nereikalauja mokamos gilios visų repo analizės. Viešo masinio submission intake pradinis paid budget0 išlieka. Cap išnaudojimas turi tęstinumo būseną, o ne naujų nekontroliuojamų agentų kūrimą.

## 4. Naudotojo projektas ir bendras modulių registras

Pasirinktas patikrintas RepositoryZero modulis gali būti greitai naudojamas pagal turimus grants. Nauja konkretaus kuriamo projekto biblioteka nėra automatiškai bendras rekomenduojamas platformos modulis: ji turi savo exact pin/lock, teisių/licencijos kilmę ir izoliuotą projekto build/test kelią. Repo turinys ar jo install hook negauna coordinator secrets.

Jei kuriamas tinkamas pakartotinai naudojamas adapteris, galima parengti atskirą opt-in contribution pasiūlymą ir siųsti jį per bendro registro vartus. Privatus buhalterinės programos kodas, finansiniai duomenys ar klientų informacija savaime nepublikuojami. Naujo privataus projekto sukūrimas neperrašo pagrindinio RepositoryZero repo.

Prototipo kūrimas su demonstraciniais įrašais savaime neprijungia banko, neteikia deklaracijų, nepublikuoja produkto ir neatlieka realių finansinių veiksmų. Konkretus leidimas, account ir acceptance priklauso nuo pasirinktos tolimesnės užduoties. Pasirinktas veiksmų profilis leidžia rutiną atlikti automatiškai jo ribose; žmogaus neapkrauname kiekvieno read/test patvirtinimu.

## 5. MVP riba ir įrodymai

Pirmas techninis MVP lieka browser/PDF/coding pjūvis. Buhalterinės programos [UI maketas](UI-WORKSPACE.md) yra jo būsimą taikymą paaiškinantis pavyzdys, ne naujas reikalavimas pirma įgyvendinti pilną apskaitos ERP. Galima įvertinti mažą sintetinių sąskaitų sąrašo kūrimo fixture kaip coding demonstraciją; tai nepakeičia norminių30užduočių ir nesuteikia finansinės atitikties teiginio.

- [ ] P0.29 Reuse planas su konkrečių kandidatų faktais, pasirinkimu/alternatyva, licencijų/API/priežiūros ir acceptance kriterijais.
- [ ] P2.14 Vienas ribotas naujo projekto kūrimo pjūvis: brief → pagrindas/komponentas → isolated build → veikiančio app preview → nepriklausomas testas → source/lock perdavimas. Missing, license/compatibility ir cap0 atvejai nesukuria tariamos integracijos.
- [ ] Parodyti, kokia darbo dalis iš tiesų pernaudota, kokia sukurta naujai ir kas liko nepatikrinta. Efektyvumo ar sutaupyto laiko procentai tik po matavimo.
