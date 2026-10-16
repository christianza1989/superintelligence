# Modelių prisijungimai, OpenCode ir treg.to

Plano 0.2 reikalavimai, 2026-10-16. **Tai projektuojami adapteriai; login, tikrų paskyrų užklausos ir runtime integracijos šiame darbe neatlikti.** Šaltinių peržiūra: [antro agento patikra](reviews/provider-auth-review.md). Šis dokumentas atskiria modelio inferenciją, įrankių prieigą ir GitHub contribution tapatybę.

## 1. Kaip veikia OpenCode ir ką perimame

OpenCode yra agento vykdymo programa. Ji priima užduotį ir projekto kontekstą, siunčia juos pasirinktam modeliui, apdoroja modelio tool-call, pagal leidimus kviečia failų / shell / kitus įrankius, grąžina rezultatus modeliui ir tęsia ciklą iki atsakymo ar limito. Modelis suteikia samprotavimo ir generavimo galimybes; agento programa suteikia darbo aplinką, įrankius, sesijas ir kontrolę. MCP serveriai prideda papildomų įrankių.

Tikrinome `anomalyco/opencode` SHA `a448d5b987d01887e1597269b57ae2f259f5725b`, kur package versija 2.0.30. Dabartinis kodas turi atskirus provider/auth pluginus; senesnių versijų failų keliai ar login instrukcijos nebūtinai tinka. [Oficialus providers dokumentas](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/web/src/content/docs/providers.mdx).

Patikrinta: OpenAI API key ir ChatGPT prisijungimo metodai yra atskiri; OpenRouter dokumentuojamas su API key; Ollama / llama.cpp gali būti naudojami per OpenAI-compatible endpointus. Dabartinis OpenCode turi kelis OpenAI auth kelius, o `chatgpt.ts` modelių discovery šiame snapshot nenaudojamas pilnai, todėl net OpenCode login nereiškia „visi paskyros modeliai“.

Anthropic dokumente likęs Claude Pro/Max sakinys prieštarauja aiškiai pastabai apie nebebundlinamus subscription OAuth pluginus ir tiekėjo ribojimą. Claude prenumeratos OAuth mūsų produkto funkcija nežadama, kol nėra aktualaus oficialiai leidžiamo trečiosios programos kelio. Claude API raktas yra atskiras planuojamas metodas. OpenCode įgyvendinimo egzistavimas nesuteikia mūsų programai to paties OAuth client ar sutartinių teisių.

Perimame provider adapterių ir aiškaus auth metodo principą. Nekopijuojame viso antro scheduler ar nesuteikiame visiems modeliams visų įrankių. Mūsų papildomi reikalavimai: patvari užduoties būsena, grant / budget brokeris, patikrinami artefaktai, modelių ir įrankių versijų kilmė bei kontroliuojamas bendras tobulinimas.

## 2. Vienas modelių prijungimo vaizdas

| Šeima | Planuojamas prisijungimas | Kas dar turi būti patvirtinta |
|---|---|---|
| OpenAI API | Naudotojo API key, projektas / organizacija, jei taikoma | Konkretūs modeliai, API funkcijos, limits ir rate card; API sąnaudos atskirai nuo ChatGPT prenumeratos |
| ChatGPT paskyra | OAuth tik pagal tuo metu oficialiai mūsų klientui leidžiamą metodą | Kliento registracija, scope, endpointai, teisėtas naudojimo profilis, account entitlement, quota ir refresh; OpenCode šaltinis nėra automatinis mūsų leidimas |
| Anthropic / Claude API | API key; kiti oficialūs enterprise/cloud keliai kaip atskiri adapteriai | Modelių / regionų prieinamumas, tool ir multimodal API, rate card; subscription OAuth nepriskiriamas automatiškai |
| OpenRouter | API key; dokumentuotas OAuth/key provisioning tik jei patvirtintas atskirai | Galimi modeliai / upstream, routing, konkreti duomenų politika, rate / spending limitai |
| Gemini, Azure, Bedrock ir kiti | Oficialūs provider-specific API / cloud identity adapteriai | Tiksli auth forma ir OS palaikymas, account / region / IAM ribos; vienodas login visiems nežadamas |
| Ollama, llama.cpp, vLLM, SGLang | Vietinis arba naudotojo valdomas endpointas, jo auth jei reikalinga | Health, model ID, kontekstas, streaming / tool schemas / vision palaikymas; OpenAI-compatible nėra pilnos semantinės atitikties garantija |
| Custom provider | API endpointas + deklaruotas protokolas ir credential binding | TLS, domenas, capability conformance, leidžiama duomenų paskirtis ir išlaidų šaltinis |

