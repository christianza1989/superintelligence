# Vietinis MCP papildinio paketas

2026-10-18. Numatytasis profilis — trys discovery įrankiai ir vienas reuse skill. Source 0.6 paketas turi pasirenkamą Linux operator-bound CSV paruošimo / patikros bei PDF / statinio HTML extraction transportą per esamą Zero API/Graphile. `zero_search` atskirai grąžina vieno paruošto CSV profilio ribotus faktus; jie nesuteikia vykdymo leidimo ar host integracijos patvirtinimo. Source-only rezultatas nėra patikrinta integracija ar naudos įrodymas. Tikro native 0.4 bandymo ribos išlaikomos atskirai nuo vėlesnės versijos source ir fixture kontrolės.

## Sukurti ir patikrinti

Iš paruošto Git checkout su `npm run setup` priklausomybėmis:

```bash
npm run package:mcp
node scripts/test-mcp-plugin.mjs /absolute/path/printed/by/build
node scripts/test-mcp-plugin-portable.mjs /absolute/path/printed/by/build
```

Build sukuria naują katalogą `.artifacts/plugins`, išsaugodamas ankstesnius ir nesėkmingus bandymus. Pakete yra mažas `server/index.mjs` bootstrap, atskiri `discovery.mjs` bei `execution.mjs`, katalogo snapshot, manifestai, skill, LICENSE/NOTICE ir bundled dependency licencijų inventorius. Node 24 ar naujesnis vis dar reikalingas; runtime install ar projekto node_modules nereikia. BUILD.json pateikia visų trijų serverio failų baitų SHA-256 ir profilių ribas; testas juos patikrina prieš vykdymą. Build atmeta DB, worker, verifier ir native koffi priklausomybes bei external runtime paketus.

Testas paleidžia tikrą proceso transportą iš atskiro tuščio katalogo pagal portable ir compatibility MCP konfigūraciją. Tikrina initialize, tool sąrašą, nonce, versijas, search/inspect faktus ir švarų stderr. Linux teste papildomai naudojamas nukopijuotas paketas be .git ir tikras STDIO klientas su vietiniu HTTP fixture: opt-in, 17 tools, atskirų profilių statusai, private binding reread/restart/revocation, neteisingo binding bei package/export katalogo atmetimas ir redacted klaidos. Tai transporto conformance; fixture nevykdo Graphile worker ir nėra native host plugin įdiegimo PASS.

## Codex vietinis marketplace

Sugeneruoto paketo `.agents/plugins/marketplace.json` naudoja tikrą `repositoryzero-local-preview` vardą ir vietinį repositoryzero paketą. Įtraukti jau sukurtą katalogą oficialia komanda:

```bash
codex plugin marketplace add /absolute/path/to/generated/package
```

Šis veiksmas registruoja vietinį marketplace. Po to įdiegti `repositoryzero` iš to šaltinio programos Plugins sąraše; peržiūrėti trust ir atidaryti naują pokalbį. Nukopijuoti komandą nėra jos vykdymas ar connection patikra. Jei naudojamas Windows klientas, komandai pateikti Windows pasiekiamą paketo kelią, ne Linux kelią.

