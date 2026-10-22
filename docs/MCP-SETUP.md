# Vietinis MCP discovery preview

2026-10-17. Pirmas serveris teikia tik vietinio katalogo paiešką, kandidato faktus ir savo būseną. Jis neskaito projekto failų, neįdiegia kandidatų ir nekviečia modelio ar API. Paruošimas, vykdymas bei rezultato patikra turi atskirus [MCP plano](MCP-INTEGRATION.md) vartus. Discovery ryšys nėra viso MVP priėmimas.

## Paruošti serverį

Palaikomas kūrimo profilis: Node pagal root package.json, Linux x86_64 / WSL2 ir tikras Git checkout Linux failų sistemoje. Iš jo šaknies:

```bash
npm run setup:mcp
npm run test:mcp
```

Prijungimui naudoti tiesioginį Node paleidimą. Paketų tvarkyklės gali spausdinti tekstą į protokolo stdout, todėl kliento komandoje nenaudoti npm run ar runtime npx install.

```bash
node /absolute/path/to/repositoryzero/scripts/zero-mcp.mjs
```

Ši komanda laukia MCP kliento JSON-RPC per stdin; tai nėra terminalo pokalbis. Serveris grąžina tik protokolą per stdout, ribotą diagnostiką per stderr ir užsidaro host uždarius stdin. Dependency versijos priklauso nuo checkout lockfile; šis kūrimo paleidimas nėra savarankiškas distributyvas ar native installer.

## Codex tame pačiame Linux host

Oficialus Codex setup leidžia STDIO komandą ir argumentus. Pridėti savo vietinio checkout kelią:

```bash
codex mcp add repositoryzero -- node /absolute/path/to/repositoryzero/scripts/zero-mcp.mjs
```

