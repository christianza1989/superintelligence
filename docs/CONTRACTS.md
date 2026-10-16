# Modulių ir vykdymo kontraktai

**Siūlomas standartas 0.1; neįgyvendintas vykdiklis.** JSON pavyzdžiai yra plano artefaktai. Tikras Docling ir REA upstream SHA patikrintas šaltiniuose; adapterio vardai ir testinių objektų ID yra būsimo įgyvendinimo pavyzdžiai. `activation.allowed=false` blokuoja abu modulius.

## Versijuotas modulio manifestas

- [Visa Docling manifesto JSON forma](../catalog/examples/docling.manifest.json).
- [Visa privalomo REA static profilio JSON forma](../catalog/examples/rea-static.manifest.json).
- [JSON Schema 2020-12](../catalog/schemas/module-manifest.schema.json).

Kiekvienas aprašo `id/version`, upstream repo ir40hex source revision, kodo ir modelių licencijų būseną, suderinamą branduolio intervalą, tikslines platformas, capabilities ir įvesties/išvesties schemas, runtime/lock/digests, failų/tinklo/secret/side-effect leidimus, autentifikavimą, CPU/RAM/GPU/cache, sveikatą, deadline/cancel/retry/idempotency, testus, update/uninstall ir kainos nežinomus. MB laukai šiuose pavyzdžiuose – decimal10^6B; išmatuoti bendri dydžiai pateikiami baitais.

REA pavyzdžio esmė:

```json
{
  "id": "reverse.rea.static",
  "version": "0.1.0-plan.1",
  "source_revision": "0e1f0bf2d06943e59253b8a66923a1ae6005e81e",
  "package_version_observed_in_source": "6.5.0",
  "planned_upstream_entry": "node PATH_TO_VERIFIED_MODULE/scripts/rea.mjs mcp",
  "package_integrity": null,
  "source_mapping_verified": false,
  "activation_allowed": false
}
```

Tai sutrumpinta paaiškinimo forma; pilnas manifesto kontraktas – susietame faile. Repo `package.json` version neįrodo npm tarball ir šio source SHA atitikties. Prieš diegimą reikia tikro published source/tag mapping, lock ir tarball integrity. Transityviniai lifecycle hooks turi atskirą inventorių; leidžiami tik peržiūrėti užrakinti hooks izoliuotame builder. Optional Frida praleidimas neišjungia kitų production scripts. Numatytas statinis profilis vis tiek turi būti realiai išbandytas.

## Struktūrinis ir semantinis validavimas

1. JSON Schema tikrina formas, tipus, SHA formatą, žinomas būsenas, `additionalProperties=false`, bazinių laukų buvimą ir draudžia aktyvuoti draft su null lock/neišmatuotais resursais.
2. Semantinis validatorius patikrina suderinamą semver, schema refs, viename manifeste nesikartojančius capability ID ir jų kanoninius kontraktus, platformos support matrix, CLI argv saugumą, leidimų scope ir kainos rezervą. Tą patį kanoninį capability ID+contract version gali įgyvendinti keli skirtingų module IDs adapteriai; jų semantika tikrinama conformance. Shell komanda nesudaroma interpoliuojant modelio tekstą.
3. Supply-chain validatorius patikrina tikrus paketų parašus/digests, provenance, priklausomybių lock ir licencijų apimtį. Git SHA nėra visų transityvinių paketų digest.
4. Nepriklausomas evaluator naudoja trusted-base suite/policy SHA ir užfiksuotą image digest. Schema nepripažįsta modulio patikimu vien todėl, kad manifestas pats deklaruoja `verified`.
5. Registro priėmimo politika su maintainer teisėmis patvirtina konkretaus leidimo/platformos statusą. Nauji leidimai ar naujos deklaruotos teisės savaime neperimami.

Schema validation nėra sandbox, parašas, kainos garantija ar saugumo auditas. Šiame tyrime galima patikrinti pačių JSON pavyzdžių atitiktį; runtime patikros dar neįgyvendintos.

## Vienodas įrankio kvietimas ir grąžinimas

[ToolCall pavyzdys](../catalog/examples/tool-call.example.json), [jo schema](../catalog/schemas/tool-call.schema.json), [PDF įvesties schema](../catalog/examples/schemas/document.extract_tables.input.v1.json), [išvesties schema](../catalog/examples/schemas/document.extract_tables.output.v1.json).

ToolCall apima loginę užduotį, žingsnį ir konkretų attempt; capability+kontrakto versiją; modulio leidimą; stabilų idempotency raktą; lease/fencing token; išorinį permission grant ir budget reservation; deadline; validuotą įvestį. Secret vertės ar savavališki host keliai neperduodami per pokalbio tekstą. Failai perduodami ArtifactRef ir worker staging brokeriu.

ToolResult kontraktui būtini:

