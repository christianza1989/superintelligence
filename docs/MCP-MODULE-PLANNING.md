# Konkretaus modulio planavimas per MCP

0.12.3 / schema 1.13.3 papildo esamą `zero_discover` kelią. API, PostgreSQL, Graphile worker, operatoriaus grant ir baigtinis Jev biudžetas lieka tie patys. Tai šaltinių pasiūlymai planui, ne universalus paruošimas ar runtime kvalifikacija. [Tikslinė Whisper kvalifikacija](experiments/WHISPER-MODULE-QUALIFICATION-2026-10-22.md) tikrina Zero grandinę; ji nepakeičia ankstesnės native planų poros rezultato.

Kitas atnaujinimas aprašytas [atskirame paieškos plane](SOURCE-DISCOVERY-UPGRADE-PLAN.md): platus tęsiamas fondas, stars/tinkamumas, modulių įrodymai ir pasirenkamas Treg. Tai dar neįgyvendintas planas; žemiau lieka faktinis 0.12.3 elgesys ir jo ribos.

## Vienas poreikis — vienas pasirinkimas

`goal` saugo realius apribojimus, `queries` — trumpas alternatyvias vieno gebėjimo frazes. Pasirenkamas `module` aprašo `inputs`, `outputs` ir `runtime`. Nepriklausomiems gebėjimams reikia atskirų pasirinkimų: vienas TTS repo nepakeičia STT ir paveikslų generavimo atrankos.

Darbininkas surenka ribotus GitHub faktus, tikslius commit/hash, manifestus, tikrus kodo failus ir rastas deklaracijų/importų eilutes. Package įėjimo taškai ir poreikiui artimesni keliai turi prioritetą prieš pavyzdžius, vendor, konfigūraciją ar bendrus page/layout failus. Python/Rust/Go/CMake priklausomybių failai saugomi kaip hash susieti excerpt; JSON package manifestuose perskaitomi vardai, versijos, įėjimo taškai, dalinės priklausomybės ir lifecycle script vardai. Script nevykdomi. Atpažįstamos ir CommonJS/UMD eksporto deklaracijos; tai statinio teksto stebėjimai, ne AST, public API semantikos ar elgesio įrodymas.

Jev gauna konkrečius šaltinio vienetus ir vieną sąsajos poreikį. Visas repo neprivalo įgyvendinti visos programos. Be peržiūrėtos modulio sąsajos mokamas dispatch neatliekamas. No-fit, abstention, nepakankama aprėptis ir nežinomas suderinamumas išlieka galimi rezultatai.

GitHub paieška atskirta nuo tinkamumo vertinimo. Iki trijų originalių frazių išsaugomos `requestedQueries`. Atpažintas akronimas, mišraus registro ar tašku atskirtas projekto vardas pirmiausia ieškomas repo pavadinime; stipresnis dotted vardas gali būti vėlesnėje frazės vietoje. Skaitinė versija tokiu vardu nelaikoma. Kitoms frazėms naudojami iki penkių raktažodžių. Tuščiam, nutrūkusiam ar `incomplete` rezultatui leidžiamas vienas alternatyvus bandymas su dviem prasminiais žodžiais. Vienodos faktinės užklausos sujungiamos, išsaugant visų pradinių frazių kilmę. Nėra konkrečios užduoties projektų sąrašo. `searches` registruoja originalią ir faktinę užklausą, laukus, strategiją bei `relaxedFrom`; visi tinkamumo apribojimai lieka poreikyje.

Dviejuose ratuose vyksta iki trijų lygiagrečių paieškų, kiekvienai skiriama 2,5 s; daugiausia šeši HTTP search kvietimai. Bendras 12 s tyrimo, request ir byte limitas lieka. Modulio režimas pradeda nuo pinned šakninio medžio ir perskaito iki trijų aktualių submedžių, kiekvienam skiriant iki 2,5 s. Tai dalinis source grafas, ne viso repo peržiūra. Po manifestų kodo ir dokumentų failai skaitomi lygiagrečiai; daliniai rezultatai ir nesėkmės išsaugomi.

