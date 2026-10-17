# Providerių autentifikacijos ir Treg integracijos kritinė peržiūra

Data: 2026-10-16, Europe/Kiev. Tai šaltinių skaitymas ir siūloma architektūra: **NOT_RUN**. Nebuvo prisijungta prie paskyrų, naudoti raktai, kviesta modelių ar Treg API, diegtos priklausomybės ar keista OS konfigūracija. Ši dviejų agentų tarpusavio kritika nėra nepriklausomas saugumo auditas.

## 1. Sprendimas ir svarbiausia OpenCode išlyga

**Siūlomas sprendimas:** vienas `ProviderHub` su atskirais API rakto, oficialiai leidžiamo OAuth ir vietinio modelio profiliais. Platus modelių palaikymas reiškia plečiamą adapterių sistemą, o ne pažadą, kad visų tiekėjų visi modeliai ir prenumeratos veiks per vieną prisijungimą. Treg yra vartotojo reikalaujamas išorinių gebėjimų profilis, su atskiru autentifikavimu ir biudžetu.

OpenCode yra naudingas palyginimas dėl providerio, metodo, paskyros ir modelio atskyrimo. Jo kodo kopijavimas savaime nesuteikia leidimo naudoti trečiosios šalies prenumeratą. OAuth realizacija, paslaugos teikėjo leidimas ir mūsų patikrintas veikimas yra trys skirtingi įrodymai.

**Patikrinta šaltinyje:** `anomalyco/opencode` SHA `a448d5b987d01887e1597269b57ae2f259f5725b`; `packages/core/package.json` versija `2.0.30`; root LICENSE yra MIT. Patikra remiasi šiuo nekintamu snapshot, ne visais būsimais leidimais. MIT taikoma šiam kodui; ji neperduoda modelių, API, paskyrų ar trečiųjų šalių paslaugų teisių.

## 2. Kas realiai yra OpenCode kode

| Kelias | Patikrintas faktas | Praktinė riba |
|---|---|---|
| `packages/cli/src/index.ts` | Tikri `auth login/list/logout/export/import/switch` ir `models` handleriai | Ankstesnis `packages/opencode/src/...` katalogas šiame SHA nebeegzistuoja. |
| `packages/core/src/plugin/provider.ts` | Registruoti `ChatGPTPlugin`, `OpenAIPlugin`, `OpenRouterPlugin`, `OllamaPlugin`, kiti adapteriai | Vien bendras providerio pavadinimas nepasako, kuris prisijungimo metodas aktyvus. |
| `plugin/provider/openai.ts` | Browser PKCE + `state`, device-code metodas, token refresh; OAuth naudojamas Codex backend | Kode yra konkrečiam klientui skirtas client ID; jo negalima laikyti mūsų produkto registracija. |
| `plugin/provider/chatgpt.ts` | Atskiras `chatgpt-token-sharing` metodas, PKCE, `state`, OIDC `nonce` ir ID token tikrinimas | Naujas metodas nėra visuotinio tinkamumo ar diegimo mūsų produktui garantija. |
| `packages/ai/src/providers/anthropic.ts` | API key per `ANTHROPIC_API_KEY` / `x-api-key`, atskiras `authToken` parametras | Bendras Bearer parametras savaime nėra Claude prenumeratos OAuth prisijungimo įgyvendinimas ar leidimas. |
| `packages/ai/src/providers/openrouter.ts` | `https://openrouter.ai/api/v1`, Bearer `OPENROUTER_API_KEY`, įjungiamas usage atsakymas | OpenRouter sąskaita ir limitai atskiri nuo OpenAI / Anthropic tiesioginių paskyrų. |
| `plugin/provider/ollama.ts` | Vietinis `/api/tags` ir `/api/show`, modelių digest cache, tools/vision galimybių skaitymas | Modelio serveris ar svoriai šios peržiūros metu nebuvo paleisti. |
| `provider.ts`, `plugin/provider/sdk-factory.ts` | Native `@opencode/ai` adapteriai ir AI SDK bridge; galimi išoriniai npm adapteriai | Iš konfigūracijos importuojamas paketas yra vykdomas kodas, kuriam būtina mūsų admission politika. |

### OpenAI: trys atskiri keliai

