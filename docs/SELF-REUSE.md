# RepositoryZero kaip savo reuse principo pavyzdys

2026-10-16. **Tai tikras vietinio paieškos įrankio ir turimo source patikrinimas su žmogaus/agentų sprendimu. Pilnas autonominis naujo produkto sukūrimas dar neparodytas.** Naudotojo reikalavimas: ir pačią platformą kurti iš jau egzistuojančių tinkamų dalių, kaip pasirinkta Rakazo bazė.

## Pakartojimas

```bash
npm run demo:reuse
```

Skriptas kviečia tą pačią `repositorySearchFromTool` funkciją, kuri prijungta esamame executor. Jis perskaito pasirinktų komponentų tikrus manifestus, patikrina katalogo Rakazo pin atitikimą `platform/UPSTREAM.md` ir įrašo `.artifacts/self-reuse-run.json`. Naudojamas esamas indeksas; šis paleidimas neatlieka tinklo/modelio kvietimų. [Išsaugota šio paleidimo kopija](../catalog/self-reuse-run.json).

Skriptas **nekviečia Jev ir nepristato ankstesnių testų kaip naujai jo atliktų**: ankstesnės patikros yra atskirai pažymėtas, datuotas `priorRecordedChecks` blokas. Sprendimą priėmė žmogaus valdoma kūrimo sesija su padedančiais agentais.

## Realios šio paleidimo užklausos

| Užklausa | Šio snapshot rezultatas | Ką tai įrodo |
|---|---|---|
| `agent platform` |4kandidatai, tarp jų Rakazo | Maža esamų produkto bazių atranka |
| `rakazo` |1kandidatas su exact SHA | Pasirinkta bazė randama per tą patį katalogą |
| `llm proxy` |LiteLLM ir Helicone | Aprašymu pagrįstas gateway/proxy discovery |
| `budget` |LiteLLM | Išlaidų valdymo kandidatas; griežtas mūsų rezervų kontraktas dar nepatvirtintas |
| `LLM observability` |3kandidatai | Stebėjimo alternatyvos atskirai nuo biudžeto vykdymo |

Pirmas tikras `budget` ir `llm proxy` paleidimas buvo `missing`: šių jau esančių repo galimybių aprašymai buvo tušti. Po ribotos exact-pin README/licencijų peržiūros papildyti tik trijų kandidatų `capability` ir source įrodymai; esamas sync skriptas atnaujino bendrą app/site indeksą. Kategorijos, kiekiai, `runtime_tested=false` ir `license_scope_approved=false` nepakelti. Tai realus aptiktos katalogo spragos taisymas, ne tariama atlikta integracija.

## Pasirinkta bazė ir tikrai pernaudotos dalys

- **Rakazo** `7d5e64c886da7d556673f99e4923b013315007a9`: tikra source adaptacija `platform/`, išlaikant Apache-2.0/notices, vieną produkto runtime.
- **React ir esami UI primitives/tokens**: darbo erdvė ir katalogas; konkreti versija skaitoma iš web manifesto.
- **Hono**: esamas produkto API.
- **Graphile Worker**: esamas patvarių darbų vykdymo komponentas.
- **Prisma/PostgreSQL**: esama DB/migracijų bazė ir transakcijos.
- **Astro**: pernaudotas oficialios svetainės pagrindas.
- **Vitest/Playwright**: esami automatinės ir naršyklės patikros įrankiai.

Skriptas fiksuoja deklaruotas versijas ir jų manifestų vietas. Frozen install, build, API/worker paleidimas ir ribotos testų aprėpties įrodymai turi atskirą [įgyvendinimo ataskaitą](IMPLEMENTATION.md). Šios priklausomybės nėra naujos į katalogo dydį susumuojamos integracijos; visas transityvinis licencijų bei platinimo auditas dar neatliktas.

