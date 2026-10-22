# Native Codex: tas pats promptas su Zero ir be Zero

2026-10-22 konkreti dviejų programų epocha aprašyta [užšaldomame native full-chain protokole](../benchmarks/native-full-chain-pilot/v1/README.md). Jo B yra visas įjungtas Zero + realus Jev, ne žemiau istoriniame bendrame metode atskirtas deterministic B. Inventory ir StockDesk naudoja konkrečias 16 KiB specifikacijas; žemiau esantis 5 MiB tekstas lieka ankstesnis draft, ne vykdomo bandymo promptas. Atskirai išsaugoti [paruošimo ir preflight faktai](experiments/REUSE-MODULE-CHAIN-2026-10-22.md); įgyvendinimo ir palyginimo baigtys dar nesuplakamos.

**Bendras metodas priimtas 2026-10-17; būsena atnaujinta 2026-10-22.** P1E.10–P1E.12 dar atviri. Ryšio ir riboti planavimo / programų bandymai vykdyti, bet pakartojama nauda nepriimta. [Dalinis programų bandymas](experiments/REUSE-MODULE-CHAIN-2026-10-22.md) sustabdytas grįžus prie planų peržiūros; B Zero nekvietė. Vėlesnėje [0.10.0 RepairDesk planų poroje](experiments/NATIVE-REPAIRDESK-PLANS-2026-10-22.md) B automatiškai kvietė Zero, bet discovery/Jev užklausos atmestos iki submit dėl termino. 0.10.1 pataisa turi atskiras regresijas; nauja native pora dar NOT_RUN. Programų kūrimas laukia žmogaus pilnų planų peržiūros. Reikia [MCP vertikalės ir profilio priėmimo](MCP-INTEGRATION.md). Šis dokumentas nepaleidžia modelių ir nenustato numanomo naujo API biudžeto.

Planavimo palyginimas yra diagnostinis etapas, ne visos programos lenktynės. Galutinį rezultatą sudaro planavimo/tyrimo, kūrimo/integracijos ir tikrinimo/taisymų laikas bei tokenai iki to paties nepriklausomai patikrinto kokybės slenksčio. Jev ir kiti mokami kvietimai įtraukiami; pagrindinio modelio prenumeratos USD kaina be patikimo receipt lieka nežinoma. Žmogaus planų peržiūros pauzė rodoma atskirai nuo aktyvaus darbo. Didesnis planavimo biudžetas gali atsipirkti vėliau, bet pats savaime nėra geresnio kodo ar sutaupymo įrodymas.

Naudojamas tikras Codex desktop ir naudotojo host paskyra. Atidėtas Codex CLI OAuth nėra šio profilio prerequisite; auth neeksportuojamas ir klientas tyliai nekeičiamas į CLI. Promptas žemiau yra draft, ne užšaldytas fixture. Protokolas/modelio profilis/laiko ribos ir vieša užduoties semantika galutinai fiksuojami iki bandymo.

## Pirma užduotis: Inventory Import

Pasirinkta maža **Inventory Import** vertikalė: CSV upload → strict validation → preview → atomic SQLite commit → reload/restart. Tai pakankamai platu parodyti realią komponento naudą ir pakankamai siaura atskiram tikrintojui.

Abu nauji native Codex projektai pradeda nuo identiško neutralaus starter snapshot, be įgyvendinto importo ir be Zero instrukcijų. Starter leidžia app paleisti ir turi pasirinktą runtime/SQLite prieigą; tai vis tiek nauji atskiri projektai, ne vienos sugeneruotos programos kopijavimas kitai pusei. Specifikacija nereikalauja konkretaus parserio ar HTTP framework. Zero pusėje paruošiamas vienas realus CSV parser komponentas, kurio package/pin/licencija/runtime užfiksuojami iki bandymo. Kandidatą parinkti pagal profilį; šiame plane neišgalvoti SHA ar tariamai jau kvalifikuoto paketo.

Siūlomas bendras prompto tekstas, užšaldomas tik po protokolo peržiūros:

> Build a small local inventory-import app in this starter. A user uploads UTF-8 CSV with headers sku,name,quantity. Support a UTF-8 BOM, LF/CRLF, quoted commas, escaped quotes, and quoted multiline names. Reject malformed quoting, missing or extra columns, blank SKU/name, duplicate SKUs within one file, and quantities that are not nonnegative integers. Preserve leading zeros in SKU. Show a preview and row/field errors; preview must not change SQLite. If any row is invalid, commit must be disabled and the database unchanged. A valid import atomically inserts or updates by SKU. Retrying the same completed import must not apply it twice. Persist data across app restart. Reject files over 5 MiB or 10,000 data rows with an understandable error. Provide an accessible upload/preview/commit flow, a run command, and tests. Use available tools and ordinary libraries as appropriate. Do not modify evaluation infrastructure.