Tikslas – platus suderinamumas per plėtinius. „Visi modeliai“ reiškia plečiamą architektūrą, ne garantiją, kad kiekviena tiekėjo paskyra suteiks API ar OAuth prieigą. UI rodo konkretaus metodo būseną: supported / experimental / blocked / auth required, tikrai pasiekiamus arba aiškiai konfigūruotus modelius ir neatliktas patikras.

Vienam projektui galima turėti kelis provider bindings; planner / coding / reviewer / speech / image / video profiliai gali rinktis skirtingus tinkamus modelius. Pirma vienas veikiantis provideris, vėliau kelių adapterių matrica. Nereikia naujo routing serverio bazinei funkcijai.

## 3. Auth ir credential brokerio kontraktas

Paslaptys laikomos platforminiame OS credential store ar aiškiai deklaruotame apsaugotame serverio secret store. Projekto DB saugo tik binding ID ir metadata. Headless / Linux be credential service turi atskirą deklaruotą fallback pasirinkimą; jokio tylaus plain-text credentials saugojimo. Renderer, agento prompt, tool output, vieši PR, crash dump ir telemetry negauna raktų / refresh tokenų. Credential list / read API grąžina tik metadata; brokeris pats prideda auth prie patikrinto tinklo kvietimo.

Jei tiekėjas palaiko native/public-client OAuth, parenkamas jo dokumentuotas browser authorization + PKCE / state ir leidžiamas loopback callback arba device flow. OAuth client / audience / scopes tikrinami konkrečiam metodui; client secret neįpakuojamas į viešą desktop binary. Refresh vyksta brokerio viduje su vienalaikių refresh kontrolės taisykle. Prisijungimo atšaukimas, expired token, account switch, refresh failure ir offline turi aiškias būsenas.

Logout vietoje pašalina binding ir vietines paslaptis; provider-side token / key revocation yra atskiras veiksmas su faktiniu rezultatu. OpenCode logout šaltinyje parodytas vietinis credential pašalinimas neįrodo išorinio token panaikinimo. Nenaudojame šios Codex sesijos ar kitų programų credential failų kaip tyliai perimamos mūsų produkto autentifikacijos.

Prieš pirmą naudojimą UI rodo, kokiam provider/account siunčiami duomenys ir koks billing metodas. OAuth login pats savaime nesuteikia GitHub merge, laiškų send ar visų MCP įrankių teisių. Šios prieigos yra atskiri grants.

## 4. Modelio pasirinkimas ir vykdymo ribos

Provider/model įrašas turi stabilų ID, auth binding reference, protokolą, endpointą, capability matricą (text / image / audio / video / tool calling / structured output / streaming), context ribą su šaltiniu, limits ir rate-card datą. Kaina / prieinami modeliai, kurių nepatvirtinome, lieka unknown. Kliento nurodytas modelio vardas nepaverčia jo prieinamu.

Užduoties attempt įrašo faktinį provider/model/config ir, jei atskleidžiama, modelio reviziją. Dinamiškai aliasuojamo hosted modelio tikslus weights pin gali būti neprieinamas ir tai pažymima. Failover išlaiko projektui leistinus duomenų gavėjus, capabilities ir biudžetą. Modelio pakeitimas negali pakartoti jau galbūt įvykusio išorinio veiksmo: naudojamas effect ledger ir read-only reconciliation. Nepavykęs arba per brangus provideris neperjungiamas į neleistiną paskyrą.

## 5. treg.to — privaloma planuojama įrankių jungtis

**Naudotojo reikalavimas:** prijungti treg.to bendrą įrankių katalogą. Tai atskiras module / MCP arba HTTP gateway adapteris už bendro policy brokerio; nėra antras modelių provideris ar mūsų branduolio priklausomybė visoms užduotims.

Naudotojas nurodė **2800+ tools**. Perskaityta `treg:treg` skill dokumentacija skelbia maždaug 2600 endpointų ir 40 providerų. Šie skaičiai gali reikšti skirtingą laiką ar katalogo apimtį. Gyvo katalogo šioje sesijoje netikrinome; oficialūs vieši puslapiai iš šios aplinkos grąžino proxy403. Nei 2800, nei 2600 nepervadiname mūsų nepriklausomai patvirtintu dabartiniu skaičiumi. Katalogo kiekis netampa kokybės, nemokamumo ar visų account prieigų garantija.

