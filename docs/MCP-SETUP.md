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

## Pasirenkamas autentifikuotas paruošimas

Source serveris 0.2.0 / schema 1.2.0 turi papildomą csv-preparation-only profilį. Default ir standalone plugin lieka discovery. Operatorius gali prijungti zero_prepare, zero_job, zero_artifact ir zero_cancel per tą pačią application API ir Graphile worker. zero_verify dar neprijungtas.

API ir worker naudoja tą patį ZERO_PROJECT_POLICY_FILE. Jo JSON yra version:1 ir grants masyvas; kiekvienas leidimas turi spaceId, userId, scopeId, policyRevision ir baigtinį expiresAt. MCP atskiras ZERO_MCP_BINDING_FILE turi apiUrl, spaceId, scopeId, sessionToken ir expiresAt. Tai esamos Zero BetterAuth sesijos binding; coding host prenumeratos autentifikacija neperduodama. Šių privačių reikšmių nedėti į pokalbį ar Git.

Abu failai turi būti Linux absoliučiuose keliuose už Git checkout ribų, current-UID savininko, tikslaus 0600 režimo, be symlink ar hardlink. Failai skaitomi iš naujo kiekvienai operacijai. HTTP klientas leidžia tik literal loopback adresą su portu, neseka redirect ir riboja atsakymą bei laiką. Tool argumentai negali pasirinkti identity, scope, root, API URL ar credential. Šis profilis projektų failų neskaito; CSV input saugomas kaip nekintamas request artefaktas.

Status available reikalauja tikros autentifikuotos API ir grant patikros. Tai nėra projekto verification PASS. Atnaujintas to paties user/space/scope leidimas gali perskaityti ar atšaukti istorines užduotis; worker tikrina originalų nekintamą vykdymo leidimą. Same-UID hostile izoliacijos failų režimas nežada.

Po pilno setup ir db:generate paleisti test:mcp:execution. test:csv:mcp reikalauja VERIFY_ZERO_CSV_DATABASE=1 ir ZERO_CSV_TEST_DATABASE_URL su specialiu zero_csv_test DB vardu. Šis proceso testas su netikru vietiniu naudotoju tikrina API ir kliento restart, Graphile, hash, idempotency ir revocation; modelių tiekėjų nekviečia. Native host ir host projekto panaudojimas yra atskiri vartai.
