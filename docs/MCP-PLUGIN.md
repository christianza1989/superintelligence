# Vietinis discovery papildinio paketas

2026-10-17. Tai discovery preview: trys katalogo įrankiai ir vienas reuse skill. Paruošimo bei verification įrankiai dar neįtraukti. Source-only rezultatas nėra patikrinta integracija ar naudos įrodymas.

## Sukurti ir patikrinti

Iš paruošto Git checkout su `npm run setup` priklausomybėmis:

```bash
npm run package:mcp
node scripts/test-mcp-plugin.mjs /absolute/path/printed/by/build
```

Build sukuria naują katalogą `.artifacts/plugins`, išsaugodamas ankstesnius ir nesėkmingus bandymus. Pakete yra savarankiškas `server/index.mjs`, katalogo snapshot, manifestai, skill, LICENSE/NOTICE ir visų aštuonių bundled dependency licencijos. Node 24 ar naujesnis vis dar reikalingas; runtime install ar projekto node_modules nereikia. BUILD.json pateikia tikslių serverio baitų SHA-256; testas jį patikrina prieš vykdymą.

Testas paleidžia tikrą proceso transportą iš atskiro tuščio katalogo pagal portable ir compatibility MCP konfigūraciją. Tikrina initialize, tool sąrašą, nonce, versijas, search/inspect faktus ir švarų stderr. Tai nėra host plugin įdiegimo imitacija ar jo PASS.

## Codex vietinis marketplace

Sugeneruoto paketo `.agents/plugins/marketplace.json` naudoja tikrą `repositoryzero-local-preview` vardą ir vietinį repositoryzero paketą. Įtraukti jau sukurtą katalogą oficialia komanda:

```bash
codex plugin marketplace add /absolute/path/to/generated/package
```

Šis veiksmas registruoja vietinį marketplace. Po to įdiegti `repositoryzero` iš to šaltinio programos Plugins sąraše; peržiūrėti trust ir atidaryti naują pokalbį. Nukopijuoti komandą nėra jos vykdymas ar connection patikra. Jei naudojamas Windows klientas, komandai pateikti Windows pasiekiamą paketo kelią, ne Linux kelią.

2026-10-17 vietinis marketplace registruotas oficialiu Codex CLI0.159.3 keliu, repositoryzero0.2.0 įdiegtas į host cache. Naujame Codex desktop pokalbyje užkrauta jo reuse skill ir tikrais MCP tools iškviesti status/search/inspect: server0.2.0, schema1.2.0, protocol2025-06-18, discovery-only, backendunavailable,796records, tas pats catalog SHA ir tikslus nonce. Tai tikras plugin install/new-session discovery PASS. Uninstall/update ir vykdymo profilio lifecycle dar nepriimti. [Oficialus packaging ir marketplace kelias](https://developers.openai.com/plugins/build/plugins), [vietinio serverio platinimo ribos](https://developers.openai.com/plugins/deploy/desktop-only). Viešo katalogo priėmimo ir universalaus Install mygtuko šis paketas neturi.

## Claude Code

Pakete yra atskiras `.claude-plugin/plugin.json` ir `.mcp.json`, naudojantis dokumentuotą CLAUDE_PLUGIN_ROOT. Oficialus `claude plugin validate` šiam manifestui praėjo. Tai schemos patikra; tikras Claude įrankių kvietimas ir įdiegimo lifecycle dar NOT_RUN. [Claude manifestų ir kelių dokumentacija](https://code.claude.com/docs/en/plugins-reference).

Laikinam development bandymui naudoti host dokumentuotą `--plugin-dir` su sugeneruotu katalogu. Neperkelti Codex ar Claude prenumeratos auth į paketą. Serveris neskaito projekto failų, nekviečia mokamų modelių ir nereikalauja API rakto.

## Dabartiniai įrodymai ir išjungimas

- Portable ir compatibility konfigūracijų tikri Linux proceso testai PASS.
- Savarankiškas paketas su Windows Node 24.19.0 praėjo initialize/status/search/inspect be workspace dependency resolution.
- Skill frontmatter/naming validator PASS; papildinio skill nėra nepriklausomo kūrimo benchmark rezultatas.
- Native Codex direct MCP PASS yra [atskiras įrodymas](experiments/MCP-PREVIEW-2026-10-17.md); jis savaime nepatvirtina plugin cache/install kelio.

Išjungti arba pašalinti tik šį papildinį per host Plugins valdymą. Naujoje sesijoje patikrinti, kad jo tools ir skill metadata neįkelti; kitų plugin/config nekeisti. Sugeneruoto katalogo pašalinimas nėra host cache uninstall. Iki realaus šios eigos bandymo P1X.9 lieka atviras.
