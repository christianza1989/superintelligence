# RepositoryZero dokumentų įėjimas

**Atnaujinta 2026-10-17.** Pirmiausia skaityti dabarties dokumentus. Tyrimas, suplanuota funkcija, offline foundation, gyvas vykdymas ir palyginimu įrodyta nauda yra skirtingi statusai.

| Eilė | Dokumentas | Autoritetas |
|---|---|---|
| 1 | [IMPLEMENTATION](IMPLEMENTATION.md) | Kas faktiškai veikia, kas nepriimta ir kaip paleisti |
| 2 | [DECISIONS](DECISIONS.md), [PLAN](../PLAN.md) | Priimta architektūra; pakeičia senas nepasirinktos bazės alternatyvas |
| 3 | [ROADMAP](../ROADMAP.md) | Vienintelis checkboxų ir norminių vartų šaltinis |
| 4 | [MVP-ROADMAP](../MVP-ROADMAP.md) | Generuojama tų pačių darbų ištrauka: preview ir MVP |
| 5 | [CALIBRATION](CALIBRATION.md), [Jev](JEV-APPLICATIONS.md), [kvalifikacija](ROUTER-EVALUATION.md) | Dabartinis matavimo metodas ir adapterio ribos |
| 6 | [UI konceptai](assets/ui/README.md) | Naujausia dizaino kryptis, ne įgyvendintas UI |

Prieštaravimo tvarka: naujesnis aiškus priimtas DECISIONS sprendimas → ROADMAP vartai → IMPLEMENTATION faktai → teminė specifikacija. Faktinis testas negali būti paneigtas planu, o vien testas nepakeičia vartų apimties. Neaiškumą fiksuoti kaip konkretų ADR, ne spėti, kad senas checkbox jau PASS.

## MCP ir papildiniai nuo MVP

[Vietinio MCP serverio paruošimas](MCP-SETUP.md) aprašo tiesioginį STDIO paleidimą, tikro host ryšio patikrą ir pasirenkamą autentifikuotą CSV paruošimo / projekto tikrinimo profilį. Numatytasis serveris ir savarankiškas plugin paketas teikia discovery. 0.4 Linux vykdymo opt-in turi atskirą operatoriaus binding ir esamą API/worker; tikras native Codex CSV integravimo, Docker verify ir post-edit freshness bandymas PASS savo ribotai development apimčiai. [Vietinis plugin paketas](MCP-PLUGIN.md) turi atskiras packaging ir host install patikras.

[Priimtas MCP planas](MCP-INTEGRATION.md) apibrėžia bendrą backend, native host ribas, svetainės diegimo eigą ir profilių vartus. [Native Codex palyginimas](NATIVE-CODEX-BENCHMARK.md) — būsimo gyvo piloto metodas, dar NOT_RUN. Darbai P1X/P1E yra bendrame roadmape. 0.2 native discovery plugin install/new-session PASS; 0.4 update/uninstall, platesnis execution lifecycle ir pakartojama nauda dar nepriimti.

## MCP ir papildinių tyrimas

[Codex ir Claude Code prijungimas](research/MCP-AND-PLUGINS-2026-10-17.md) — 2026-10-17 oficialių sąsajų, svetainės diegimo ir gyvo native Codex palyginimo tyrimas. Įgyvendinimo apimtį nustato priimti sprendimai ir bendras roadmapas.

## Runbook ir metodika

- [LOCAL-LAB.md](LOCAL-LAB.md) — palaikomas receptas / ribotos foundation apimties aprašas; ne visas produkto acceptance.
- [ZERO-LAB.md](ZERO-LAB.md) — palaikomas receptas / ribotos foundation apimties aprašas; ne visas produkto acceptance.
- [PAIRED-BENCHMARK.md](PAIRED-BENCHMARK.md) — palaikomas receptas / ribotos foundation apimties aprašas; ne visas produkto acceptance.
- [BUDGET-FOUNDATION.md](BUDGET-FOUNDATION.md) — palaikomas receptas / ribotos foundation apimties aprašas; ne visas produkto acceptance.
- [SELF-REUSE.md](SELF-REUSE.md) — palaikomas receptas / ribotos foundation apimties aprašas; ne visas produkto acceptance.
- [JEV-LAB.md](JEV-LAB.md) — palaikomas receptas / ribotos foundation apimties aprašas; ne visas produkto acceptance.