| Laukas | Reikšmė |
|---|---|
| `status` | `succeeded`, `failed`, `canceled`, `blocked`, `unknown_after_timeout` |
| `result` | Capability schema atitinkanti struktūra arba null |
| `artifacts` / `provenance` | Registruojami failai, versijos, šaltinių span ir savininkas |
| `usage` | Faktiniai tokenai, įrankio kvietimai, CPU/RAM/VRAM/disko laikas, kainos šaltinis; nežinomi ne0 |
| `validation` | `unverified`, `verified`, `failed`; nepriklausomo report nuoroda |
| `error` | `code`, struktūrinė žinutė, `retryability`, `side_effect_state`, evidence nuoroda |

Pagrindinės klaidos: `INVALID_INPUT`, `PERMISSION_DENIED`, `AUTH_REQUIRED`, `UNSUPPORTED_PLATFORM`, `MODULE_NOT_ACTIVATED`, `RESOURCE_EXHAUSTED`, `DEADLINE_EXCEEDED`, `UPSTREAM_UNAVAILABLE`, `VALIDATION_FAILED`, `EFFECT_UNKNOWN`. Kiekviena nusako, ar retry galimas be pakeitimo, tik pasikeitus prielaidai, ar reikalinga reconciliacija / žmogaus sprendimas. Įrankio „sėkmė“ dar nereiškia patikrinto užduoties rezultato.

## Modulio lifecycle ir saugus pašalinimas

`candidate → source_reviewed → installed_disabled → health_checked → acceptance_tested → enabled` yra instaliacijos eiga; registry kokybės būsenos atskirai `candidate → experimental → verified → recommended → deprecated`.

Diegimas užklausia teises ir resursų rezervą, gauna patikrintą paketą į atskirą aplinką, atlieka health/conformance ir užregistruoja leidimą. Paleidžiama tik prireikus; ilgesnis servisas turi idle TTL. Suderinamos immutable cache grupės gali dalytis artefaktais, bet nėra automatiškai vienas mutable virtualenv visiems moduliams.

Atnaujinimas: atsisiųsti į staging → patikrinti kilmę, schemas, licencijų/teisių skirtumą → paleisti pinned tests → canary → atomine nuoroda aktyvuoti leidimą. Ankstesnis leidimas laikomas nustatytą grace periodą. DB migracijos turi forward/backward suderinamumo arba restore planą; binaro pakeitimas negarantuoja duomenų rollback.

Pašalinimas: sustabdyti naujus darbus → saugiai baigti/atšaukti esamus → išregistruoti runtime → pašalinti tik modulio aplinką ir nebereferencijuojamą cache. Naudotojo dokumentai, darbo failai ir sukurtų artefaktų versijos nešalinami kartu. Bendri paketai ir rollback versijos lieka, kol į juos yra nuorodų.

## Tobulinimo pasiūlymas

[JSON ImprovementProposal pavyzdys](../catalog/examples/improvement-proposal.example.json) yra `planned_not_run`; visi tikrų bandymų įrodymai null. Jis aprašo finding ID, adapterio/upstream scope, base revision, modulį, klaidos kategoriją, A–D režimą, lease/fence, sintetinių duomenų kilmę, before/after, trusted suite, environment, regresijas, review ir rollback.

Prieš pateikiant tikrą PR papildomai būtini tikslūs SHA/digests, realios baseline/candidate runs, test/data/grader versijos, source/package pins, nepriklausomos patikros atestacija, privatumo patikra, diff ir biudžeto receipt. Dabartiniame tuščiame repo nėra tikro bazinio commit; vietoje jo neįrašome išgalvoto SHA.

## API ir kalbų suderinamumas

Python, TypeScript, Rust, Go ir native CLI turi tą patį išorinį JSON kontraktą. Python/TS generuojami tipai tikrinami pagal kanoninę schemą, įskaitant decimal, date/time, null, Unicode ir papildomų laukų elgesį. SDK major atnaujinimas turi conformance paketą ir senos versijos adapterį arba aiškų breaking release.

MCP stdio/HTTP yra vienas transporto adapteris. Oficialaus Python SDK tikrinto HEAD v2 public API naudoja `MCPServer`; senas `FastMCP` importo kelias negali būti kopijuojamas be versijos. Įrankių serverio annotations nėra leidimų suteikimo pagrindas. Mūsų brokeris sprendžia file/network scope ir privalomai tikrina lease/fence bei grant prieš šalutinį veiksmą.

## 0.2 papildomi kontraktai — projektuojami, schemos dar neįgyvendintos

