# Kalbos nuo pirmo MVP

> **Planuojama produkto specifikacija · peržiūrėta 2026-10-17.** Aprašo siekiamą elgesį; schemų pavyzdžiai ir maketai savaime nėra įgyvendintos funkcijos. Daliniai foundation komponentai nekeičia viso vartų statuso. Datuotos įgyvendinimo pastabos žemiau nėra atnaujinta būsenos suvestinė; senos kainų/auth/source prielaidos tikrinamos prieš realų profilį. Dabarties autoritetas: [būsena](IMPLEMENTATION.md), [priimta architektūra](DECISIONS.md), [roadmapas](../ROADMAP.md).

2026-10-16. Naudotojo kryptis: daugiakalbis UI nuo pirmo MVP, įskaitant EN/RU, ispanų ir kinų. **Dokumentuotas tikslas; i18n UI ir išversta programa dar nesukurti.**

## Pradinis palaikomas profilis

- **Pradinis UI rinkinys –8kalbos:** English `en`, русский `ru`, español `es`, 简体中文 `zh-Hans`, lietuvių `lt`, Deutsch `de`, français `fr`, português do Brasil `pt-BR`. Apima MVP produkto ir svetainės pagrindinę navigaciją, login/forms/status/errors ir jos parengtas funkcijas, ne dar nesukurtų vėlesnių etapų ekranus.
- **Dokumentacija:** pilnas pagrindinis technical/quickstart profilis EN/RU, kitoms pradinėms UI kalboms trumpas palaikomo MVP quickstart; didesnės dokumentacijos vertimai etapais. Dabartinė planavimo dokumentacija lietuvių kalba lieka projekto šaltinių istorija, ne jau išleista programa.
- **Tolimesnės kalbos:** papildomi resursų paketai ir bendruomenės vertimai pagal poreikį. Tradicinė kinų `zh-Hant`, RTL ir kiti locale turi savo atskirus kokybės/layout testus, nėra tyliai prilyginami `zh-Hans`.
- **AI užduoties kalba – atskiras pasirinkimas:** nesusiejama privalomai su UI locale. Galima RU sąsaja ir užduotis anglų kalba ar atvirkščiai; faktinį modelio/tool kalbų palaikymą rodo jo profilis.

## Architektūros taisyklės

Žmogui skirti tekstai nuo pradžių turi stabilius translation keys ir pradinio8kalbų rinkinio resursų paketus. API/DB/ToolCall/capability/skill IDs ir error codes stabilūs, angliški; neversime kontraktų ID pagal UI kalbą. Kode naudojami English identifiers. Missing translation turi aiškų fallback į EN, be paslapčių ar backend trace; CI rodo trūkstamus keys. Kol pagrindinis locale paketas nepraeina pilnumo/meaning/layout vartų, jis žymimas preview, ne klaidingai visiškai palaikomu.

Locale galima pasirinkti, išsaugoti account/local nustatyme ir pakeisti; pirmas aptikimas nepakeičia vartotojo aiškaus pasirinkimo. Datos/laiko/valiutos/number formatavimas pagal locale ir pasirinkto laiko juostą, autoritetingi timestamp UTC. Unicode/Cyrillic, tekstų ilgis, plural ir interpolation testuojami; vertimas negali sulaužyti nuorodos ar panaikinti nežinomos kainos/leidimo ribos.

Kategorijų ir paieškos sinonimai turi lokalizuotus pavadinimus, pvz. crypto bot / криптобот / bot de criptomonedas, išlaikant vieną canonical capability. Paprastas browse/search/locale pakeitimas nesukelia mokamo LLM call. Skill instrukcijos ir source faktai gali turėti lokalizuotą paaiškinimą, bet schema/policy/grant semantika išlieka ta pati.

Public website UI naudoja pradinį locale rinkinį, docs turi aiškią konkrečios kalbos turinio reviziją ir aprėptį. Agentas gali parengti vertimą, tačiau faktai, skaičiai, būsenos, teisių/cost/prerequisite apimtis ir partnerio citatos turi išlaikyti originalo reikšmę. Techninio readiness ar badge negalima „pagerinti“ vertimu. Pagrindinės kalbos pasirinkimas nereikalauja iš karto visomis kalbomis išversti visos upstream dokumentacijos; išoriniai source lieka savo originalo kalba.

## Modeliai ir media

EN/RU routerio užklausos ir kitų deklaruojamų input kalbų reprezentatyvūs pavyzdžiai, sinonimai, painios read/write prasmės ir missing turi savo fixtures bei matuojamą tikslumą. Jev/Laya aprašytas multilingual palaikymas nėra mūsų visų UI kalbų benchmark rezultatas. Jei AI input/įrankio kalba nepatikrinta, tai rodoma atskirai nuo išversto UI. TTS/STT/voice/video subtitrų kalbos vertinamos atskirai nuo UI vertimų ir modelių autorių teiginių.

## Priėmimo vartai

- [ ] 8locale pagrindinių MVP žmogui matomų srautų keys/navigation/login/forms/status/errors, EN/RU pagrindinis technical quickstart, kitiems trumpas palaikomo profilio quickstart.
- [ ] Locale persistence/fallback, Cyrillic/Unicode/plural/escaping ir data/currency/time formatų testai.
- [ ] Vienodi capabilities/permissions/price unknown ir source revizijos visose kalbose; tekstas netampa kodo/instrukcijų vykdymu.
- [ ] EN/RU katalogo/search ir Jev selector fixture rezultatai su aprėptimi; untranslated/missing nėra tariamas palaikymo PASS.

Šios taisyklės papildo sutartą MVP ir public svetainę, nekeisdamos vykdymo teisių ar masinės atrankos finansavimo. Runtime/i18n bandymai dabar **NOT_RUN**.


## Pernaudojamos UI bazės locale

Rakazo pin jau turi Lingui EN/RU/ES/DE/FR/pt-BR ir zh-CN katalogų kelius; mūsų zh-Hans mapinamas aiškiai, LT ir mūsų naujų ekranų tekstai pridėtini. OpenCode alternatyva turi EN/RU/ES/DE/FR/LT bei zh/br su desktop locale mapping. Esamų upstream katalogų buvimas sumažina darbą, bet jų neprilyginame mūsų naujų funkcijų vertimo ar kalbos kokybės PASS. [UI šaltinių palyginimas](UI-FOUNDATIONS.md).