1. **API key:** API projekto / organizacijos leidimai, modelių prieiga ir apskaita. Tai atskira prisijungimo klasė nuo ChatGPT prenumeratos; vienos sąskaitos likutis neturi būti pateikiamas kaip kitos likutis.
2. **OpenCode Codex OAuth:** `chatgpt-browser` ir `chatgpt-headless`; auth issuer `https://auth.openai.com`, browser `/oauth/authorize`, token `/oauth/token`; inference `https://chatgpt.com/backend-api/codex`. Registruojami browser ir device metodai. Kodas riboja Codex tinkamus modelius, įrašo `originator`, `chatgpt-account-id`, `x-codex-beta-features` ir sesijos affinity headerius.
3. **OpenCode naujas ChatGPT token sharing:** `chatgpt-token-sharing`; pirmo prisijungimo `dynamic_agent_client`, callback grąžintas user-owned client ID; `chatgpt.tokens.use.direct` scope ir `https://api.openai.com/v1` resource. Callback klaida, nesuteiktas scope ar neteisingas ID token sustabdo prisijungimą; refresh naudoja tam prisijungimui saugomą client ID.

**Patikrinta šaltinyje, svarbi riba:** `chatgpt.ts` turi `fetchModels()` į `/models` ir `deriveModels()`, tačiau jų periodinis / prisijungimo refresh įjungimas šiame SHA užkomentuotas. Aktyvus kelias filtruoja pagal `fallbackModels` rinkinį. Todėl frazė „prisijungus automatiškai turėsime visus jūsų modelius“ šiuo šaltiniu nepagrįsta. Taip pat kode yra nebekartotinos `subscription_sharing_*` klaidos: tinkamumas, kvota, scope ir capability realiai gali riboti prieigą.

**Autorių teiginys:** OpenCode provider docs siūlo ChatGPT Plus/Pro ir teigia, kad prenumeratos naudojamos su juo. Kode prenumeratos modeliams nustatomas tuščias kainų sąrašas. Tai nėra nemokamo / neriboto naudojimo įrodymas ir nėra oficialios paslaugos kainodaros patvirtinimas. Mūsų UI privalo rodyti prenumeratos kvotą arba `unknown`, o ne klaidinančias „$0 be limitų“ reikšmes.

**Nežinoma:** šioje aplinkoje oficialūs `developers.openai.com/codex/auth` ir ChatGPT Plus pagalbos URL grąžino proxy 403. Tiekėjo dabartinių sąlygų, naujo token-sharing registracijos tinkamumo ir mūsų produkto client registracijos šioje peržiūroje nepatvirtinau. OpenCode source nėra OpenAI teisinių sąlygų pakaitalas. Mūsų OAuth adapterio aktyvavimo gate turi tai patikrinti prieš realų prisijungimą; netikslinga aklai kopijuoti kito produkto client ID.

### Anthropic / Claude: dokumentacijos prieštara ir saugus konkretus pasirinkimas

**Patikrinta šaltinyje:** `providers.mdx` Anthropic skiltyje likęs sakinys apie Claude Pro/Max naršyklės prisijungimą, bet parodytas pasirinkimas tėra „Manually enter API Key“. Toje pačioje skiltyje aiški pastaba teigia: prenumeratos pluginai pašalinti nuo 1.3.0, o jų naudojimą „Anthropic explicitly prohibits“. Dabartiniame peržiūrėtame built-in provider registracijos sąraše Claude OAuth pluginio nėra.

**Autorių teiginys, ne nepriklausomai patvirtinta oficiali taisyklė:** teiginys apie draudimą yra OpenCode autorių dokumentacijoje. Oficialaus `code.claude.com/docs/en/legal-and-compliance` čia perskaityti nepavyko dėl proxy 403. Nepaskelbiame jo savo savarankiškai patikrinta teisine išvada ir neteigiam, kad visos partnerių / enterprise OAuth situacijos vienodos.

**Siūlomas sprendimas:** Claude palaikyti per Anthropic API key arba aiškiai vartotojo pasirinktą, leidžiamą gateway / cloud adapterį. Claude prenumeratos OAuth rodyti kaip `blocked_pending_official_support`; jo neįgalina atsitiktinio pluginio buvimas, nukopijuotas CLI tokenas ar dabartinės Codex sesijos prisijungimas. Oficialiai patvirtintas būsimas partnerio OAuth galėtų tapti atskiru adapteriu po peržiūros.

### OpenRouter, OpenAI-compatible, vietiniai modeliai

