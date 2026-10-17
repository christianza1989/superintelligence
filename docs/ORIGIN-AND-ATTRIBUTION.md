# Projekto kilmė ir autorystės įrodymai

> **Kilmės ir licencijų nuorodos · peržiūrėta 2026-10-17.** Komandų paskirtį ir istorinius rezultatus skirti nuo pilno produkto acceptance. Ši antraštė nepervertina senų kohortų. Dabarties autoritetas: [būsena](IMPLEMENTATION.md), [priimta architektūra](DECISIONS.md), [roadmapas](../ROADMAP.md).

2026-10-16 UTC. Šis dokumentas padeda užfiksuoti konkrečių medžiagų kilmę. **Tai nėra nepriklausoma laiko žyma, registracija, tapatybės patvirtinimas ar teisinės išimtinės teisės į bendrą idėją suteikimas.**

## Ką galima pagrįsti

Šio pokalbio naudotojas suformulavo RepositoryZero produkto kryptį: AI pirmiausia ieško žmonių jau sukurtų ir išbandytų sprendimų, parenka tinkamą pagrindą ir papildančius komponentus, kuria trūkstamą dalį bei tikrina rezultatą. Jis taip pat pateikė autonominės priežiūros, bendruomenės modulių, projekto svetainės, Jev routing, daugiakalbio UI, juodos/salotinės temos ir cloud/Drive reikalavimus.

Dokumentacija, šaltinių tyrimas ir pirmas įgyvendinimas šioje sesijoje rengti su AI pagalba. Tai ne teiginys, kad šis bendras principas pasaulyje sugalvotas pirmą kartą ar kad visą esamą upstream kodą sukūrė projekto iniciatorius. GitHub projekto paskyra `christianza1989/superintelligence` pateikta naudotojo; teisinė paskyros savininko tapatybė šiame repo netikrinta.

Asmens gimimo data, namų adresas ir private identity dokumentai nepatenka į public Git failus, svetainę ar viešą katalogą. Individuali pasirašytina deklaracija ruošiama atskirai už Git repo ribų. Ruošinys nėra naudotojo parašas.

## Skirtingos apsaugos

| Priemonė | Ką padeda įrodyti ar apsaugoti | Ko nesuteikia |
|---|---|---|
| Nepriklausoma laiko žyma | Konkrečių failų/hash egzistavimą ne vėliau nei nustatytas laikas | Pati neįrodo, kas juos sukūrė, ir nesuteikia idėjos monopolio |
| Kvalifikuotas e. parašas su tinkama laiko žyma | Pasirašiusio asmens ryšį su konkrečia deklaracija ir pasirašymo įrodymais | Nepatvirtina teiginio „pirmas pasaulyje“ teisingumo |
| Datuotas public origin įrašas / GitHub release / istorija | Viešai matomą konkrečios produkto versijos kilmę ir komunikaciją | Vien pakeičiamas Git author date nėra nepriklausomas datavimo įrodymas |
| Autorių teisės | Taikytiną konkrečią originalią išraišką pagal jurisdikciją ir žmogaus indėlį | Paprastai nesaugo abstrakčios funkcijos, idėjos ar verslo modelio |
| Prekės ženklas | Konkretaus pavadinimo/ženklo naudojimą registruotose srityse ir teritorijose | Nesuteikia nuosavybės į produkto veikimo principą |
| Konfidencialumas | Dar neviešos medžiagos apsaugą pagal pasirinktą santykį/sutartį | Nepakeičia jau viešai paskelbtos informacijos istorijos |

Bendros idėjos ir programinės įrangos patentabilumas yra atskiras konkretus techninis/jurisdikcijos klausimas; datavimo paslauga patento nesuteikia. Prieš viešinant galimai patentuotiną konkretų techninį sprendimą reikalingas atskiras profesionalus įvertinimas.

## Paslaugos, kurias verta įvertinti

- [OpenTimestamps](https://opentimestamps.org/) — failo egzistavimo įrodymas, pagrįstas Bitcoin blockchain. Oficialus [kliento README](https://github.com/opentimestamps/opentimestamps-client/blob/cd71c7609421bed2a07b9642a3c02a58c9fd2cdf/README.md) patvirtina stamp/upgrade/verify srautą, uždelstą patvirtinimą ir opaque digest perdavimą vietoj failo turinio. Pati hash žyma netapatina autoriaus. Tiksli kliento verifikavimo aplinka ir proof saugojimas turi būti patikrinti; šioje sesijoje kliento neinstaliavome ir remote stamp nekvietėme.
- [Safe Creative](https://www.safecreative.org/en) — kūrinių registravimo paslaugos kandidatas. Registruojama konkreti medžiaga/deklaracija, ne abstrakčios idėjos monopolija. Dabartinis planas, konfidencialumo/viešinimo taisyklės, tapatybės būdas ir kaina šioje aplinkoje nepatikrinti.
- ES kvalifikuota elektroninė laiko žyma ir parašas per [EU Trusted List](https://eidas.ec.europa.eu/efda/trust-services/browse/eidas/tls) nurodytą tinkamą paslaugą — atskirai tikrinant tikslų paslaugos qualified statusą, PDF formatą ir ilgalaikę verifikaciją. [eIDAS reglamentas](https://eur-lex.europa.eu/eli/reg/2014/910/oj/eng), ypač41straipsnis, skiria qualified timestamp įrodomąją reikšmę nuo bendros nuosavybės teisių.

Šioje aplinkoje WIPO, OpenTimestamps svetainės, Safe Creative ir ES institucijų domenų tiesioginiai puslapiai buvo proxy403, todėl jų dabartinių komercinių ar teisinių pakeitimų neskelbiame patikrintais. OpenTimestamps oficialus GitHub source/README perskaitytas. Aukščiau pateikta bendro pobūdžio apsaugos skirtumų informacija, ne konkretaus ginčo teisinė išvada.

## Praktinis projekto įrašas

1. Išsaugoti konkrečios versijos brief, planą, roadmapą, dizaino medžiagą, versijų/source ir upstream attribution įrašą.
2. Sudaryti SHA-256 manifestą ir ZIP, išsaugoti originalų paketą. Vietinis `prepared_at` yra darbo aplinkos laikas, ne nepriklausomas sertifikatas.
3. Pasirinkta paslauga suteikti nepriklausomą žymą paketui/hash; išsaugoti proof ir jo verifikavimo rezultatą. Pasirašyta asmeninė deklaracija susieja konkretų iniciatorių su konkrečiu hash.
4. Viešinant naudoti aiškų iniciatoriaus/kilmės įrašą, release/README ir projekto pavadinimą. Neskelbti privataus adreso ar tapatybės dokumentų kaip reklamos priemonės.

Atviras projektas sąmoningai leidžia naudoti jo kodą pagal licenciją. Dabartinė Rakazo adaptacija turi Apache-2.0 pareigas ir upstream notices; jų nepanaikina iniciatoriaus autorystės deklaracija. Trečiųjų šalių kodas išlieka jų kilmės. Mūsų originalaus žmogaus indėlio, AI pagalbos, kodo licencijos ir RepositoryZero ženklo klausimai yra skirtingi. [Upstream įrašas](../platform/UPSTREAM.md), [NOTICE](../NOTICE).

Šiame etape nėra public pirmumo paskelbimo, užsakytos paslaugos, nepriklausomo stamp, kvalifikuoto parašo ar prekės ženklo registracijos. Privatūs peržiūrimi ruošiniai nėra viešas paskelbimas.
