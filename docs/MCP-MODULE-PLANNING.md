# Konkretaus modulio planavimas per MCP

0.11.1 / schema 1.12.1 papildo esamą `zero_discover` kelią. API, PostgreSQL, Graphile worker, operatoriaus grant ir baigtinis Jev biudžetas lieka tie patys. Tai šaltinių pasiūlymai planui, ne universalus paruošimas ar runtime kvalifikacija.

## Vienas poreikis — vienas pasirinkimas

`goal` saugo realius apribojimus, `queries` — trumpas alternatyvias vieno gebėjimo frazes. Pasirenkamas `module` aprašo `inputs`, `outputs` ir `runtime`. Nepriklausomiems gebėjimams reikia atskirų pasirinkimų: vienas TTS repo nepakeičia STT ir paveikslų generavimo atrankos.

Darbininkas surenka ribotus GitHub faktus, tikslius commit/hash, manifestus, tikrus kodo failus ir rastas deklaracijų/importų eilutes. Package įėjimo taškai ir poreikiui artimesni keliai turi prioritetą prieš pavyzdžius, vendor, konfigūraciją ar bendrus page/layout failus. Python/Rust/Go/CMake priklausomybių failai saugomi kaip hash susieti excerpt; JSON package manifestuose perskaitomi vardai, versijos, įėjimo taškai, dalinės priklausomybės ir lifecycle script vardai. Script nevykdomi. Atpažįstamos ir CommonJS/UMD eksporto deklaracijos; tai statinio teksto stebėjimai, ne AST, public API semantikos ar elgesio įrodymas.

Jev gauna konkrečius šaltinio vienetus ir vieną sąsajos poreikį. Visas repo neprivalo įgyvendinti visos programos. Be peržiūrėtos modulio sąsajos mokamas dispatch neatliekamas. No-fit, abstention, nepakankama aprėptis ir nežinomas suderinamumas išlieka galimi rezultatai.

Kai paieška grąžina nulį ir frazėje yra bendri diegimo žodžiai, pvz. `library` ar `offline`, leidžiamas vienas jų pašalinimo bandymas. `searches.relaxedFrom` išsaugo originalą, o tinkamumo apribojimai lieka poreikyje. Iki trijų originalių frazių, iki vieno papildomo bandymo kiekvienai; bendri request/byte/time limitai lieka. Tai ne globaliai geriausio modulio ar išsamios GitHub aprėpties garantija. `incomplete` ir tyrimo deadline rezultatuose išsaugomi.

## Trumpas atsakymas ir tęsiamas darbas

Modulio užklausa pagal nutylėjimą laukia iki 20 s. Jei darbas užbaigtas, tas pats MCP atsakymas grąžina `decision` su pilno receipt SHA ir tapatybės patikra. Jame yra modulis/pin, deklaracijos/importai, daliniai priklausomybių įrodymai, adapterio planas, patikros ir neatsakyti klausimai.

Jei darbas dar vyksta, grąžinamas esamas job ID ir `retryAfterMs`; `zero_reuse_job` su `waitMs: 20000` ribotai laukia jo nepateikdamas iš naujo. Didėjantis polling intervalas kliento viduje mažina host MCP/modelio ciklus; tai nereiškia nulio vidinių API/DB skaitymų. Host cancellation nutraukia laukimą; patvarus darbas dėl to neperleidžiamas. Backend timeout, grant ir biudžeto patikros lieka atskiros.

Be `module` išlieka ankstesnė repo atranka ir submit atsakymas. `zero_reuse_job` su numatytuoju `waitMs: 0` išlaiko tiesioginį būsenos skaitymą. Pilni receipt ir raw puslapiai prieinami; trumpas vaizdas nurodo praleistus įrodymus. `zero_source` naudojamas konkrečiai likusiai spragai, ne privalomam pakartotiniam viso medžio naršymui.

## Integravimo pasiūlymo ribos

`moduleProposal.status: proposed` nurodo konkretų kodo vienetą. Package API strategija siūloma tik kai failas sutampa su tikru manifesto įėjimo tašku; manifesto versija nepatvirtina paskelbto paketo kilmės. Kitu atveju siūlomas source adapteris, paliekant pilnos dependency closure peržiūrą. Script, manifestas ar deklaracija nėra leidimas vykdyti šaltinį.

Host plane įvardija kokį kodą modulis pakeistų, jo konkrečią sąsają, integravimo darbus ir nepriklausomą faktinio iškvietimo/išvesties patikrą. `prepared`, `runtimeTested`, `licenseApproved` lieka false; faktinės adaptavimo sąnaudos ir sutaupymas nežinomi. Plan-only sustojimas draudžia paruošimą, priklausomybių diegimą ir programos kūrimą/vykdymą.

Pataisos atsako į [StudioDesk diagnozę](experiments/STUDIODESK-PLANNING-DIAGNOSIS-2026-10-22.md). Įdiegimas, gyvas kelias ir native palyginimas turi atskirus įrodymus. Ankstesni [StudioDesk bandymai](experiments/NATIVE-STUDIODESK-PLANS-2026-10-22.md) nekeisti; P1X/P1E ir viso MVP vartai neuždaromi.
