# Web, desktop, savo jungtys ir mokami kreditai

> **Planuojama produkto specifikacija · peržiūrėta 2026-10-17.** Aprašo siekiamą elgesį; schemų pavyzdžiai ir maketai savaime nėra įgyvendintos funkcijos. Daliniai foundation komponentai nekeičia viso vartų statuso. Datuotos įgyvendinimo pastabos žemiau nėra atnaujinta būsenos suvestinė; senos kainų/auth/source prielaidos tikrinamos prieš realų profilį. Dabarties autoritetas: [būsena](IMPLEMENTATION.md), [priimta architektūra](DECISIONS.md), [roadmapas](../ROADMAP.md).

2026-10-16. **Produkto reikalavimai, dar neįgyvendintas mokamas paslaugos režimas.** Pirmas MVP turi web sąsają; Windows/macOS/Linux paketai ir jų backend paleidimas turi atskirus roadmap vartus. Savo modelių jungtis numatyta ir web, ir atsisiunčiamame kliente.

## Naudotojo pasirinkimai

| Režimas | Kas apmoka modelį | Raktų ir vykdymo riba |
|---|---|---|
| Savo API paskyra (RepositoryZero BYOK) | Naudotojas tiesiogiai moka pasirinktam teikėjui | Web: šifruota, tenant apribota serverio jungtis; desktop/local: vietinė saugi jungtis. Kito naudotojo raktas negali būti naudojamas |
| Oficialiai palaikomas OAuth | Pagal konkretaus teikėjo paskyrą ir sąlygas | Tik tos jungties realiai leidžiami modeliai ir naudojimo būdas; prenumerata automatiškai nesuteikia visų trečiųjų šalių API teisių |
| RepositoryZero naudojimo kreditai | Naudotojas atsiskaito už mūsų teikiamą paslaugą | Mūsų provider raktas tik serverio brokerio riboje; į naršyklę ar `.exe` neįdedamas |
| Lokalūs modeliai | Naudotojo įranga ir jos resursai | Local/desktop profilis; hosted web prieigai prie vietinio inference reikėtų atskiro leistino bridge, ne numanomos prieigos prie kompiuterio |

RepositoryZero BYOK reiškia savo jungtį mūsų programoje. OpenRouter atskirai gali vadinti BYOK savo klientų upstream provider keys funkciją; tai skirtingi sluoksniai ir jų mokesčiai nesutapatinami. Galimas platformos hosting/storage/service mokestis turi būti aiškiai atskirtas nuo provider sąnaudų. Kainynas, merchant account ir mokėjimo gavėjas dar nepasirinkti.

## Hosted kreditai ir antkainis

Techninė kryptis — iš anksto papildomi paslaugos kreditai, baigtinis užduoties rezervas ir atsiskaitymas pagal patikimą faktinio naudojimo kvitą. Pavyzdžiui, **hipotetinė**0,10USD provider kaina su20%antkainiu duotų0,12USD paslaugos kainą iki kitų mokesčių. Tai kainodaros ar grynojo pelno pažadas nėra; mokėjimo, valiutos, infrastruktūros ir taikomi mokesčiai vertinami atskirai.

Skaičiuojami pagrindinio modelio, Jev, child agentų, repair/retry ir kitų leistinų mokamų veiksmų kaštai. Cached/reasoning/input/output/media billing skirtumai nepaslepiami po vienu tariamu universaliu tokeno tarifu. Tarifų/modelio versija ir valiutos perskaičiavimo taisyklė fiksuojama užduoties quote. Klientas negali pats pateikti savo mažesnės kainos ar patvirtinti apmokėjimo.

Provider account biudžetas ir kliento kreditų ledger yra atskiri, abu būtini: pirmas riboja mūsų išorinę riziką, antras — konkretaus naudotojo rezervą ir atsiskaitymą. Lygiagretūs darbai negali pakartotinai panaudoti to paties kredito. Payment webhook, top-up, refund ir usage kvitai turi savo idempotency ir atsekamumą; pranešimas iš browser nėra patikimas mokėjimo patvirtinimas. Timeout/unknown neatlaisvina galimai apmokestinto provider rezervo kaip nemokamo kvietimo.

Esamas [baigtinių rezervų ledger](BUDGET-FOUNDATION.md) nėra piniginė, top-up ar tikros sąskaitos reconciliation. Prieš implementuojant cashflow pernaudojimui vertinami esami Rakazo `StripeBillingProvider`, billing DB ir jų conformance testai; dabartinis subscription/seat kontraktas nevadinamas jau paruošta usage kreditų sistema. Naujas finansinis sluoksnis neįjungiamas vien pakeitus UI tekstą.

## Auto model ir Jev

Naudotojas renkasi fiksuotą modelį arba Auto profilį. Auto gali rinktis tik iš prijungtų, leistinų modelių, atitinkančių task capability/context ir spend profilį. OpenRouter gali suteikti kelių šeimų pasirinkimą; OAuth vienam teikėjui apsiriboja jo realiai suteikiamais modeliais. Modelių vartotojo pateikti vardai yra pavyzdžiai, o ne patvirtintas konkrečios paskyros katalogas.

Jev galėtų rinkti profilį plano žingsnio pradžioje iš nedidelio tinkamo rinkinio; vienas akivaizdus variantas nereikalauja papildomo mokamo call. Modelis keičiamas tarp aiškių etapų, išlaikant kanoninę užduoties būseną/artefaktus ir apskaitant reikalingą konteksto paruošimą. Sudėtingesnio modelio escalation vyksta tik iš anksto pasirinktų ribų viduje. Pigesnio modelio repair grandinė taip pat yra kainos dalis; Auto kokybę lyginame pagal užbaigtą užduotį.

## Sąlygos ir dabartinė būsena

Viešų OpenRouter terms/usage-accounting/BYOK puslapių patikra šiame host nepavyko (`URLError`); tai nėra sąlygų patvirtinimas ar draudimo įrodymas. Prieš hosted pardavimą būtina perskaityti tuo metu galiojančias OpenRouter ir pasirinktų modelių/provider sąlygas, duomenų gavėjų/prieinamumo bei komercinio paslaugos teikimo ribas. SDK licencija tokios teisės savaime nesuteikia. Mokėjimų teikėjo sąlygos ir savininko kainynas taip pat dar nepatikrinti.

Šiame darbe neprijungta merchant paskyra, neatliktas joks mokėjimas, nenustatytas tikras antkainis ir nepateiktas modelio raktas. [Jev pritaikymo planas](JEV-APPLICATIONS.md), [provider ir OAuth politika](MODELS-AND-TOOLS.md), [MVP būsena](IMPLEMENTATION.md).
