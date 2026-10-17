# RepositoryZero

RepositoryZero kuriamas kaip atviro kodo AI darbo platforma, kuri prieš rašydama naują kodą randa ir panaudoja tinkamus esamus projektus, komponentus bei įrankius. Žmogus galės pradėti nuo užduoties, savarankiškos repo bibliotekos arba naudoti Zero iš savo Codex / Claude Code per MCP ir papildinį. Native klientas išlaiko jo modelį ir prisijungimą.

**Stadija: įgyvendintas foundation ir vietinis Zero Lab; visas produkto MVP dar nepriimtas.** Yra Rakazo adaptacija, katalogo paieška, offline atrankos/budget primityvai ir tikri CLI eksperimentai. Automatinė grandinė „repo atranka → paruošimas → naudojimas worker → nepriklausoma patikra“ dar neužbaigta. Bendras greičio, kainos ar kokybės pranašumas neįrodytas.

| Ko reikia | Kur pradėti |
|---|---|
| Dabartinė būsena, blokai ir komandos | [IMPLEMENTATION](docs/IMPLEMENTATION.md) |
| Priimta architektūra ir darbų seka | [PLAN](PLAN.md), [sprendimai](docs/DECISIONS.md) |
| Visas planas su checkboxais | [ROADMAP](ROADMAP.md) |
| Atskiras techninio preview ir MVP kelias | [MVP-ROADMAP](MVP-ROADMAP.md) |
| Visi dokumentai pagal paskirtį | [Dokumentų indeksas](docs/README.md) |
| MCP / plugin architektūra ir svetainės prijungimas | [Priimtas planas; dar neįgyvendinta](docs/MCP-INTEGRATION.md) |
| Gyvas Codex su Zero / be Zero | [Būsimo native piloto protokolas](docs/NATIVE-CODEX-BENCHMARK.md) |
| Naujausi UI maketai | [Septyni konceptai](docs/assets/ui/README.md) |
| Kalibravimo metodas ir tikri ankstesni rezultatai | [CALIBRATION](docs/CALIBRATION.md) |

Pirmas kūrimo profilis — Linux x86_64 / WSL2. Iš repo šaknies:

```bash
npm run setup
npm run check:docs
npm run test:foundation
npm run dev
```

`dev` paleidžia tik web frontend. API/worker/DB paruošimas aprašytas [įgyvendinimo vadove](docs/IMPLEMENTATION.md#vietinis-paleidimas). Claude prenumeratos eksperimentams naudoti [LOCAL-LAB](docs/LOCAL-LAB.md); jie nėra pilno produkto paleidimas.

Katalogo 2026-10-16 šaltinių snapshot: 796 įrašai, 757 su source ir 756 su pin. Tai kandidatų duomenys, ne 796 įdiegtos ar patikrintos integracijos. Datuotas populiarumo tyrimas yra atskiras nuo runtime parengties.

Kodas adaptuoja Rakazo ir išlaiko jo kilmę bei vidinius paketų vardus. Žr. [LICENSE](LICENSE), [NOTICE](NOTICE), [upstream pin](platform/UPSTREAM.md) ir [kilmės taisykles](docs/ORIGIN-AND-ATTRIBUTION.md). Katalogo įrašas nesuteikia teisių platinti trečios šalies kodą, modelio weights ar duomenis.
