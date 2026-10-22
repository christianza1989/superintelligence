# Vietinis MCP papildinio paketas

2026-10-22. Numatytasis profilis — trys discovery įrankiai ir vienas reuse skill. Source 0.7.1 paketas turi pasirenkamą Linux operator-bound CSV paruošimo / patikros bei PDF / statinio HTML extraction, patvirtintų URL tyrimo ir PDF CSV puslapių transportą per esamą Zero API/Graphile. `zero_search` atskirai grąžina vieno paruošto CSV profilio ribotus faktus; jie nesuteikia vykdymo leidimo ar host integracijos patvirtinimo. Source-only rezultatas nėra patikrinta integracija ar naudos įrodymas. Tikro native 0.4 bandymo ribos išlaikomos atskirai nuo vėlesnės versijos source ir fixture kontrolės.

## Sukurti ir patikrinti

Iš paruošto Git checkout su `npm run setup` priklausomybėmis:

```bash
npm run package:mcp
node scripts/test-mcp-plugin.mjs /absolute/path/printed/by/build
node scripts/test-mcp-plugin-portable.mjs /absolute/path/printed/by/build
```

Build sukuria naują katalogą `.artifacts/plugins`, išsaugodamas ankstesnius ir nesėkmingus bandymus. Pakete yra mažas `server/index.mjs` bootstrap, atskiri `discovery.mjs` bei `execution.mjs`, katalogo snapshot, manifestai, skill, planavimo hook, LICENSE/NOTICE ir bundled dependency licencijų inventorius. Node 24 ar naujesnis vis dar reikalingas; runtime install ar projekto node_modules nereikia. BUILD.json pateikia visų trijų serverio failų ir keturių planavimo failų baitų SHA-256 bei profilių ribas; testas juos patikrina prieš vykdymą. Build atmeta DB, worker, verifier ir native koffi priklausomybes bei external runtime paketus.

0.7.1 skill aiškiai apima programos planavimą ir prašymą sustoti prieš kodavimą. Pasirenkamas `SessionStart` hook pateikia trumpą bendrą darbo eigą: perskaityti įdiegtą skill, patikrinti statusą ir ieškoti konkrečių užduoties gebėjimų. Jis nekeičia naudotojo prompto, pats nekviečia modelio ar MCP, neskaito projekto / transkripto ir nepradeda execution darbo. Tikri modelio MCP kvietimai vis tiek tikrinami atskirame naujame native pokalbyje.

Hook reikia atskiro dabartinės jo definicijos naudotojo trust. Įdiegimas ar plugin enable savaime jo nesuteikia; neperžiūrėtas hook praleidžiamas. [Oficiali hook peržiūros tvarka](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks). Offline Windows ir Linux patikros patvirtina paketo hook komandą, ribotą deterministinį JSON ir projekto nekeičiamumą; tai nėra native trust ar automatinio MCP naudojimo PASS. Be patikimo hook lieka įprasta implicit skill atranka; jos elgesio negalima prilyginti garantuotam iškvietimui.

Testas paleidžia tikrą proceso transportą iš atskiro tuščio katalogo pagal portable ir compatibility MCP konfigūraciją. Tikrina initialize, tool sąrašą, nonce, versijas, search/inspect faktus ir švarų stderr. Linux teste papildomai naudojamas nukopijuotas paketas be .git ir tikras STDIO klientas su vietiniu HTTP fixture: opt-in, 22 tools, URL task submit / PDF CSV page, atskirų profilių statusai, private binding reread/restart/revocation, neteisingo binding bei package/export katalogo atmetimas ir redacted klaidos. Tai transporto conformance; fixture nevykdo Graphile worker ir nėra native host plugin įdiegimo PASS.

## Automatinis planavimo naudojimas projekte