Skill dokumentuotas kelias: MCP `https://treg.to/mcp/`, HTTP `X-Treg-Token`, katalogo search / get / call, balance ir my_tools operacijos, organization-scoped agent tokenai su tool allowlist bei call/day cap. Tikslios einamosios schemos, transporto/auth suderinamumas, revocation, tarifai ir serverio sąlygos turi būti patvirtinti prieš runtime integraciją. [Tiekėjo puslapis](https://treg.to/), [LLM dokumentacija](https://treg.to/llms.txt). Dokumentuotas URL nėra čia patikrintas veikiantis prisijungimas.

Planuojama eiga:

1. Prijungimo vedlys patikrina leistiną serverio URL ir dokumentuotą auth metodą; vartotojas pasirenka organizaciją / paskyrą bei tik reikalingas jungtis. Vienkartinis grant nesuteikia leidimo visam katalogui.
2. Agentas pagal užduotį ieško mažo kandidatų rinkinio. Tūkstančiai pilnų schemų nekraunami į kiekvieną prompt. `catalog_get` / tool discovery schema susiejama su konkrečia provider + tool ID ir fingerprint / version, kiek paslauga juos pateikia.
3. Brokeris patikrina tool įvestį, faktinę paskyrą, duomenų gavėją, read/write/send/payment semantiką, egress ir resursų / pinigų rezervą. Tiekėjo readOnly / destructive annotations yra užuomina, ne mūsų leidimo sprendimas.
4. Vykdomas tik leistas veiksmas. Organizacijos token leidimų riba derinama su vietiniu grant; Treg call/day cap nepakeičia mūsų patvaraus bendros užduoties ir kainos limito. Treg / downstream API billing ir subscription sąlygos rodomos atskirai.
5. Timeout po write / send palieka `unknown_after_timeout`; universalus pakartojimas draudžiamas. Idempotency / status lookup galimybės tikrinamos konkrečiam tool; jei jų nėra, stabdoma arba sprendžiama read-only būdu.
6. Schema / permission pokytis, panaikintas tool, revoked token ar serverio outage negali tyliai suteikti naujų teisių. Schema diffs ir cache invalidation tikrinami, vietinis produkto core lieka naudojamas su kitais leistinais moduliais.

Tikslas iki v0.1: source/auth/terms patikra, registruotas adapteris, katalogo search/get conformance ir bent vienas realus read-only vertikalus scenarijus su naudotojo tinkamai prijungta paskyra. Leidžiami write scenarijai atsiranda atskirame grant profilyje ir turi išorinio efekto testus. Tikro account testo neatlikus, release matricoje rašoma NOT_RUN / blocked, o ne „integruota2800tools“.

Rakazo README minimos Treg hosted resale sąlygos turi atskirą teisinį / komercinį priėmimo punktą. Programos Apache/MIT licencija nesuteikia teisės perparduoti svetimos hosted paslaugos ar dalyti jos tokenų. BYO account ir hosted multi-tenant skiriasi; pirmas kandidatas – naudotojo valdoma atskira prieiga.

## 6. Priėmimo vartai

- [ ] Bent OpenAI API, Anthropic API, OpenRouter ir vienas lokalus endpoint profilis turi capability / billing / OS matricą ir sėkmingą sintetinį testą; nereikalauti mokamo testo be tam skirtos paskyros ir biudžeto.
- [ ] OAuth metodas skelbiamas palaikomu tik patvirtinus oficialią mūsų klientui taikomą galimybę ir įvykdžius jo lifecycle testus; nepasiekiamas subscription login turi aiškų paaiškinimą.
- [ ] Credential leakage canary, CSRF / callback state, token expiry / refresh / revoke ir provider account mix-up neigiami testai.
- [ ] Treg tool count, schemos, auth, limits, terms ir kainos turi datuotą faktinį įrodymą; katalogo discovery nėra bendras visų įrankių įgalinimas.
- [ ] Treg read-only scenarijus, schema-change / token-revoke / outage / timeout atvejai ir forbidden-write testas; visi rezultatai saugomi.
- [ ] Modelio ar įrankių failover negali apeiti duomenų gavėjų, biudžeto ir jau įvykusių išorinių efektų kontrolės.