Tai pakeičia kliento MCP konfigūraciją; neperkelia prenumeratos autentifikacijos. Projekto riboms galima naudoti trusted projekto .codex/config.toml vietoje bendro user config. [Oficialus MCP setup](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Windows Codex ir WSL serveris

Pirmiausia įsitikinti, kad Node ir paruoštas checkout veikia pasirinktoje WSL distribucijoje. Codex STDIO komanda yra wsl.exe, o argumentai pateikiami atskirai. Pavyzdinė projekto konfigūracija; vardus ir kelią pakeisti tikromis vietinėmis reikšmėmis:

```toml
[mcp_servers.repositoryzero]
command = "wsl.exe"
args = ["-d", "<distro>", "-u", "<user>", "--exec", "/absolute/path/to/node", "/absolute/path/to/repositoryzero/scripts/zero-mcp.mjs"]
startup_timeout_sec = 30
tool_timeout_sec = 15
enabled_tools = ["zero_search", "zero_inspect", "zero_status"]
```

Šis bridge patikrintas viename Windows Codex / WSL development profilyje: [serveris 0.1.1, schema 1.1.0, protocol 2025-06-18](experiments/MCP-PREVIEW-2026-10-17.md). Kitą kliento versiją ar aplinką patvirtinti tikru native tool call. Vien SDK arba CLI config patikra nėra desktop įrodymas. Nenaudoti Windows Node kelio kaip Linux vykdomojo failo ar Windows projekto kelio kaip tariamo WSL root. Šis discovery profilis jokių projekto roots dar nenaudoja.

Išsaugoti serverio konfigūraciją, perjungti arba perkrauti serverį pagal kliento setup ir atidaryti naują pokalbį, jei tools neįkelti. Dabartinio pokalbio hot-load nepažadamas. Neperkrauti visos programos, kol joje vyksta kiti darbai.

## Patikrinti ir išjungti

Naujoje host sesijoje iškviesti zero_status su šviežiu nonce. Turi grįžti discovery-only, backend unavailable, serverio/schema/catalog versijos, tikras initialize metu suderintas protocolVersion, tas pats nonce ir checkedAt. Tada zero_search su playwright bei zero_inspect su grąžintu candidateId. Source-only nėra leidimas vykdyti repo kodą.

Jeigu serverio įrankiai nepasirodo, tikrinti konkretaus kliento enabled/trusted būseną, command/args ir jo MCP diagnostiką. CLI sąrašas patvirtina tik config. Būseną „Prijungta“ žymėti tik po tikro host kvietimo; vieša svetainė jos negali nustatyti iš mygtuko paspaudimo.

Norint išjungti, nustatyti enabled=false atitinkamoje projekto serverio lentelėje arba naudoti kliento pašalinimo veiksmą. Neištrinti kitų serverių ar viso config. Prieš formalų [A/B bandymą](NATIVE-CODEX-BENCHMARK.md) A profilyje Zero tools ir jų metadata turi būti iš tikrųjų neįkelti.

Claude Code ir plugin paketai turi atskirą host kvalifikaciją; šis runbook jų palaikymo nepatvirtina. [Būsena](IMPLEMENTATION.md), [visas roadmapas](../ROADMAP.md).

## Pasirenkamas autentifikuotas paruošimas ir tikrinimas

Source serveris 0.7.0 / schema 1.7.0 turi pasirenkamą autentifikuotą profilį. Default serveris ir standalone plugin lieka discovery. Linux operatorius prijungia zero_prepare, zero_job, zero_artifact, zero_cancel, zero_verify ir zero_freshness per tą pačią application API ir Graphile worker. [Savarankiško paketo opt-in](MCP-PLUGIN.md) naudoja tą patį klientą; native Windows execution nepalaikomas. Tikras native CSV bandymas atliktas su 0.4; vėlesnės versijos ar naujų sričių native priėmimas neperimamas automatiškai.

Source registruoja PDF, statinio HTML ir patvirtintų URL tyrimo extract/job/artifact/cancel bei zero_pdf_csv. Vykdymo profilis `scoped-component-jobs`; `components.csv`, `.pdf`, `.browser`, `.research` tikrina atskiras dabartines API/grant būsenas. Bendras `backend=available` reiškia bent vieną prieinamą profilį, ne leidimą visiems. [0.7 patikros](experiments/SCOPED-RESEARCH-AND-PDF-CSV-2026-10-21.md): 162 fokusinės regresijos ir standalone proceso/HTTP fixture PASS; tikras PDF/HTML API/worker/Docker 19/19 bei URL tyrimo 11/11 PASS. Native 0.7 priėmimas dar NOT_RUN.

Nuo 0.6 `zero_search` grąžina `preparedProfiles` prieš katalogo kandidatus. Vienas tiksliai apibrėžtas CSV profilis turi fiksuotus source SHA, ribas ir development conformance faktus. Tai nėra papildomas katalogo įrašas, dabartinis operatoriaus leidimas, patvirtintas visas repository ar palyginimu įrodyta nauda. Neatitinkanti užklausa gali grąžinti tuščią profilių sąrašą; `zero_inspect` lieka katalogo įrašams.

Extraction argumentai tik `fileId`, `idempotencyKey`, `deadline`; file ID turi būti operatoriaus allowlist su SHA. Leidžiama iki 10 failų, kelias iki 12 dalių įskaitant failo vardą. PDF apimtis — fiksuotas born-digital ruled-table profilis. Naršyklė sukuria deklaruotą inertinį HTML vaizdą su išjungtu JavaScript ir išorinėmis užklausomis; jo PNG nėra originalaus puslapio tikslumo įrodymas. Receipt atskiria originalo ir renderintų baitų SHA bei grąžina originalias leksines nuorodas kaip duomenis. Įrankis nepriima path, URL, selector ar runtime parametrų. Poll atitinkamą job ir skaityti atitinkamą artifact puslapiais iki 8192 B, surinkti receipt ir patikrinti visą SHA-256. Didesnio receipt ribos priklauso nuo profilio; turinys ir ištrauktas tekstas yra nepatikimi duomenys.

URL tyrimas priima tik operatoriaus šaltinių registre patvirtintą `taskId`, `idempotencyKey` ir `deadline`; ne savavališką URL. Fiksuotas public HTTPS fetch be redirect sukuria nekintamą source snapshot, tada vykdomas inertinis renderis. `zero_pdf_csv` skaito vienos sėkmingo PDF receipt lentelės baitų puslapius (iki 8192 B), su source/receipt/CSV hash ir page/bbox provenance. Puslapius surinkti prieš UTF-8 dekodavimą ir patikrinti visą CSV hash.

Windows–WSL vykdymo profilyje `ZERO_MCP_BINDING_FILE` turi pasiekti **Linux Node procesą**. Vien Windows MCP `env` įrašas to negarantuoja: native development patikroje jis liko Windows pusėje ir serveris grįžo į discovery-only. Perduoti Linux aplinkai aiškiai, o binding faile laikyti tikrąją sesijos paslaptį:

```toml
[mcp_servers.repositoryzero]
command = "wsl.exe"
args = ["-d", "<distro>", "-u", "<user>", "--exec", "/usr/bin/env", "ZERO_MCP_BINDING_FILE=/private/linux/binding.json", "/absolute/path/to/node", "/absolute/path/to/repositoryzero/scripts/zero-mcp.mjs"]
startup_timeout_sec = 30
tool_timeout_sec = 20
enabled_tools = ["zero_search", "zero_inspect", "zero_status", "zero_prepare", "zero_job", "zero_artifact", "zero_cancel", "zero_verify", "zero_freshness"]
```

Tai tik paleidimo forma, ne leidimo suteikimas. Reikia veikiančio esamo API/worker, galiojančio operatoriaus grant ir naujo native `zero_status`, patvirtinančio backend bei CSV prieinamumą. Viena pataisyta native 0.7 development patikra nepakeičia kitų host/OS priėmimo.
API ir worker naudoja tą patį ZERO_PROJECT_POLICY_FILE. Jo JSON yra version:1 ir grants masyvas; kiekvienas leidimas turi spaceId, userId, scopeId, policyRevision ir baigtinį expiresAt. MCP atskiras ZERO_MCP_BINDING_FILE turi apiUrl, spaceId, scopeId, sessionToken ir expiresAt. Tai esamos Zero BetterAuth sesijos binding; coding host prenumeratos autentifikacija neperduodama. Šių privačių reikšmių nedėti į pokalbį ar Git.

Abu failai turi būti Linux absoliučiuose keliuose už Git checkout ribų, current-UID savininko, tikslaus 0600 režimo, be symlink ar hardlink. Failai skaitomi iš naujo kiekvienai operacijai. HTTP klientas leidžia tik literal loopback adresą su portu, neseka redirect ir riboja atsakymą bei laiką. Tool argumentai negali pasirinkti identity, scope, root, API URL ar credential. CSV input saugomas kaip nekintamas request artefaktas.

Verification reikia papildomo operatoriaus grant.verification: profile=zero-csv-project-v1, explicit Linux projectRoot ir atskiro stagingRoot, absoliutaus dockerExecutable, exact vietinio imageId=sha256:64hex ir limits(maxFiles=5, maxFileBytes≤131072, maxTotalBytes≤262144). Šie privatūs nustatymai negrąžinami per resolve/status ir nepriimami iš tool argumentų. Tikrinami app.mjs bei keturi paruošto vendor/d3-dsv failai; app eksportuoja parseCsv. Windows mount root, symlink ir private failai neįleidžiami. Staging turi baigtines keturias vietas po 1 MiB vienam scope; crash orphan vietos automatiškai netrinamos.

### Aiškus bendras browser / CSV development pasirinkimas

Jeigu tikslus naršyklės image jau įdiegtas, operatorius gali pasirinkti `combined-browser-csv-development`: to paties privataus grant `verification.imageId` ir `browser.imageId` nustato į `sha256:b74bf06b473909daae82590fb427c1ee37888568f605340ee88c0f858385b6af`, o `browser.buildInputLockSha256` — į `96cd2c725060ba0dfc36688ef57cd174375c74bcf4a76d72e6a4c9108ddc90c4`. Šio image Node yra `24.22.0`; CSV verifier išlaiko aiškų `/usr/local/bin/node` entrypoint ir visas esamas ribas. Tai tik operatoriaus pasirinkimas: image automatiškai neparenkamas ir neatsisiunčiamas. CSV-only ankstesnis image ir CI lieka leidžiami bei nepakeisti.

Toliau — nepaleidžiamas privataus policy šablonas. Visus identity, laiko, kelių ir failo SHA placeholder pakeisti tik operatoriaus konfigūracijoje už visų checkout ribų; jos neskelbti. Naršyklės failo allowlist ir CSV projekto leidimai išlieka atskiri.

```json
{
  "version": 1,
  "grants": [{
    "spaceId": "<SPACE_ID>", "userId": "<USER_ID>", "scopeId": "<SCOPE_ID>",
    "policyRevision": "<POLICY_REVISION>", "expiresAt": "<FUTURE_ISO_TIMESTAMP>",
    "verification": {
      "profile": "zero-csv-project-v1",
      "projectRoot": "<ABSOLUTE_CSV_PROJECT_ROOT>", "stagingRoot": "<ABSOLUTE_CSV_STAGING_ROOT>",
      "dockerExecutable": "<ABSOLUTE_DOCKER_EXECUTABLE>",
      "imageId": "sha256:b74bf06b473909daae82590fb427c1ee37888568f605340ee88c0f858385b6af",
      "limits": { "maxFiles": 5, "maxFileBytes": 131072, "maxTotalBytes": 262144 }
    },
    "browser": {
      "profile": "zero-browser-static-v1",
      "projectRoot": "<ABSOLUTE_BROWSER_PROJECT_ROOT>", "stagingRoot": "<ABSOLUTE_BROWSER_STAGING_ROOT>",
      "dockerExecutable": "<ABSOLUTE_DOCKER_EXECUTABLE>", "dockerConfigDirectory": "<ABSOLUTE_PRIVATE_DOCKER_CONFIG>",
      "imageId": "sha256:b74bf06b473909daae82590fb427c1ee37888568f605340ee88c0f858385b6af",
      "buildInputLockSha256": "96cd2c725060ba0dfc36688ef57cd174375c74bcf4a76d72e6a4c9108ddc90c4",
      "files": [{ "fileId": "<FILE_ID>", "path": "<RELATIVE_HTML_PATH>", "sha256": "<SOURCE_SHA256>" }]
    }
  }]
}
```

[Runplan](../platform/runtime/native-runtime-runplan.json) šiam uždaram pasirinkimui reikalaujamų image aibėje b74 skaičiuoja vieną kartą browser ir CSV vaidmenims. Tik šio pasirinkimo aibėje atskiras ankstesnis CSV image (243473588 B) nebereikalingas. [Development įrodymai](experiments/RUNTIME-AND-APPLICATION-2026-10-21.md): source `f0d0db0b0ed1d75ddedce78b7a86100af9d27b80`, tiesioginis 8/8 ir API/Graphile/MCP 4/4 PASS; pirmojo proceso epochos FAIL išsaugotas. Konservatyvi loginė apatinė riba po šio atėmimo vis dar **2203599730 B**, daugiau nei 2000000000 B prieš Docker/CLI/Compose, operatoriaus failų ir duomenų augimo sąnaudas. Išsaugoti cache image ir eksperimentai netrinami, fizinis diskas nematuotas iš naujo. Runplan / Compose lieka plan-only, sealed BUILD nekeičiamas; installer, native host, visas G0 ir platinimas šiuo pasirinkimu nepatvirtinami.

Host pats perskaito hash-verified paruošimo artefaktą ir integruoja komponentą. zero_verify priima tik preparationJobId, idempotencyKey ir deadline; tas pats zero_job/zero_artifact/zero_cancel kelias aptarnauja abu job tipus. Būtina skaityti vidinį verification.outcome, freshness ir limitations: succeeded job reiškia užbaigtą tikrinimo procedūrą, ne visos programos ar nepriklausomo holdout PASS.

Receipt vidinė freshness aprašo būseną jo sukūrimo metu. Po host pakeitimo zero_freshness su verification jobId atskirai palygina dabartinius penkis failus su sėkmingai tikrintu snapshot. Grąžina unchanged arba changed, checkedAt ir abu snapshot hash bei originalų receipt hash. Istorinio artefakto nekeičia ir kodo iš naujo nevykdo. Reikia to paties galiojančio grant/verifier binding; queued, failed ir preparation job netinka. Snapshot apimtis ≤256 KiB, keturios staging vietos; 5 s / expiry signal tikrinamas authority ir skaitymo ribose, bet kernel užstrigusio FS skaitymo kieto nutraukimo šis helper nežada. Native kliento HTTP operacija taip pat turi baigtinį timeout.

Status available reikalauja tikros autentifikuotos API ir grant patikros. Tai nėra projekto verification PASS. Atnaujintas to paties user/space/scope leidimas gali perskaityti ar atšaukti istorines užduotis; worker tikrina originalų nekintamą vykdymo leidimą. Same-UID hostile izoliacijos failų režimas nežada.

Po pilno setup ir db:generate paleisti test:mcp:execution. test:csv:mcp reikalauja VERIFY_ZERO_CSV_DATABASE=1 ir ZERO_CSV_TEST_DATABASE_URL su specialiu zero_csv_test DB vardu. Šis proceso testas su netikru vietiniu naudotoju tikrina API ir kliento restart, Graphile, hash, idempotency ir revocation; modelių tiekėjų nekviečia. Pasirinkus VERIFY_ZERO_CSV_PROJECT_DOCKER=1 ir ZERO_CSV_PROJECT_IMAGE_ID su tikru vietiniu image, jis papildomai integruoja artefakto source į host fixture ir per MCP/API/worker iškviečia realų Docker verifier. Tikras native host tool įvykis ir nepriklausomas holdout lieka atskiri vartai.