2026-10-17 vietinis marketplace registruotas oficialiu Codex CLI0.159.3 keliu; pradinis repositoryzero0.2.0 install/new-session discovery PASS išsaugotas. Vėlesnis 0.4.0 update → nauja sesija → uninstall → nauja sesija be tools/skill → reinstall → nauja sesija su trimis tikrais MCP kvietimais taip pat PASS. Naujos sesijos patvirtino server0.4.0/schema1.4.0/protocol2025-06-18, discovery-only/backendunavailable,796records ir tą patį katalogo SHA; visų trijų cache bundles hash/baitai sutapo su BUILD.json. Oficialus CLI neleido perrašyti kito vietinio marketplace source, todėl tik mūsų source perregistruotas remove/add; kitų papildinių konfigūracija nekeista. Pirmas uninstall sustojo Windows os error32 dėl aktyvių šio papildinio MCP procesų; sustabdžius tik pagal tikslų cache entrypoint nustatytus procesus, oficialus remove pavyko. Abi kliūtys išsaugotos. Tai Codex Windows numatyto discovery profilio lifecycle, ne hot-unload, Linux execution lifecycle ar naujo žmogaus MVP1. [Oficialus packaging ir marketplace kelias](https://developers.openai.com/plugins/build/plugins), [vietinio serverio platinimo ribos](https://developers.openai.com/plugins/deploy/desktop-only). Viešo katalogo priėmimo ir universalaus Install mygtuko šis paketas neturi.

## Claude Code

Pakete yra atskiras `.claude-plugin/plugin.json` ir `.mcp.json`, naudojantis dokumentuotą CLAUDE_PLUGIN_ROOT. Oficialus `claude plugin validate` šiam manifestui praėjo. Tai schemos patikra; tikras Claude įrankių kvietimas ir įdiegimo lifecycle dar NOT_RUN. [Claude manifestų ir kelių dokumentacija](https://code.claude.com/docs/en/plugins-reference).

Laikinam development bandymui naudoti host dokumentuotą `--plugin-dir` su sugeneruotu katalogu. Neperkelti Codex ar Claude prenumeratos auth į paketą. Default discovery neskaito projekto failų, nekviečia mokamų modelių ir nereikalauja API rakto. Pasirenkamas execution skaito tik privatų operatoriaus binding ir perduoda ribotus užsakymus esamam backend; šiame pakete nėra DB, worker ar projekto verifier.

## Pasirenkamas Linux execution

Be nonempty ZERO_MCP_BINDING_FILE bootstrap importuoja tik discovery. Windows Node išlaiko šį trijų tools profilį; Windows native execution nepalaikomas. Linux operatorius gali aiškiai paleisti jau sukurtą paketą:

```bash
ZERO_MCP_BINDING_FILE=/absolute/private/operator.json node /absolute/generated/package/server/index.mjs
```

Tai vietinės operatoriaus reikšmės: paketas jų nesukuria, nenuspėja distro/Node/projekto root ir nerašo host global config. Privatus failas turi likti už bet kurio Git checkout ir paties paketo/export katalogo, absoliučiame canonical Linux kelyje, current UID, exact0600, vieno link ir be symlink. Paketo ribą įtvirtina compile-time flag; environment negali jos išjungti. Binding schema ir trusted backend/grant setup — [MCP-SETUP](MCP-SETUP.md). Host prenumeratos credentials neperduodami.

Opt-in prijungia zero_prepare, zero_job, zero_artifact, zero_cancel, zero_verify ir zero_freshness bei keturias zero_pdf_* ir keturias zero_browser_* operacijas prie tų pačių application clients. Tikras zero_status nonce/profile/backend ir atskirų components atsakymas tikrina dabartinį API bei leidimą; tools sąrašas nėra authorization ar patikros PASS. Neteisingas, expired ar pašalintas binding užblokuoja operaciją be privataus turinio klaidoje. Endpoint ir sesija perskaitomi kiekvienai operacijai. [Konkrečių profilių ir failų ribos](MCP-SETUP.md).

Nauja proceso sesija be binding grįžta prie discovery. Atnaujinant paketą tikrinti naują BUILD.json, host pasirinkto paketo/cache versiją ir naujos sesijos zero_status; package pakeitimas nėra įrodytas host update. Uninstall nėra backend sesijos ar grant revocation: juos atšaukti atskirai pagal operatoriaus politiką. Vietinis paketo failo ištrynimas nėra host cache uninstall. Native install/update/uninstall priėmimas dokumentuojamas tik po tikro host bandymo; šis source/bundle testas jo neuždaro.

## Dabartiniai įrodymai ir išjungimas

- Portable ir compatibility konfigūracijų tikri Linux proceso testai PASS.
- Savarankiškas paketas su Windows Node 24.19.0 praėjo initialize/status/search/inspect be workspace dependency resolution.
- Skill frontmatter/naming validator PASS; papildinio skill nėra nepriklausomo kūrimo benchmark rezultatas.
- Native Codex direct MCP PASS yra [atskiras įrodymas](experiments/MCP-PREVIEW-2026-10-17.md); jis savaime nepatvirtina plugin cache/install kelio.

Išjungti arba pašalinti tik šį papildinį per host Plugins valdymą arba `codex plugin remove repositoryzero@repositoryzero-local-preview --json`. Windows veikiantis MCP procesas gali laikyti cache failus: pirmiausia uždaryti jį naudojančius pokalbius/procesus, tada kartoti oficialų remove; nenaikinti kitų procesų ar cache katalogų rankomis. Naujoje sesijoje patikrinti, kad jo tools ir skill metadata neįkelti; kitų plugin/config nekeisti. Sugeneruoto katalogo pašalinimas nėra host cache uninstall. Ši eiga patikrinta 0.4 Codex Windows discovery profiliui; grants/backend sesijos atšaukiamos atskirai. P1X.12 platesnis execution lifecycle lieka atviras.