**Patikrinta šaltinyje:** OpenCode docs OpenRouter kelias yra `/connect` → API key → `/models`, galima papildyti modelių konfigūraciją. Provider pluginas prideda `HTTP-Referer: https://opencode.ai/` ir `X-Title: opencode`; tai produkto identifikavimo headeriai, ne OAuth ar leidimo įrodymas. Mūsų produktas turi naudoti savo identitetą, o ne apsimesti OpenCode.

Docs skiria OpenAI-compatible `/v1/chat/completions` ir `/v1/responses` adapterius. `baseURL` suderinamumas negarantuoja vienodų tools, JSON Schema, streaming, image/audio, reasoning, cache ar usage galimybių. OAuth tokeno negalima persiųsti kitam `baseURL` vien todėl, kad API formatas panašus; credential turi būti susietas su leistinu issuer, audience ir endpoint origin.

Ollama dabartiniame kode atranda vietinius modelius; dokumentacija taip pat aprašo `llama.cpp` `llama-server` su `http://127.0.0.1:8080/v1`. Tai skirtingi vietinio serverio adapteriai, ne OAuth. Modelių licencijos, svorių atsisiuntimas, RAM/VRAM ir disko vieta tikrinami atskirai. „Local“ pažyma negali būti automatiškai suteikta Ollama cloud modeliui ar peradresuotam endpointui.

## 3. Prisijungimo, saugojimo ir naudojimo įrodymai

**Patikrinta šaltinyje:** v2 CLI `auth login` naudoja integration metodų sąrašą; OAuth turi attempt ID, status, complete ir cancel. Tikri HTTP entrypointai: `/api/integration`, `/api/integration/:integrationID/connect/key`, `/connect/oauth`, `/connect/oauth/:attemptID`, `/api/provider`, `/api/credential`. Tai šaltinio API keliai, ne šiame projekte jau įgyvendintas API.

`integration.ts` resolve metu, kai OAuth galiojimo liko ≤5 min., kviečia metodo refresh ir išsaugo naują credential. Peržiūrėta ši kodo vieta savaime neįrodo mūsų reikalaujamo kelių worker persistento refresh lock / CAS. Jį reikia projektuoti sąmoningai, kad vienkartinio refresh token rotacijos nesugadintų lygiagretūs agentai.

Docs dar nurodo `~/.local/share/opencode/auth.json`, tačiau dabartinis `credential/sql.ts` turi SQLite `value` JSON-text lauką, o serverio credential handlerio atsakymai autorizuotam klientui įtraukia `value`. Tai skirtumas tarp dokumentacijos ir kodo; šie failai neįrodo OS keychain ar saugojimo šifravimo. Šaltinio skaitymas nėra konstatuota pažeidžiamybė.

CLI `logout` pašalina vietinį credential per API. Peržiūrėtuose keliuose neaptikta provider-side token revocation įgyvendinimo. `remove_local`, `revoke_remote` ir vartotojui parodytas likęs aktyvus grant turi būti atskiri mūsų veiksmai.

Modelių katalogas turi committed snapshot, cache ir periodinį refresh iš `https://models.opencode.ai`; penkių minučių TTL. Katalogo įrašas nėra aktyvios paskyros entitlement ar conformance testas. `models` CLI pateikia modelių sąrašą; `auth list` pateikia prisijungimus. Tai nėra sąskaitos balanso ar visų provider quota langų užklausa.

`session/usage.ts` normalizuoja input/output/reasoning/cache tokenus ir skaičiuoja kainą pagal katalogą; trūkstamos reikšmės virsta nuliu, trūkstama kainų eilutė – nuliu. Mūsų kontrakte `unknown` neturi virsti nemokamo naudojimo įrodymu; preliminarus kaštas ir tiekėjo patvirtinta sąskaita yra atskiri laukai.

## 4. Siūlomas mūsų ProviderHub kontraktas