## Planuojamos produkto specifikacijos

Toliau esančios specifikacijos išlaiko ateities reikalavimus. Jų „reikia / turi / integruosime“ nėra dabartinės runtime būsenos teiginiai. Datuotos source / kainų / modelių prielaidos iš naujo tikrinamos prieš atitinkamo profilio įgyvendinimą. Pirmas MVP: project creation, tool/capability, UI/languages; beta: REA/Treg/autonomy/update; svetainė/community/video/cloud/platesnės sritys turi atskirus ROADMAP etapus.

- [CONTRACTS.md](CONTRACTS.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [PROJECT-V1.md](PROJECT-V1.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [PROJECT-CREATION.md](PROJECT-CREATION.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [UI-FOUNDATIONS.md](UI-FOUNDATIONS.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [TOOL-DIRECTORY.md](TOOL-DIRECTORY.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [VALIDATION.md](VALIDATION.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [LANGUAGES.md](LANGUAGES.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [CLOUD-WORKSPACES.md](CLOUD-WORKSPACES.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [CAPABILITIES.md](CAPABILITIES.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [OUTREACH-TEMPLATES.md](OUTREACH-TEMPLATES.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [CONTRIBUTOR-PORTAL.md](CONTRIBUTOR-PORTAL.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [AGENT-CAPABILITIES.md](AGENT-CAPABILITIES.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [GROWTH-AND-OUTREACH.md](GROWTH-AND-OUTREACH.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [HOSTED-AND-BYOK.md](HOSTED-AND-BYOK.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [WHY-REPOZERO.md](WHY-REPOZERO.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [UI-WORKSPACE.md](UI-WORKSPACE.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [MODELS-AND-TOOLS.md](MODELS-AND-TOOLS.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [AGENT-IDENTITY.md](AGENT-IDENTITY.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [COMMUNITY-QUALITY.md](COMMUNITY-QUALITY.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [VIDEO-HUB.md](VIDEO-HUB.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [MODULE-SELECTION.md](MODULE-SELECTION.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [AUTONOMY-AND-UPDATES.md](AUTONOMY-AND-UPDATES.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [USAGE-STATISTICS.md](USAGE-STATISTICS.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [PUBLIC-WEBSITE.md](PUBLIC-WEBSITE.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [SCENARIOS.md](SCENARIOS.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.
- [INTAKE-AND-BUDGETS.md](INTAKE-AND-BUDGETS.md) — suplanuota specifikacija; konkretaus etapo ir checkboxų ieškoti ROADMAP.

## Įrodymai, kilmė ir istorija

- [Astra auditas ir kritinė peržiūra](audits/2026-10-17-astra/README.md) — datuotas source snapshot ir rekomendacijos, ne nuolat atnaujinama būsena.
- [Eksperimentų ataskaitos](experiments/README.md) — tikri rezultatai, failures ir jų epochų ribos.
- [Karantinas](quarantine/README.md) — pasenę planai/tyrimai su originaliais baitais ir hash; ne dabarties instrukcijos.
- [Kilmė ir autorystė](ORIGIN-AND-ATTRIBUTION.md), [LICENSE](../LICENSE), [NOTICE](../NOTICE), [upstream](../platform/UPSTREAM.md) — išlaikomi platinimo dokumentai.
- Paveldėti `platform/**/README.md` ir upstream runbook aprašo Rakazo komponentus; jie nėra Zero priėmimo ataskaitos. Keičiant kodą būtinas [platform/AGENTS](../platform/AGENTS.md).
- [Sutvarkymo apimtis ir patikros](DOCS-CLEANUP.md).

Katalogo JSON, lockfiles ir užšaldyti benchmark failai saugo originalias source nuorodas. Snapshot JSON kelių reikšmės gali rodyti datuoto Git commit medį; dabartinės vietos yra karantino manifeste. Nebandyti „atnaujinti“ senų matavimų hash vien dėl dokumentų judinimo.