0.8.1 paketas turi pasirenkamą, operatoriaus paleidžiamą projekto prijungimą. Vien įdiegtas skill nėra garantija, kad host jį pasirinks: ankstesniuose natūraliuose bandymuose B turėjo įrankius, bet jų nekvietė. Oficialūs Codex dokumentai rekomenduoja trumpą [AGENTS.md taisyklę patikimam MCP naudojimui](https://developers.openai.com/learn/docs-mcp); [projekto instrukcijos](https://learn.chatgpt.com/docs/agent-configuration/agents-md) įkeliamos naujos sesijos pradžioje.

```bash
node /absolute/generated/package/setup/project-guidance.mjs apply /absolute/project
node /absolute/generated/package/setup/project-guidance.mjs status /absolute/project
node /absolute/generated/package/setup/project-guidance.mjs remove /absolute/project
```

Setup prideda vieną bendrą, pažymėtą `AGENTS.md` bloką tik aiškiai nurodytame projekte. Jis nukreipia programos planavimą į įdiegtą skill ir read-only status/search/inspect; neturi konkrečios užduoties ar komponento atsakymo. Nuo 0.9.0 atskirai autorizuotas Jev source-selection profilis su baigtiniu API cap gali planavimo metu pateikti mokamą `zero_select` rekomendaciją. Pats setup šio leidimo nesuteikia. Plan-only vis tiek draudžia prepare/verify, programos kodo vykdymą ir kitus mokamus darbus. Esamos instrukcijos išsaugomos baitais, pakartotas apply nieko nekeičia, remove pašalina tik nepakeistą savo bloką. Redaguotas ar senesnės versijos blokas, keli blokai, susietas failas ar `AGENTS.override.md` šešėlis sustabdo keitimą. Seną nepakeistą bloką galima pašalinti jį įrašiusio paketo helper ir tik tada taikyti naują. Globalios instrukcijos, MCP config, credentials ir hook trust nekeičiami. Šį veiksmą turi pasirinkti naudotojas/operatorius kaip prijungimo dalį; MCP ar modelis negali jo tyliai įjungti svetimame projekte.

Pagalbinis skriptas įtrauktas į `BUILD.json` hash sąrašą. Windows ir Linux grįžtamumo / konfliktų kontrolės PASS; native planavimo naudojimas turi būti įrodytas atskira nauja sesija. Tai papildomas projekto prijungimo profilis, ne įrodymas, kad ankstesnis skill-only bandymas automatiškai veikia. Natūraliame palyginime abi sesijos gauna identišką vartotojo užduotį, A neturi Zero projekto taisyklės, o visas B setup ir jo apimtis užfiksuojami prieš bandymą. Nepridėti užduoties atsakymų ar papildomų reikalavimų tik B.

## Codex vietinis marketplace

Source 0.10.0 / schema 1.11.0 operator-bound paketas papildomai turi `zero_discover` ir `zero_source`: ribotą gyvą public GitHub paiešką už katalogo ribų bei konkretaus pinned kodo apžiūrą. Jie naudoja tą patį API/Graphile kelią, ne kitą koordinatoriaus produktą. `zero_discover` gali kviesti Jev tik su atskirai leistu source research profiliu ir cap; `zero_source` Jev nekviečia. `zero_status.sourcePlanning` perduoda backend nustatytas source tyrimo / atrankos / mokamos atrankos leidimo būsenas; patys prašymai vėl tikrina leidimus ir biudžetą. Numatytasis savarankiškas discovery paketas neįjungia nei tinklo, nei mokamų darbų. Šių naujų operacijų įdiegimas ir natūralus naudojimas turi atskirą patikrą; [kūrimo įrodymai](experiments/REUSE-MODULE-CHAIN-2026-10-22.md) neperima native priėmimo.

Source 0.9.0 / schema 1.10.0 papildomai pateikia atskirus `sourceProfiles`: ERPNext, Frappe ir InvenTree peržiūrėtas kodo sritis, pin, failų hash, infrastruktūros reikalavimus ir žinomas spragas. Istorinis 796 repo katalogas nekeičiamas. Tai dalinė source aprėptis, ne visas GitHub ar paruošti produktai. `zero_select` įtrauktas tik į operator-bound paketą; numatytasis discovery paketas išlaiko tris nemokamus vietinius įrankius. [Kvalifikacija ir ribos](experiments/REUSE-MODULE-CHAIN-2026-10-22.md).

Source 0.10.1 / schema 1.11.1 leidžia `zero_discover`, `zero_select` ir `zero_source` argumentuose nenurodyti `deadline`: jį pagal savo laikrodį priskiria serveris. Rankiniu būdu pateiktas terminas turi būti ateityje iki 120 sekundžių; ilgesnis ar pasibaigęs atmetamas iki submit su fiksuotu pataisymo paaiškinimu. Kitų execution profilių terminų ir teisių taisyklės nepakeistos. [0.10.0 native nesėkmė ir po jos atskirai patikrinta pataisa](experiments/NATIVE-REPAIRDESK-PLANS-2026-10-22.md) išsaugotos; įdiegta 0.10.0 versija nėra šios pataisos native kvalifikacija.

0.8.2 / schema 1.9.0 discovery priima iki 2 048 simbolių konkretaus gebėjimo užklausą. `moduleCandidates` turi savo `candidateId`, tiesiogiai tinkamą `zero_inspect`; modulių apžiūra grąžina pasirinktų failų SHA-256, licenciją, ribas ir source-vendoring būdą. Repo katalogo inspect ir source-only būsena išlieka atskiri. Šie read-only faktai nesuteikia prepare/verify ar projekto integravimo leidimo. Pradinis natūralus 0.8.1 planų bandymas su ilgų užklausų / modulio ID klaidomis išsaugotas [ataskaitoje](experiments/REUSE-MODULE-CHAIN-2026-10-22.md); nauja versija jo retrospektyviai nepaverčia sėkminga integracija.

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

Opt-in prijungia zero_prepare, zero_job, zero_artifact, zero_cancel, zero_verify ir zero_freshness bei penkias zero_pdf_* (įskaitant zero_pdf_csv), keturias zero_browser_* ir keturias zero_research_* operacijas prie tų pačių application clients. Tikras zero_status nonce/profile/backend ir atskirų components atsakymas tikrina dabartinį API bei leidimą; tools sąrašas nėra authorization ar patikros PASS. Neteisingas, expired ar pašalintas binding užblokuoja operaciją be privataus turinio klaidoje. Endpoint ir sesija perskaitomi kiekvienai operacijai. [Konkrečių profilių ir failų ribos](MCP-SETUP.md).

Nauja proceso sesija be binding grįžta prie discovery. Atnaujinant paketą tikrinti naują BUILD.json, host pasirinkto paketo/cache versiją ir naujos sesijos zero_status; package pakeitimas nėra įrodytas host update. Uninstall nėra backend sesijos ar grant revocation: juos atšaukti atskirai pagal operatoriaus politiką. Vietinis paketo failo ištrynimas nėra host cache uninstall. Native install/update/uninstall priėmimas dokumentuojamas tik po tikro host bandymo; šis source/bundle testas jo neuždaro.

## Dabartiniai įrodymai ir išjungimas

- Portable ir compatibility konfigūracijų tikri Linux proceso testai PASS.
- Ankstesnis 0.4 paketas su Windows Node 24.19.0 praėjo initialize/status/search/inspect be workspace dependency resolution. 0.7.1 atskiras Windows standalone paketo/hook testas ir native direct MCP bridge status/search PASS; bundled MCP preflight ryšio nepatvirtino. [Naujos patikros, nesėkmės ir natūralaus planavimo rezultatas](experiments/NATIVE-VALUE-PILOT-2026-10-22.md).
- Ankstesnio skill frontmatter/naming validator PASS nepersiduoda naujai versijai: dabartinėje aplinkoje pats validator nepasileido dėl trūkstamo PyYAML. 0.7.1 įgūdį native host pateikė ir modelis perskaitė; tai nėra nepriklausomo kūrimo benchmark rezultatas.
- Native Codex direct MCP PASS yra [atskiras įrodymas](experiments/MCP-PREVIEW-2026-10-17.md); jis savaime nepatvirtina plugin cache/install kelio.

Išjungti arba pašalinti tik šį papildinį per host Plugins valdymą arba `codex plugin remove repositoryzero@repositoryzero-local-preview --json`. Windows veikiantis MCP procesas gali laikyti cache failus: pirmiausia uždaryti jį naudojančius pokalbius/procesus, tada kartoti oficialų remove; nenaikinti kitų procesų ar cache katalogų rankomis. Naujoje sesijoje patikrinti, kad jo tools ir skill metadata neįkelti; kitų plugin/config nekeisti. Sugeneruoto katalogo pašalinimas nėra host cache uninstall. Ši eiga patikrinta 0.4 Codex Windows discovery profiliui; grants/backend sesijos atšaukiamos atskirai. P1X.12 platesnis execution lifecycle lieka atviras.