Vardo sutapimas yra retrieval signalas, ne tinkamumo procentas. Viešo įėjimo taško ir native bibliotekos bendros antraštės keliams teikiama pirmenybė prieš formatų pagalbinius failus; žodžiai lyginami kaip atskiri tokenai. C/C++ antraščių prototipai ir viešos klasės metodai pateikiami kaip statinės deklaracijos; antraštė viena nėra realizuotas gebėjimas, būtina matching implementacija ir dependency closure. Penkių Jev kandidatų riboje pirmiausia pateikiamas vienas tinkamas vienetas iš kiekvieno peržiūrėto repo, tada antri vienetai. Tai ne globaliai geriausio modulio ar išsamios GitHub aprėpties garantija.

Failų rikiavimas ir API ištraukos gauna ne tik paieškos frazę, bet ir tikrą `module.inputs/outputs`. Ribotas source failas peržiūrimas visas, atmintyje laikant daugiausia 12 poreikiui artimesnių parašų su tikslia kilme; pirmų 64 parašų cutoff nebetaikomas. Gretimi `//` ir `/* */` komentarai papildo įvesties/išvesties signalus. Subalansuotų parametrų skliaustų ir leistinos pabaigos patikra atskiria funkciją nuo annotation wrapper fragmento ar callback duomenų lauko. Jev perduodama iki 12 × 120 simbolių su `declarationsTruncated`, pilname pasiūlyme lieka iki 12 × 240; 22 000 baitų state ir source failo ribos nedidinamos. Jei bendroje antraštėje nėra kviečiamų deklaracijų, sekami iki dviejų jos faktiškai perskaitytų santykinių importų, tik kai tikslai yra jau stebimame pinned medyje, nėra symlink ir neišeina iš repo. Tai pakeičia atsitiktinį abėcėlinį antrą failą; bendri laiko/request limitai lieka. Nėra mokamo papildomo Jev navigacijos etapo ar konkrečių projektų sinonimų lentelės.

## Trumpas atsakymas ir tęsiamas darbas

Modulio užklausa pagal nutylėjimą laukia iki 20 s. Jei darbas užbaigtas, tas pats MCP atsakymas grąžina `decision` su pilno receipt SHA ir tapatybės patikra. Jame yra modulis/pin, deklaracijos/importai, daliniai priklausomybių įrodymai, adapterio planas, patikros ir neatsakyti klausimai.

Jei darbas dar vyksta, grąžinamas esamas job ID ir `retryAfterMs`; `zero_reuse_job` su `waitMs: 20000` ribotai laukia jo nepateikdamas iš naujo. Didėjantis polling intervalas kliento viduje mažina host MCP/modelio ciklus; tai nereiškia nulio vidinių API/DB skaitymų. Host cancellation nutraukia laukimą; patvarus darbas dėl to neperleidžiamas. Backend timeout, grant ir biudžeto patikros lieka atskiros.

Be `module` išlieka ankstesnė repo atranka ir submit atsakymas. `zero_reuse_job` su numatytuoju `waitMs: 0` išlaiko tiesioginį būsenos skaitymą. Pilni receipt ir raw puslapiai prieinami; trumpas vaizdas nurodo praleistus įrodymus. `zero_source` naudojamas konkrečiai likusiai spragai, ne privalomam pakartotiniam viso medžio naršymui.

## Integravimo pasiūlymo ribos

`moduleProposal.status: proposed` nurodo konkretų kodo vienetą. Package API strategija siūloma tik kai failas sutampa su tikru manifesto įėjimo tašku; manifesto versija nepatvirtina paskelbto paketo kilmės. Kitu atveju siūlomas source adapteris, paliekant pilnos dependency closure peržiūrą. Script, manifestas ar deklaracija nėra leidimas vykdyti šaltinį.

Host plane įvardija kokį kodą modulis pakeistų, jo konkrečią sąsają, integravimo darbus ir nepriklausomą faktinio iškvietimo/išvesties patikrą. `prepared`, `runtimeTested`, `licenseApproved` lieka false; faktinės adaptavimo sąnaudos ir sutaupymas nežinomi. Plan-only sustojimas draudžia paruošimą, priklausomybių diegimą ir programos kūrimą/vykdymą.

Pataisos atsako į [StudioDesk diagnozę](experiments/STUDIODESK-PLANNING-DIAGNOSIS-2026-10-22.md). Įdiegimas, gyvas kelias ir native palyginimas turi atskirus įrodymus. Ankstesni [StudioDesk bandymai](experiments/NATIVE-STUDIODESK-PLANS-2026-10-22.md) nekeisti; P1X/P1E ir viso MVP vartai neuždaromi.