Iki užšaldymo išspręsti whitespace, newline-normalization, idempotency key ir „retry completed import“ sutartį taip, kad vieša specifikacija ir nepriklausomi assertions nesiskirtų. Tos pačios viešos dev fixtures prieinamos A ir B; hidden holdout neatsiranda prepared recipe ar host kontekste.

Tikras reuse įrodymas B pusėje: lock/resolution rodo paruošto komponento versiją, verifier input pereina jo parse entrypoint, build/runtime evidence ir rezultatų receipt susieti su tuo pačiu source snapshot. Izoliuota neigiama kontrolė turi aptikti neveikiantį/bypass parser kelią, o ne vien importo eilutės trūkumą. Jei B galiausiai pasirinko native kodą ar kitą biblioteką, fiksuoti „prepared but not used“, o ne reuse sėkmę.

Validator tikrina API/import correctness, atomicity po injected failure, retry, SQLite restart ir tikrą browser upload/preview/disabled/error/commit srautą. Publikuotas PASS ribojamas šia specifikacija. Nei naujos CSV funkcijos, nei MCP proof nepakeičia browser/PDF modulių ir G2 imties.

## Native Codex A/B protokolas

Pirmiausia backend ir protokolas, tik tada du nauji pokalbiai. Šio audito ar pagrindinio planavimo pokalbio neforkinti į benchmark: jie jau žino kandidatą ir tikrinimo spragas. Pirmas vienos poros bandymas vadinamas pilotu, ne statistiniu pranašumu.

2026-10-22 naudotojo patikslinimas: **natūralus palyginimas turi prasidėti vienoda programos užduotimi be paieškos ar reuse užuominų**. Prompte neprašyti ieškoti GitHub, atrinkti bibliotekų/modulių ar kviesti Zero. B atranką turi paskatinti pats iš anksto užfiksuotas įdiegtas skill/MCP. Pasirenkamas 0.8.1 projekto prijungimas prideda bendrą, užduoties atsakymų neturinčią `AGENTS.md` taisyklę; jei jis įtrauktas, tai aiškiai deklaruoti kaip papildomą B intervencijos dalį, ne vien MCP poveikį. Jei user paprašo pirmiausia plano ir pauzės, tą patį prašymą gauna abi pusės ir kūrimas laukia žmogaus peržiūros; specialus modulių atrankos checklist į natūralų promptą nepridedamas. Įprastų bibliotekų/paieškos teisių A pusėje neriboti. Nekvietė MCP ar nerado tinkamo komponento — išsaugomas rezultatas, ne priežastis įterpti papildomą užuominą. Explicit connection/use smoke ir strategiją nurodantis eksperimentas žymimi atskirai.
### Intervencijos

| Grupė | Leidžiama aplinka | Ką vertina |
|---|---|---|
| A | Native Codex ir jo įprasti sutarti tools, paieška, paketų/library naudojimas; Zero MCP/skill/hook/metadata nėra | Sąžiningas native baseline |
| B | Tas pats native Codex profilis + Zero deterministic MCP ir trumpas užfiksuotas naudojimo skill | Viso Zero pagalbos paketo papildoma vertė |
| S, pasirinktinai vėliau | Ta pati bendroji reuse metodikos skill, bet be Zero MCP, katalogo ir paruoštų artefaktų | Instrukcijos nauda prieš backend naudą; tai atskira intervencija |
| C, atskirai | Tas pats B + užfiksuotas Jev sprendimo taškas, tik po J1/J2 ir cap | J3 papildoma Jev nauda; B/C skiriasi tik ta intervencija |

A negalima drausti įprastų bibliotekų ar viešų upstream šaltinių. Jis gali savarankiškai pasirinkti tą patį parserį. B pranašumas turi kilti iš pagalbos surandant/paruošiant/tikrinant, o ne dirbtinai blogesnių A teisių. Jei B turi papildomą skill, A/B nevadinti „vien MCP transporto“ eksperimentu.

### Tikrai išjungta Zero A pusėje