Naujai parašyta projekto specifinė dalis: source registras ir read-only paieškos įrankis, RepositoryZero temos/katalogo pritaikymas, neaktyvi Jev selector riba, mažas bendro account/lane rezervų sluoksnis ant esamų PostgreSQL transakcijų ir šių scenarijų patikros. Naujas kodas turi paaiškintą paskirtį; jo vertė nėra matuojama parašytų eilučių kiekiu.

## Papildomai peržiūrėti esami sprendimai

Tai source peržiūra, ne įdiegtų alternatyvų benchmarkas. [URL, SHA ir šaltinių hash įrodymai](../catalog/self-reuse-sources.json).

| Repo ir exact pin | Perskaityti faktai | Dabartinis panaudojimo sprendimas |
|---|---|---|
| [LiteLLM](https://github.com/BerriAI/litellm/tree/46913be92b785f7cb3cbc0cdc9dde354572cbb2f) | README aprašo AI gateway/Python SDK, routing, spend management ir cost tracking. Root LICENSE atskiria MIT dalį nuo `enterprise/` | Vertinti kaip pasirenkamą provider gateway; README neįrodo mūsų strict pre-dispatch/reservation/reconciliation semantikos. Dabar neįdiegtas |
| [Helicone](https://github.com/helicone/helicone/tree/067d9290acb4f1fc9320e902fc67b4b399b50363) | README aprašo gateway, tracing, cost/latency tracking ir atskirų paslaugų deployment. Root Apache-2.0 | Observability/gateway alternatyva; visas jo multi-service produktas dabartiniam mažam ledger būtų papildoma infrastruktūra. Dabar neįdiegtas |
| [Langfuse](https://github.com/langfuse/langfuse/tree/0690d7d268c4cfa7bd7dfa3b1d7976bb37a9fd25) | README aprašo tracing, prompts, eval ir datasets; LICENSE numato atskiras `ee/` sąlygas | Galimas stebėjimo/vertinimo komponentas; ši peržiūra neįrodo mokamų kvietimų autorizavimo. Dabar neįdiegtas |

Šių produktų iš naujo nekuriame vien dėl to, kad turime mažą projekto kontrakto sluoksnį. Prieš platesnį modelių gateway, stebėjimą ar vertinimo UI pirmiausia lyginsime jų oficialias jungtis ir deployment kainą. Nedidelis specifinis adapteris galimas tik aiškiai nusakius, kokio kontrakto esamas sprendimas dar neužtikrina ar ko nepatikrinome.

Nė vienas populiarus komponentas savaime nepadaro viso sujungto produkto tobulu. Priėmimas priklauso nuo konkrečios versijos suderinamumo ir tikrų užduočių: **rasti → pagrįsti pasirinkimą → pritaikyti → paleisti → nepriklausomai patikrinti**. [Pilna numatyta projekto kūrimo eiga](PROJECT-CREATION.md).

## Tikras izoliuotas build ir funkcijų testas

`npm run test:reuse-build` jau atliktas: tikra `repository_search` užklausa rado Hono source; parsisiųsti pinned README/LICENSE, panaudotas frozen Hono4.13.7 ir esbuild0.28.2, o sintetinis task API subundlintas ir paleistas atskirame non-root/no-network/read-only konteinerio profilyje.6iš6funkcinių atvejų PASS. Atskirai sugadinta listing versija nepraėjo to paties nepakeisto acceptance — negative control aptiko2tikėtas klaidas.

[Datavimas, source/artifact SHA256 ir ribos](../catalog/reuse-build-checks.json). Git README pin ir npm paketo versija yra atskiros nuorodos, jų commit tapatumas neteigiamas. Tai agentų parengtas kontroliuojamas fixture su in-memory API, be sugeneruoto UI/persistencijos ar autonominio modelio planner; jis nėra porinės Codex lenktynės. Laikinas konteineris pašalintas, pagrindinė DB nepaliesta.

Zero Lab pirmajame pjūvyje taip pat pernaudojamos jau adaptacijoje esančios eval ataskaitų ir controls funkcijos. [Daugkartinio modulio planas](ZERO-LAB.md).
