# Kalibravimo metodas ir rezultatų indeksas

2026-10-17. Tikslas — geresnė kokybė, mažesnis visas užduoties laikas ir realios sąnaudos pagal profilį. Fiksuotas 50% pagerėjimas nėra priėmimo kriterijus. Ši metodika palaikoma; istorinės kohortos neperrašomos.

## Naujas native Codex profilis

[Native Codex A/B](NATIVE-CODEX-BENCHMARK.md) naudos du naujus desktop projektus/pokalbius ir identiškus task prompto baitus. A iš tiesų neturi Zero įrankių ar papildinio instrukcijų; B turi užfiksuotą Zero pagalbos paketą. Tai atskira dar NOT_RUN kohorta, ne esamų Claude CLI rezultatų tęsinys. Prieš pilotą būtina pilna viena MCP reuse vertikalė, tikri limitai ir nepriklausomas grader. Modelį/effort fiksuoti pagal faktinę host prieigą, o trūkstamas usage/cache metrikas palikti unknown.

## Kaip lyginame

| Lane | Konfigūracija |
|---|---|
| A | Tas pats pagrindinis modelis/effort, įprasti leidžiami įrankiai ir bibliotekos |
| B | A + deterministinis Zero retrieval, paruoštas kontekstas/reuse profilis |
| C | Tas pats B + ribotas Jev pasirinkimas, įskaitant abstain |

Prieš startą užšaldyti task/prompt, source, modelio/CLI versiją, effort, įrankius, grant/cap, grader ir success taisykles. Vienoje kohortoje jų nekeisti, eiliškumą kaitalioti. Failures, timeout ir model_unavailable paliekami vardiklyje. Profilių ar tikrintuvo pataisai pradėti naują kohortą. Senos v1 spragos nepataisomos retrospektyviu v2 PASS.

Fiksuoti kokybę ir domain kriterijus, kūrimo / tikrinimo / viso workflow laikus, retrieval/preparation/Jev overhead, non-cache input, cache read, cache creation ir output atskirai. API-equivalent CLI estimate nėra faktinis prenumeratos mokestis. Unknown kainos nerodyti kaip 0; cache read tokenų nelaikyti nei unikaliu input, nei tokios pat kainos kaip output.

Cold setup, warm reuse ir paruošimo amortizacija pateikiami atskirai. „Provided“, „used“, „verified“ ir „beneficial“ turi atskirus įrodymus. Jev papildoma vertė vertinama B prieš C, o A prieš C keičia visą konfigūraciją. Jev/source-only rekomendacija nėra realaus komponento panaudojimo ar worker ToolSelector įrodymas.

## Išsaugoti rezultatai

| Eksperimentas | Faktas ir riba |
|---|---|
| [Sonnet / SprintDesk](experiments/CLAUDE-CALIBRATION.md) | Pirma v2 pora abiem PASS; vėliau catalog 6/6, compact 5/6 bendras (compact arm 2/3). Tai CLI konteksto, ne viso produkto testas |
| [Lean konfigūracija](experiments/LEAN-CALIBRATION.md) | Viename profilyje 6/6, mažesnis workflow ir API-equivalent estimate. Keitėsi visa konfigūracija, todėl Jev priežastinė nauda iš to neišplaukia |
| [Haiku / StockDesk](experiments/STOCKDESK-CALIBRATION.md) | Pirma A/C pora PASS, bet C negavo bibliotekos: Jev abstain. Vėlesnis B/C v1 turėjo kokybės/tikrintuvo spragą; v2 kontrolės užfiksuotos, v2 live kartojimai dar neatlikti |

Pilni laikai, tokenai, cache ir sąnaudos yra šiose ataskaitose ir jų `catalog/*results*.json` šaltiniuose. Neapibendrinti skirtingų prompt/CLI/grader epochų į vieną „Zero greitesnis“ skaičių.

## Kitas tyrimas

Pirma užbaigti vieną tikrą worker reuse vertikalę ir meaningful kandidatų retrieval. Jev pirmas atvejis — pasirinkti leistiną paruoštą tool arba abstain (pvz., PDF tekstas / struktūrinė lentelė / dar neparuoštas OCR). B ir C turi tą patį kandidatų rinkinį, pagrindinį modelį ir tikrintuvą. Įtraukti multi-candidate, aiškų fit ir no-fit.

Astra pasiūlytas 3 užduočių × 3 pakartojimų × 3 arms tyrimas yra pasiūlymas, ne jau paleista ar automatiškai finansuota kohorta. Jis nepakeičia MVP 30 užduočių acceptance ar vėlesnio nepriklausomo holdout. [Jev vartai](JEV-APPLICATIONS.md), [pilnas planas](../ROADMAP.md), [vietinės komandos](LOCAL-LAB.md).