- `ProviderProfile`: `provider_id`, `adapter_version`, `endpoint_origin`, `api_family`, `auth_methods`, `support_status`, `official_support_evidence`, `data_residency`, `catalog_revision`.
- `CredentialRef`: `credential_id`, `owner_id`, `provider_id`, `auth_method`, `issuer`, `audience`, `allowed_origins`, `scopes`, `expires_at`, `revision`, `status`. Viešame / agento kontrakte nėra access ar refresh tokeno.
- `ModelDescriptor`: `provider_id`, `model_id`, `revision`, `modalities`, `tools`, `structured_output`, `streaming`, `context_limit`, `max_output`, `pricing_status`, `quota_status`, `capabilities_observed_at`, `evidence_status`.
- `InvocationPolicy`: `allowed_provider_profiles`, `allowed_models`, `data_class`, `max_cost_micro_usd`, `max_tokens`, `deadline`, `concurrency_limit`, `fallback_policy`, `requires_confirmation`.
- `UsageReceipt`: `request_id`, `credential_id`, `model_id`, `provider_request_id`, `estimated_cost`, `reported_cost`, `usage`, `quota_headers`, `billing_status`, `outcome`, `reconciled_at`. Išsaugomi tik allowlist sanitizuoti quota headeriai, ne Authorization / slapti response cookie.

Tai siūlomi laukų pavadinimai, ne jau paskelbta schema. Nežinomos capabilities žymimos `unknown`; aptikus naują modelį jis gali būti `discovered`, bet netampa `verified` ar automatiškai rekomenduojamas.

Prisijungimas yra aiškus vartotojo veiksmas: UI → credential broker → atitinkamo provider oficialus browser/device flow. PKCE S256, vienkartinis `state`, OIDC `nonce` kai taikoma, ribotos trukmės attempt, loopback callback, origin / issuer / audience patikra, callback cancel ir vienkartinis užbaigimas. Headless ir remote-host flow turi atskirą aiškų kelią; neklausoma `0.0.0.0` dėl patogumo.

Tokenai saugomi brokerio pusėje OS keychain arba užšifruotame vault su atskirai saugomu raktu; serverio atveju valdoma secrets saugykla. Renderer, modelis, tool worker ir repozitorijos `.env` gauna tik reference / ribotą brokerio operaciją. Importas iš kitos programos profilio – tik aiškiai pasirinktas, peržiūrėtas veiksmas; automatiškai neskaitomi naršyklės cookie, esami pokalbio tokenai, Codex/Claude profiliai ar visi projekto `.env`.

Refresh turi vieną autoritetingą brokerį per credential, galiojimo rezervą, durable lease + fencing / revision CAS ir rotacijos commit. `invalid_grant` → `reauth_required`; ne login loop ir ne tylus API rakto ar kitos paskyros panaudojimas. Logout nustoja priimti naujas užklausas, atšaukia vietines sesijas, pateikia aiškų provider grant atšaukimo rezultatą.

Biudžetas bendras visiems agentams, užduotims ir fallback: rezervacija prieš tinklo veiksmą, kiekybinė riba, concurrency, deadline ir circuit breaker. OAuth prenumeratai taikomas tokenų / užklausų / kvotos biudžetas net jei papildoma kaina nežinoma. Pasiekus kvotą negalima tyliai persijungti į mokamą API. Pasikeitus tiekėjui ar regionui vėl vertinamas duomenų siuntimo leidimas. External-effect timeout → `unknown_after_timeout` ir reconciler, ne aklas kartojimas kitu provideriu.

LLM coding provideriai neapima visų TTS/STT/video/CAD gebėjimų. Jiems reikia atskirų capability adapterių ir jų pačių API / modelių licencijų; bendri lieka credential broker, biudžetas, artifact ir policy kontraktai.

## 5. Treg: reikalaujamas profilis, šaltinių ribos ir konkretus planas