| Kontraktas | Būtinos lauko grupės ir invariantai |
|---|---|
| ProviderBinding / ModelProfile | Provider+auth method+account/project/region, credential reference tik brokeriui, endpoint/protocol, model ID ir capability/source data, rate card arba unknown, allowed data recipients; list API tik metadata |
| AuthSession | Method, client/audience/scopes, PKCE/state/nonce kur taikoma, callback expiry, refresh revision/CAS ir reauth state; paslaptys ne events/prompt/loguose |
| ToolCatalogSnapshot | Gateway identity+account binding, provider/tool canonical IDs, schema fingerprint ir version kai yra, retrieved time, read/write/send semantika, limits/cost šaltinis; nauja schema nėra naujas grant |
| UpstreamCandidate | Previous module/package/image/weights pins, proposed pins ir provenance, release/source diff, license/dependency/hooks/schema/permissions delta, OS test evidence, blocked reason; vien package semver netampa approval |
| RegistryAttestation | Tikslus module release+platform+suite/policy/image digest, signer identity, domain/resource/failure ataskaitos, status/revocation ir compatibility; autoriaus manifestas negali pats suteikti recommended |
| AcceptanceRecord | Repo/PR/HEAD/base/merge-tree+trusted policy/suite, kategorija, atestacijos, budget receipt, broker decision ir queue generation; pasikeitus HEAD/base būtina aktuali patikra |
| UpdatePlan / Receipt | Visos suderintos app/core/worker/module/supervisor versijos, data schema intervalas, grants/resource delta, signed metadata, activation intent/checkpoint/backup refs, active/previous pointer, health/recovery faktas; vienas writer ir patvarus žurnalas |
| UsageAggregateReport | Vieši module/capability/tool IDs, intervalas, collection version, report dedup ID, riboto laikotarpio pseudonimas, counters/buckets ir provenance; jokių prompt/arguments/credentials/private module vardų; local vs exported atskirai |
| ModuleComparison / SelectionRelation | Canonical repo/alias ir upstream/fork ryšys, capability/contract/profile, baseline/candidate pins, model/config/hardware/grants, delta, trusted suite/data ir report, uncertainty, sprendimas/priežastis/revisit sąlyga; relation nėra runtime trust statusas ar grant |
| OutreachProposal / DeliveryReceipt | Canonical recipient/org/repo/channel, public contact/protocol evidence, campaign intent, factual evidence ir claim scope, template+content digest, policy/grant/suppression revision, lease/idempotency/budget, dispatch/result/unknown/reply ir opt-out; PR/email nėra vienas paveldimas sutikimas |
| IntegrationBadge / PartnerRecord | Tiksli registry verification nuoroda, upstream/adapter/platform/suite ir current status, atskirai maintainer identity+confirmation scope ir pasirinkti co-promotion kanalai; badge adoption nekeičia techninio trust |
| ContributorAccount / RepositorySubmission | Stable GitHub user/repo IDs ir canonical URL, own/authorized/community claim+evidence, account session reference, public fields/delta, dedup/work reservation ir tikras triage/eval/registry statusas; login nėra write/PR/merge grant |
| VideoSubmission / ModerationRecord | Case-sensitive canonical video ID, submitter vs channel owner proof, metadata hash/revision, review_actor/seen_sources/review_basis, policy ir moderation_generation; publisher CAS atmeta pasenusį approve |
| VideoVote | Unique account+video, desired active state, immutable first_vote_at pagal retention pagrindą, row/aggregate revision, idempotency ir outbox; retry/undo/recreate negali dubliuoti skaičiaus ar ranking boost |
| BudgetReservation / IntakeAdmission | Unique invocation ID, global+lane count/token/$/compute/concurrency upper-bound, model/rate šaltinis, atomic reservation/settlement/uncertain, actual dispatch attempts su SDKretries; bounded queue/bytes/TTL/fairness ir deferred status |
| DirectoryTaxonomy / SkillManifest | Stable domain/tag/capability/recipe IDs/versions ir sinonimai, įrodymų/parengties reference; skill input/prielaidos/reikalingi contracts/žingsniai/stop/caps ir validator; instructions netampa grant |
| ResolveRequest / ToolSelection | Intent/input/artifact/profile, patikimas grant/budget konteksto reference, registry/policy/schema/adapter snapshot ir galimų IDs enum; shortliste pasirinktas ID arba abstain, ne credential/permission token, prieš invoke runtime recheck |
| LocaleCatalog | Stable message/category keys, BCP47 locale, source revision/fallback/pilnumo statusas ir escaped interpolation/plural; žmogaus tekstas nekeičia English contract IDs ar permissions/cost semantikos |

Šios lentelės neatstoja JSON Schema ar runtime brokerio. Esamos manifesto ir ToolCall schemos patikrina tik savo deklaruotą ribotą formą. Nauji schemų projektai numatyti P0/P1/P3; jų neegzistuojančių testų nežymime PASS.

Treg `catalog_call` visada eina per tą patį ToolCall/grant/budget/effect protokolą; dinaminis endpoint ID ir arguments neperduoda leidimo atlikti visą katalogą. Hosted modelio alias ar API schemos fingerprint neįrodo nekintamo serverio kodo / svorių. Updater ir upstream monitor paaiškinti [autonomijos specifikacijoje](AUTONOMY-AND-UPDATES.md), credential ir model/tool ribos [atskirame plane](MODELS-AND-TOOLS.md).

Automatinis DB snapshot restore po naujų naudotojo įrašų nėra rutininė UpdatePlan sėkmė. Reikia suderinamo schema kelio arba forward repair / atskiro recovery sprendimo, išsaugant naujus duomenis. GitHub merge, modulio priėmimas ir vietinis įdiegimas turi atskirus records bei teisių sprendimus.
