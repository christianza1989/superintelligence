# StudioDesk: kodėl planavimas su Zero pabrango

2026-10-22. Papildoma užbaigtos [0.10.5 planų poros](NATIVE-STUDIODESK-PLANS-2026-10-22.md#galutinė-0105-planų-pora) analizė pagal originalius native transcript, usage įvykius, SHA patikrintus worker receipt ir užfiksuotos versijos kodą. Nauji modelių kvietimai ar programų kūrimas neatlikti. Tai diagnozė ir siūloma darbų seka, ne priimtas naujas ADR ar įgyvendintų pataisų ataskaita. Roadmap vartai neuždaromi.

**Išvada:** šioje užduotyje Zero pridėjo šaltinių tyrimą, tačiau nepateikė parengto konkretaus modulio, kuris sumažintų host kūrimo darbą. Veikianti GitHub/Jev/source skaitymo grandinė nėra universali modulių parinkimo, paruošimo, integravimo ir elgesio patikros grandinė. Galutinis B sprendimas buvo kandidatus palikti architektūros nuorodomis. Tai neįrodo, kad jų atskiri moduliai netinkami arba kad visame GitHub nėra tinkamų komponentų.

## Ką iš tikrųjų matavome

Abu nauji pokalbiai: `gpt-6-luna` / high, vienodas natūralus promptas ir SPEC, plan-only, B tada A. B intervencija apėmė plugin ir bendras operatoriaus projekto gaires; cache nekontroliuotas. Viena pora neįrodo pakartojamo efekto. Originalios planų, transcript ir receipt bylos nekeistos.

| Rodiklis | A be Zero | B su Zero |
|---|---:|---:|
| Visas užfiksuotas planavimo laikas | 78.994 s | 221.097 s |
| Host input | 231,919 | 1,992,421 |
| Cached input, jau įtrauktas aukščiau | 167,552 | 1,896,064 |
| Uncached input | 64,367 | 96,357 |
| Host output, įskaitant reasoning | 6,382 | 13,370 |
| Host total | 238,301 | 2,005,791 |
| Modelio atsakymų usage įrašai | 6 | 30 |
| Paskutinio atsakymo input kontekstas | 52,585 | 103,805 |
| MCP kvietimai | 0 | 57 |

B užtruko 142.103 s ilgiau, arba 2.80 karto. Bendrų host tokenų 8.42 karto daugiau; uncached input padidėjo 49.7 %, output — 109.5 %. Cached dalis A 72.2 %, B 95.2 %. Bendrų tokenų santykis nėra prenumeratos kainos ar USD santykis; host faktinė kaina nežinoma. Cached input ir reasoning negalima pridėti antrą kartą prie input/output.

Jev atliko tris realius kvietimus: provider-reported USD **0.000343434**. Jo 8,177 input tokenai naudotojo pasirinkimu yra tik audito apskaitoje, 129 output pateikiami atskirai; jų nėra lentelės host skaičiuose. Worker kvietimų trukmė apima GitHub tyrimą ir modelį, ne vien Jev latenciją.

## Planų skirtumas ir kokybė

| Sritis | A | B | Vertinimas |
|---|---|---|---|
| Pagrindas | Tauri, React/TS, Rust, FFmpeg, SQLite | Ta pati technologijų kryptis | Zero nepakeitė esminės architektūros |
| Projekto tiesa | Projekto SQLite saugo redagavimo modelį; atskira biblioteka | Versijuotas JSON modelis, SQLite indeksui | Abu galimi sprendimai; gedimų ir migracijų bandymo nėra |
| Konkretumas | Aiškesnis CPU atskaitos rendereris, WAL ir proceso argumentų valdymas | Trijų repo pin ir tikri priklausomybių neatitikimai | B pridėjo kilmės ir tyrimo įrodymų, ne įrodytą kūrimo spartą |
| Vietinis AI | Daugiau konkrečių, dar nekvalifikuotų kandidatų | Daugiau adapterių aprašymo, dalis pasirinkimų palikta atvira | Nei kalbų kokybė, nei modelių tinkamumas nepatikrinti |
| Sudėtingi varikliai | Konkretus sluoksnių kompozitorius ir preview/export atitiktis neišspręsti | Tie patys esminiai tarpai | Kritinių realizavimo klausimų Zero neuždarė |
| Kodas ir priėmimas | NOT_RUN | NOT_RUN | Kodo kokybės laimėtojo nėra |

„Nepasirinko modulių“ tiksliau reiškia **nepasirinko naujo Zero pasiūlyto modulio integravimui**. Abu planai jau numato pernaudoti bendras bibliotekas ir įrankius, įskaitant FFmpeg; A taip pat pasiūlo whisper.cpp. Zero vertė turi viršyti tai, ką modelis įprastai pasirinktų pats. B taip pat turi netaisyklingos kalbos fragmentą ir dalį undo/atkūrimo sutvirtinimo nukelia vėlai; daugiau šaltinių nesuteikia automatinio kokybės pranašumo.

## Priežastys pagal kodą ir žurnalą

1. **Per daug host valdomų tarpinių veiksmų.** 57 MCP kvietimus sudaro status 1, search 4, discover 3, source 11, reuse_job 29 ir reuse_artifact 9. Iš 29 poll atsakymų 16 buvo `unknown/no_terminal_receipt`, 13 — `succeeded`. [Job įrankis](../../platform/packages/adapters/src/zero-mcp-reuse-tools.ts) tik grąžina dabartinę būseną; jis nelaukia iki rezultato. Kiekvienas source skaitymas taip pat tampa submit → poll → artifact grandine. Host padarė 30 modelio atsakymo ciklų vietoje 6; vidutinis input vienam ciklui padidėjo nuo 38,653 iki 66,414 tokenų. Taip susidaro daug kartų pakartotinai perduodamas kontekstas.
2. **Laikas nėra vien MCP transportas ar Jev.** Tarp pirmo MCP kvietimo pradžios ir paskutinio pabaigos praėjo apie 127.4 s; pačių MCP kvietimų trukmių persidengimų sąjunga — apie 15.2 s. Likusio intervalo negalima automatiškai vadinti vien modelio darbu: jame taip pat yra fone vykstantys darbai, eilė ir kiti host veiksmai. Trys discovery darbai worker pusėje vykdyti nuosekliai: 13.519, 13.290 ir 13.225 s, bendras jų pradžios–pabaigos intervalas 40.452 s. Tiksli papildomų 142.103 s priežastinė procentinė išklotinė šiuo eksperimentu neizoliuota.
3. **Vienas pasirinkimas keliems nepriklausomiems poreikiams.** Media užklausa jungė timeline, waveform ir layered image editing; AI užklausa — STT, TTS ir vaizdų generavimą/redagavimą/fono šalinimą. [Jev selector](../../platform/packages/adapters/src/zero-repository-selector.ts) pateikia vieną `choice` klausimą: rekomenduoti vieną repo tolesniam tyrimui arba susilaikyti. Jis negrąžina atskirų pasirinkimų kiekvienam poreikiui, konkrečių modulio ribų, API ar adaptavimo darbo. Vienas TTS repo negali tuo pačiu atrankos atsakymu išspręsti STT ir paveikslų variklių.
4. **Trumpa repo paieška nėra geriausių modulių atranka visame GitHub.** [Discovery](../../platform/packages/adapters/src/zero-github-discovery.ts) ieško pavadinime/apraše, ima iki 10 rezultatų vienai frazei ir jungia paieškų rangus. Leidžiama iki 5 išsamiau tiriamų repo, bet šiame bandyme dėl 12 s tyrimo biudžeto kiekvienam darbui surinkti tik 2 pin — iš viso 6. Visi trys tyrimai pažymėjo deadline; rate limit nebuvo. Tai dalinė aprėptis, ne globalus optimumas ir ne visų netinkamumo įrodymas.
5. **Kodo įrodymai per seklūs konkrečiam moduliui.** Discovery pagal kelio žodžius pasiima pirmą kodo failą; Jev skirtame santraukos lauke jo excerpt ribojamas iki 400 simbolių. Tarp tikrų mėginių buvo Cutnora `src/app/editor/layout.tsx` ir giliai esantis TTS `text_encoder.py`. Failų buvimas ir hash patvirtinti, tačiau tai nėra tikslinės timeline operacijos ar savarankiško TTS adapterio sąsajos analizė. OpenScene discovery neturėjo peržiūrėto kodo mėginio. Vėliau modelis gavo README/package/pyproject ir katalogų įrodymus, tačiau jų nepakako pasirengusio modulio pasiūlymui.
6. **Rasti neatitikimai vertinti visos programos mastu.** B pažymėjo OpenScene debesijos priklausomybes, Cutnora naršyklinę struktūrą ir TTS Audio Suite ComfyUI susiejimą. Tai svarbūs faktai, bet visos programos neatitikimas neįrodo, kad konkretus atskiriamas komponentas netinka. Nebuvo nustatyta jo transityvinių priklausomybių riba, vieša sąsaja ir adaptavimo kaina, todėl nebuvo pagrindo nei žadėti reuse, nei atmesti visus modulius.
7. **Dalis atlikto tyrimo apskritai nepasiekė plano.** Worker užbaigė 11 source skaitymo darbų, bet modelis perskaitė 6 jų receipt; kitus 5 perskaitė tik observer po plano. Tarp jų buvo gilesnių modulių katalogų peržiūros. Negalima šių rezultatų laikyti modelio panaudotais įrodymais. Įrankių eiga turi užtikrinti suplanuoto tyrimo užbaigimą arba aiškiai pažymėti atsisakytą tyrimą.
8. **Bibliotekos dydis neatitinka parengtų komponentų aprėpties.** 796 katalogo repo nėra 796 kvalifikuoti moduliai. Dabartinis [modulių registras](../../platform/packages/core/src/zero-reuse-modules.data.json) turi d3-dsv, PapaParse ir fflate; [source profiliai](../../catalog/source-profiles.json) aprašo ERPNext, Frappe ir InvenTree. Šiai multimedijos užduočiai parengtų timeline, kompozicijos, STT/TTS ar generavimo profilių nėra. Bendras GitHub tyrimas egzistuoja, bet savaime nesukuria trūkstamų integravimo receptų.

## Rekomenduojama taisymo seka

**Pirmiausia sumažinti host darbą, tada stiprinti pasiūlymo turinį.** Tai siūlomas prioritetas esamiems P1X.5–P1X.7 ir P1E.10–P1E.12 darbams, ne naujas scheduler ar universalaus installer pažadas.

1. **Vienas ribotas užklausos–rezultato kelias.** Esamame API/Graphile vykdyti poreikio tyrimą, reikalingų tikrų kelių skaitymą ir pasirinkimo suvestinę. MCP leisti ribotai laukti esamo darbo arba grąžinti resumable job ID; neverskite pagrindinio modelio ciklais klausti nepakeistos būsenos. Trumpas sprendimas su evidence nuorodomis pagal nutylėjimą, pilni įrodymai — pareikalavus. Trumpos aktyvaus profilio skill gairės; kitų profilių instrukcijos įkeliamos tik prireikus. Cache pagal repo + pin + failo hash + policy/profile versiją; dabartinės prieigos/politikos tikrinimo cache nepakeičia. Prieš plėtrą atskirai pamatuoti šaltą ir šiltą kelią. Esamus timeout, cancellation, lease, kvotas ir permission ribas išlaikyti.
2. **Atrinkti po vieną aiškų gebėjimą.** Atskiri STT, LT TTS, timeline ir sluoksnių kompozicijos poreikiai su tikromis platformos, offline, sąsajos ir resursų ribomis. Ankstyvas deterministic filtravimas, tada Jev vertina atskiro poreikio kandidatus iš perskaitytų manifestų, entrypoint ir testų. Jev lieka pigus atrankos sluoksnis; daugiau tokių pačių bendrų repo pasirinkimų nepašalins įrodymų stokos. Vienas pasirinkimas kiekvienam poreikiui su alternatyva ar honest unknown/no-fit; jokio išgalvoto tinkamumo procento.
3. **Grąžinti sprendimui paruoštą modulio pasiūlymą.** Reikalingi repo/pin ir tikslus paketas ar failų rinkinys, public entrypoint, įvesties/išvesties sąsaja, priklausomybių riba, licencijų kilmė, platformos/aparatūros apribojimai, ką host turėtų parašyti, ką komponentas jau daro ir kaip tai bus patikrinta. Atskirti visos programos pagrindą, bibliotekos panaudojimą, proceso adapterį, failų perėmimą ir paprastą nuorodą. Vertinti tikėtiną sutaupytą kūrimo darbą atėmus paiešką, adaptavimą, patikrą ir priežiūrą; iki matavimų tai tik įvertis. Nepersistengti ieškant, kai pakanka standartinio sprendimo ar tinkamo modulio nerasta.
4. **Užbaigti vieną realią vertikalę prieš platesnį katalogą.** Atskirame development darbe kvalifikuoti vieną ribotą, naudingą komponentą: immutable pin/lock/license, adapterio sutartis, leidžiama izoliuota conformance patikra ir tikro iškvietimo įrodymas. Plan-only metu tokių vykdymų nedaryti. Katalogą plėsti pagal gebėjimų spragas, ne pagal repo skaičiaus tikslą. Nepildyti benchmark katalogo vien tam, kad StudioDesk atrodytų palankiau; jo rezultatus laikyti development duomenimis, naudą vertinti kitomis užduotimis.
5. **Matuoti visą užduotį.** Po žmogaus planų peržiūros ir atskiro vykdymo pradžios sprendimo — naujos švarios sesijos, vienodas promptas, tie patys kokybės reikalavimai ir nepriklausomas grader. Atskirai planavimas, kūrimas, tikrinimas/taisymas, setup/cold/warm ir nesėkmės; visa suma bei cache-aware host usage ir tikra Jev kaina. Šioje poroje reuse turėtų sutaupyti daugiau kaip papildomas 142.103 s vien tam, kad atpirktų stebėtą planavimo skirtumą; tai aritmetinis slenkstis šiai porai, ne ateities garantija. Vien komponento parinkimas ar hash nėra actual use, o actual use nėra naudos įrodymas.

Šis rezultatas pagrindžia investiciją į konkretų mažo masto naudos patikrinimą. Jis nepagrindžia nei viso produkto pranašumo skelbimo, nei išvados, kad reuse idėja neveikia. Brangiausia dabartinė spraga — host atliekamas tyrimo valdymas be konkretaus darbą mažinančio komponento pasiūlymo.