Vien „A nepakvietė tool“ nepakanka. Prieš promptą užfiksuoti resolved host konfigūracijos/profile ir startup inventorių: aktyvūs MCP serveriai, pasiekiami tools įskaitant lazy discovery, skills pavadinimai/aprašai, plugins, hooks, project/user/parent AGENTS ir atminties/istorijos šaltiniai. A nėra Zero tool metadata, skill ar reuse guidance, net jei tool nebūtų iškviestas. Claude dokumentai taip pat aiškiai nurodo enabled plugin konteksto ir procesų kainą; Codex faktinę aprėptį tikrinti jo konkrečiame host, ne perkelti prielaidą iš Claude. [Claude plugin footprint](https://code.claude.com/docs/en/plugins).

Darbo vietos neprivalo gyventi po RepositoryZero repo: jo AGENTS, tėvų taisyklės, auditai, užšaldyti grader ar ankstesni trial artefaktai neturi nutekėti. A/B turi atskirus projekto katalogus, DB, portus, temp/cache namespace ir Zero scope; nėra dalijamo read-write komponento, kuris perduotų B sprendimą A. Shared package cache leidžiamas tik aiškiai deklaruotame warm profilyje, be solution artefaktų.

Project-level disable naudoti tik patvirtinus, kad konkretus desktop klientas jį realiai pritaiko naujam pokalbiui. Jeigu globaliai įdiegtas Zero vis tiek reklamuojamas A, bandymas nėra švarus. Neperjunginėti globalaus serverio po vieno jau pradėto pokalbio ir neskelbti izoliacijos. Jei tame desktop neįmanoma izoliuoti dviejų profilių, užblokuoti švaraus native A/B teiginį ir pasirinkti atskirai patikrintą native profile/session kelią. Neapeiti to eksportuojant auth ar tyliai pakeičiant desktop į CLI.

### Užšaldymas ir eiga

Iki starto išsaugoti: exact starter/source/prompt/grader/schema/Zero/plugin/recipe/package digests; host app ir CLI jei naudojamas versijas; operatoriaus pasirinktą tikslų modelį/effort ir prieinamumo patvirtinimą; tool/network/shell/approval profilį, runtime/OS/resursus, max trial laiką, intervencijų/repair ribą ir visas mokamas caps. A/B task prompto baitai ir hash turi sutapti; B skirtumas yra užfiksuotas papildomas įrankių/skill paketas. Pridėti „naudok Zero“ ar plugin mention tik į B promptą reiškia kitą eksperimentą. Toks explicit smoke naudingas connection/use patikrai, bet atliekamas atskirame disposable projekte ir pokalbyje, ne formalioje poroje. Svetainės „Try with Zero“ deep link nėra formalios A/B poros starto mygtukas, jei įterpia papildomą promptą.

Modelio label vienas nėra provider atestacija. Fiksuoti faktinį host model receipt, kiek jis prieinamas, ir matomumo ribą. Jei modelis neprieinamas, quota baigėsi ar host tyliai pakeitė modelį, bandymo nevadinti suderinta pora. Išsaugoti invalid/unavailable bandymą su priežastimi; nekeisti modelio tik vienai pusei ir neišmesti tokio įvykio iš operacinės ataskaitos.

Žmogus mato originalius native pokalbius, jų tikrą eigą ir Zero job receipts. Išgalvotas progress ar retrospektyviai atkurti tool įvykiai netinka. Sėkmės vertinimą atlieka atskiras užfiksuotas grader; autoriaus pranešimas „veikia“ nėra acceptance. Jei žmogus vienai pusei duoda papildomą sprendimo užuominą, užfiksuoti intervention ir porą vertinti pagal iš anksto nustatytą taisyklę.

Pirmą porą geriau vykdyti nuosekliai, atsitiktine iš anksto užfiksuota A/B tvarka, kad to paties account quota, CPU/diskas/portai nesudarytų vienalaikės konkurencijos. Abu pokalbiai lieka peržiūrimi. Vėlesniuose pakartojimuose tvarką subalansuoti. Lygiagretus demo, jei jo žmogus vėliau norės, yra kitas apkrovos profilis, ne automatiškai toks pats benchmark.

### Matavimas ir teiginio riba

Rodyti outcome pagal kiekvieną domeno kriterijų, visą elapsed iki patikrinto rezultato, žmogaus laiką, tool calls ir Zero jobs, setup/discovery/prepare/integrate/verify/repair laikus, cold/warm būseną, host usage/cache kur matoma, Zero tikras sąnaudas ir unknown. Ta pati galutinė kokybės kartelė abiem. Failed/cancelled/time-capped bandymai lieka visų pradėtų bandymų vardiklyje; protocol-invalid bandymai atskirai suskaičiuojami ir paaiškinami.

Cold apima komponento parsisiuntimą/build/setup. Warm kartojimas naudoja naujus input, o ne paruoštą ankstesnį atsakymą. Host/provider prompt cache gali būti nevaldomas: fiksuoti tai ir subalansuoti tvarką, nevadinti „cache off“, jei to neįrodėme. B paruošto recepto kūrimo kaštą parodyti atskirai ir amortizacijos scenarijuje; jo neslėpti vien dėl to, kad padarytas iki laikmačio.

Pirma pora patikrina, ar protokolas paleidžiamas, ir pateikia konkrečius rezultatus. Pakartotiniam benefit reikia naujų subalansuotų porų, daugiau nei vieno task/input ir iš anksto nustatytos kokybės/kašto taisyklės; imties dydį parinkti po piloto variacijos. Nekartoti to paties holdout po kiekvieno pataisymo ir nevadinti jo nauju. B prieš A nauda neįrodo C prieš B Jev naudos. Lengvesnis vartotojo įėjimas per MCP kol kas yra hipotezė; ją tikrinti setup completion/time-to-first-useful-result su nauju žmogumi, ne GitHub stars.

[Kalibravimo metodas](CALIBRATION.md) · [Istorinis CLI protokolas](PAIRED-BENCHMARK.md) · [Visi priėmimo darbai](../ROADMAP.md).