**Patikrinta šiame sesijos kontekste:** prieinamas `treg:treg` skill, perskaitytas [SKILL.md](skill://plugins_6a7fb961a34881918798681dade464ec/treg/SKILL.md). `ALL_TOOLS` sąraše nerasta `catalog_search`, `catalog_get`, `call`, `balance`, `my_tools` Treg connector įrankių; todėl šiuo metu tai skills-only dokumentacija. Skill buvimas nėra MCP ryšio, autorizacijos ar API veikimo įrodymas. Instrukcijos diegti CLI ar prisijungti šioje šaltinių peržiūroje nebuvo vykdytos.

**Viešų šaltinių prieinamumas:** `https://treg.to/`, `https://treg.to/llms.txt`, `https://treg.to/tutorial` HTTPS skaitymai grąžino proxy 403. Neapeita aplinkos tinklo politika. Todėl toliau nurodyta integracijos forma yra perskaityto skill dokumentacijos teiginys, ne patikrinta live serverio schema / kainoraštis. Viešo nekintamo serverio kodo SHA ši patikra nenustatė.

| Skill dokumentacijos teiginys | Reikšmė planui ir kas dar nepatikrinta |
|---|---|
| ~2600 endpointų, ~40 providerių; vartotojas nurodė 2800+ | Skaičiaus skirtumas nerodo gedimo: katalogas gali kisti. Nėra pagrindo šiandien skelbti 2800+ patikrintų įrankių. Katalogo endpointų kiekis ir MCP tool paviršius yra skirtingi dalykai. |
| MCP `https://treg.to/mcp/`, penki tool: `catalog_search`, `catalog_get`, `call`, `balance`, `my_tools` | Nekrauti tūkstančių tool schemų į kiekvieną modelio context; pirmiausia ieškoti capability, tada skaityti konkretų endpointą. Transporto versija ir auth header MCP konfigūracija turi būti patikrinti iš oficialaus `llms.txt`. |
| HTTP `X-Treg-Token`, org-scoped server-side credentials; `GET https://treg.to/call/<tool-name>/<path>` ir kiti HTTP metodai | `TREG_TOKEN` yra atskiras Treg prisijungimas; jis nesuteikiamas dėl OpenAI/Claude OAuth. Tokeno neperduoti upstream, agentui ar repo. Tikri response/schema/error kontraktai dar nepatikrinti. |
| Katalogo `call` naudoja team prepaid balance; `catalog_get` rodo kainą | Reikalingas kainos ir limito patikrinimas prieš iškvietimą. Be publikuotos kainos – nestatyti nulio ir nevykdyti. Free pradinis balansas, jei taikomas, nėra ilgalaikis nemokamumas. |
| Organizacijos own-key tools nenaudoja Treg katalogo balanso; own key turi prioritetą | Tai nereiškia, kad upstream naudojimas nemokamas. Kainodaros ir leidimų šaltinį rodyti UI, nekeičiant jo tyliai. |
| Agent tokenai turi tool allowlist ir calls/day cap; owner/admin/member/viewer rolės | Naudoti atskirą agent identity, ne žmogaus owner tokeną. USD, request, duomenų klasės ir concurrency ribas papildomai kontroliuoja mūsų policy; tikras provider enforcement dar nebandytas. |
| `idempotency_key` / `Idempotency-Key` grąžina saugomą atsakymą, neatlieka pakartotinio iškvietimo ir papildomo nurašymo | Tai tiekėjo dokumentuota idempotency savybė; jos retention, scopes, crash ir concurrent replay ribos dar nežinomos. Nevadinti nepriklausomai įrodytu exactly-once. |
| OAuth secrets gali automatiškai atsinaujinti; hosted callback `https://treg.to/oauth/callback` | Trečiųjų šalių OAuth consent, scopes ir duomenų srautas atskiri. Nieko neimportuoti iš vietinių secret/profile failų automatiškai. |

**Siūlomas integracijos kelias:** viena `TregAdapter` už mūsų `ToolBroker`, MCP pirminis kelias po oficialaus transporto / auth patvirtinimo; tiesioginis HTTP adapteris tik jei oficialiai dokumentuotas kontraktas tam poreikiui tinkamesnis. Neprivalome diegti CLI, jei pakanka MCP. Bazinis localhost produktas turi pasileisti be Treg paskyros; Treg profilis lieka suplanuotas ir aiškiai `not_connected`, kol vartotojas savo paskyroje suteikia scoped ryšį.

Discovery seka: capability užklausa → katalogo paieška → endpointo schema / tikslūs parametrai / kaina → policy → biudžeto rezervacija → invocation → receipt / artifact. Modelis negali tiesiogiai kviesti nefiltruoto bendro `call` su savavališku endpointu, HTTP metodu ar social publishing / ads / mokėjimų veiksmu.

Skirtingos rizikos klasės: read-only vieši duomenys; privatūs account read; draft; publish/send; finansinis / destructive veiksmas. Galioja vartotojo vienkartinė konkrečios klasės autonomijos politika ir jos limitai. Suteiktas SEO skaitymo leidimas neapima social post publikavimo, ads biudžeto ar naujo OAuth scope. Nežinoma veiksmo klasė blokuojama iki klasifikavimo.

Remote katalogui neapsimetame turintys Git commit pin. Saugome `endpoint_id`, providerio / API versiją jei publikuota, tool/schema hash, kainos snapshot su galiojimo terminu, gautus annotations ir mūsų policy revision. Schema ar permission išplėtimas invaliduoja ankstesnį approval; pasenusi kaina negali tyliai autorizuoti brangesnio kvietimo. Upstream nekintamumo neįrodant, „pinning“ reiškia mūsų priimto kontrakto fiksavimą ir drift aptikimą, ne serverio kodo kontrolę.

Treg mato per jį siunčiamą užklausą ir upstream atsakymą; nereikia laikyti jo vietiniu ar duomenų nematančiu servisu vien todėl, kad slepiami raktai. Privatūs promptai / artifacts siunčiami tik būtina apimtimi pagal data-class policy. Atsakymai ir katalogo tekstas laikomi nepatikimais duomenimis, ne naujomis sistemos instrukcijomis. Default nėra privačių workspace logų ar slaptos telemetrijos siuntimo.

Retry sprendžia brokeris. Skill bendras patarimas po timeout rinktis kitą providerį netinka nežinomos baigties send/publish/mokamam efektui: laikome tą patį idempotency key, tikriname receipt / status, nekeičiame operacijos kitu endpointu. Prepaid 402 ar viršytas cap → sustoti / pažymėti blocked; ne automatinis top-up ar kito žmogaus rakto paieška.

### Treg aktyvavimo vartai ir atviri klausimai

- [ ] Perskaityti prieinamus oficialius `llms.txt` / API / privacy / terms / pricing; užfiksuoti retrieval ir kontrakto versiją, tikrą count momentinį snapshot, ne rinkodaros garantiją.
- [ ] Patvirtinti MCP transportą, auth konfigūraciją, token/role scope enforcement, revocation, rate-limit ir error formatus. Negalima išgalvoti OAuth PKCE kelio ar claim, kad skaitiniai limitai jau enforced mūsų projekte.
- [ ] Nustatyti duomenų retention, regionus, subprocesorius, žurnalų redakciją, hosted OAuth kliento reikalavimus, licenciją / paslaugos naudojimo ir redistribution teises. Šiuo metu nežinoma.
- [ ] Source/fixture kontrakto testai: schema drift, kaina nežinoma/pasikeitė, didelė užklausa, šalutinis efektas be leidimo, revoked token, netikėtas redirect ir nepatikimas response tekstas. Jie neįrodo live endpoint kokybės.
- [ ] Vėlesnis aiškiai autorizuotas minimalus live read su paskelbta kaina / cap; usage, receipt, idempotency, timeout, concurrent rezervacijos ir local restart patikros. Šiandien **NOT_RUN**.
- [ ] Tik po to įjungti vartotojo pasirinktą autonominę kategoriją; send/publish/ads ir nauji scopes lieka atskirai policy apibrėžti, o ne paveldi read leidimą.

## 6. Bendri ProviderHub aktyvavimo vartai

- [ ] Tikras oficialus providerio palaikymo / registracijos / prenumeratos tinkamumo šaltinis ir adapterio licencijos patikra prieš OAuth realizacijos aktyvavimą.
- [ ] P0.0 Rakazo ADAPT/FORK palyginime įvertinti esamą Pi auth sluoksnį ir šį kontraktą; galutinis vienas brokeris / scheduler. Ši peržiūra neskelbia stack migracijos ar naujo dubliuojančio frameworko pasirinkimo.
- [ ] Vėlesni PKCE/state/cancel/replay/expired/refresh-rotation/logout/revocation testai su vietiniais fixture; jokie tikri raktai repozitorijoje ar CI loguose.
- [ ] Tada vartotojo autorizuotos minimalios realių provider API/OAuth/local patikros kiekvienam OS ir konkrečiam auth metodui. „API veikia“ neįrodo „OAuth veikia“; vienas modelis neįrodo viso katalogo.
- [ ] Modelio capability conformance, realus usage / limit-header parsing, fallback data-scope ir kaina, daugelio agentų bendro biudžeto race testai. Nežinomos / nenurodytos kainos negali apeiti cap.
- [ ] User UI aiškiai rodo connected/expired/reauth_required/blocked, paskyrą ir metodą, modelio prieinamumo įrodymą, quota/reset šaltinį ir datą, kaštų neapibrėžtumą; nerodo nei tokenų, nei tariamo „viskas neribotai“ statuso.

## 7. Nekintami OpenCode šaltiniai ir ribos

Visi žemiau pateikti GitHub keliai užfiksuoti ties tuo pačiu `a448d5b987d01887e1597269b57ae2f259f5725b`; skaityta raw source, ne vien search preview. Treg vieši puslapiai nebuvo perskaityti dėl aukščiau nurodyto 403, todėl jiems nesuteikiamas OpenCode šaltinių patikros statusas.

- [LICENSE](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/LICENSE), [core manifest](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/core/package.json), [CLI entrypoint](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/cli/src/index.ts).
- [Provider docs: Anthropic](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/web/src/content/docs/providers.mdx#L332-L369), [OpenAI](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/web/src/content/docs/providers.mdx#L1773-L1806), [OpenRouter](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/web/src/content/docs/providers.mdx#L1839-L1898), [llama.cpp](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/web/src/content/docs/providers.mdx#L1430-L1471), [Ollama](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/web/src/content/docs/providers.mdx#L1692-L1729), [custom API families](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/web/src/content/docs/providers.mdx#L2543-L2626).
- [Built-in provider registration](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/core/src/plugin/provider.ts), [Codex OAuth](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/core/src/plugin/provider/openai.ts), [ChatGPT token sharing](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/core/src/plugin/provider/chatgpt.ts).
- [Anthropic auth](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/ai/src/providers/anthropic.ts), [OpenRouter implementation](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/ai/src/providers/openrouter.ts), [OpenRouter product headers](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/core/src/plugin/provider/openrouter.ts), [Ollama discovery](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/core/src/plugin/provider/ollama.ts).
- [Native provider loader](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/core/src/provider.ts), [AI SDK bridge loader](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/core/src/plugin/provider/sdk-factory.ts), [models catalog](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/core/src/models-dev.ts), [usage accounting](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/core/src/session/usage.ts).
- [Integration state/refresh](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/core/src/integration.ts), [credential storage](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/core/src/credential/sql.ts), [credential HTTP handler](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/server/src/handlers/credential.ts), [logout](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/cli/src/commands/handlers/auth/logout.ts).
- [Integration API routes](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/protocol/src/groups/integration.ts), [provider API routes](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/protocol/src/groups/provider.ts), [credential API routes](https://github.com/anomalyco/opencode/blob/a448d5b987d01887e1597269b57ae2f259f5725b/packages/protocol/src/groups/credential.ts).

Nė vienas šios peržiūros runtime scenarijus nepažymėtas PASS. Tikras prisijungimas, modelio atsakymas, bill / quota ir tiekėjo sąlygų atitiktis lieka atskirai tikrintini įrodymai.


## 8. Galutinė plano 0.2 provider/auth ir Treg peržiūra

2026-10-16 palyginta su atnaujintais `PLAN.md` §6B, `ROADMAP.md` P0.15–16 / P2.11–13 ir `docs/MODELS-AND-TOOLS.md`. **Blocker ar major prieštarų šioje srityje nerasta.** Tai šaltinių ir plano nuoseklumo, ne tikrų prisijungimų patikra.

Pritariu API key, oficialiai mūsų klientui leidžiamo OAuth ir vietinio endpointo atskyrimui. OpenCode palyginimas nėra visų modelių, Claude prenumeratos OAuth, svetimo client ID ar nemokamo kredito pažadas. Credential broker list/read rodo tik metadata, paslaptys nepatenka renderer / agentams / PR, refresh ir revocation turi atskiras būsenas; bendras modelio login nesuteikia GitHub, email ar MCP veiksmų teisių. Bendro centro workeriai nepaveldi privačios vietinės paskyros credentials.

Treg vartotojo nurodyti 2800+ ir skill ~2600 endpointų sąžiningai atskirti nuo gyvo katalogo įrodymų; penki MCP discovery/call įrankiai nėra tūkstančiai į kiekvieną prompt kraunamų schemų. Privalomas planuojamas adapteris nereiškia dabartinės runtime integracijos, visų tool leidimo ar bazinio produkto priklausomybės nuo Treg paskyros. BYO ir hosted resale, downstream billing, token allowlist/cap ir mūsų patvarus biudžetas atskirti.

Hosted modelio / Treg backend negalime užrakinti repo SHA: palaikau endpoint/schema fingerprint, runtime validation, data-recipient ir write semantikos kontrolę. `unknown_after_timeout` po išorinio veiksmo reconciliuojamas, o ne kartojamas kitu provideriu. Nežinomi count, price, account entitlement ir neįvykdytos patikros lieka `unknown / blocked / NOT_RUN`; jie netampa kokybės ar palaikymo žymomis.
