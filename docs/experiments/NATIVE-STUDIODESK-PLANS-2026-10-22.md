# Native StudioDesk plans: larger media/AI task

Vėlesnė atskira [0.11.1 modulių planavimo pora](NATIVE-STUDIODESK-MODULE-PLANS-2026-10-22.md) išsaugota su savo užfiksuota versija; šio dokumento senų epochų rezultatai nekeisti.

Papildoma [planavimo sąnaudų, atrankos spragų ir siūlomų pataisų diagnozė](STUDIODESK-PLANNING-DIAGNOSIS-2026-10-22.md) remiasi galutinės 0.10.5 poros originaliais žurnalais; nauji vykdymai joje neatlikti.

**Naujausia: [galutinė 0.10.5 pora](#galutinė-0105-planų-pora), A 78.994 s / 238,301 host tokenų; B 221.097 s / 2,005,791 host tokenas. GitHub/Jev ir pinned source skaitymas veikė; kūrimo nauda ir kodas NOT_RUN. Žemiau esantis 0.10.1 aprašas yra originali istorija, vėlesni atskiri bandymai pateikti pabaigoje.**

The user requested a much larger application after the completed RepairDesk repeat. The separate [frozen StudioDesk fixture](../../benchmarks/native-studiodesk-plans/v1/README.md) covers layered images, video/audio editing, real exports, subtitles, local image/speech AI, project recovery and resource-limited background work. Both fresh native chats received identical natural prompt/SPEC bytes without GitHub, reuse or Zero hints and stopped after complete plans. No program code, dependencies or AI models were installed/generated/executed.

Model/effort was `gpt-6-luna`/high, core 0.163.0-alpha.11.1, fixed order A then B. Source checkpoint was `9aff393c00523218803cbd2c73405bbd098f0b7a`; the installed 0.10.1 package was built from `ac6e16931ff56d0a956893a04097e219d9b511ca`, with no intervening platform/plugin/script source changes. Exact source/plugin/backend/collector and initial workspace hashes matched through capture. A had no Zero metadata/guidance; B had the skill/MCP, disclosed generic operator-selected AGENTS guidance and a separately authorized source-only GitHub/Jev backend. Connection preflights were separate chats. An initial setup attempt observed the previous stopped runtime while a fresh backend was starting; the guard stopped before workspace archival, and setup succeeded after readiness. This did not enter the frozen pair.

| Measure | A: without Zero | B: with Zero |
|---|---:|---:|
| Native planning turn | 92.123 s | 231.691 s |
| Codex input tokens | 292,885 | 1,845,638 |
| Cached input, included above | 243,712 | 1,770,752 |
| Codex output tokens | 7,342 | 18,976 |
| Codex total tokens | 300,227 | 1,864,614 |
| Jev provider calls | 0 | 1 |
| Jev provider-reported USD | 0 | 0.000190512 |

Jev input is audit-only at the user's request and excluded from primary token comparison; full usage remains preserved. Cached input is already part of input. These are cumulative host counters, not unique context or subscription invoice cost. Cache was uncontrolled. One plan-only pair cannot establish repeatable speed, useful integration or code quality.

## Plan content

A proposed Tauri 2/React/TypeScript with Rust services, FFmpeg/ffprobe, Canvas/WebGL, an authoritative versioned project manifest and SQLite indexing/jobs. B proposed C++20/Qt 6/CMake with FFmpeg, shared editing models and SQLite/versioned JSON. Both covered layer/timeline persistence, rational timing, original-media references, undo/recovery, background jobs, atomic final export, archive checks, offline operation and staged local AI.

A named more specific AI candidates, including a Lithuanian voice candidate and an image model, while keeping background removal unresolved. B left the concrete Lithuanian voice/image models open, described tile changes for undo and more explicit frame/sample export checks, and identified OpenTimelineIO as interchange rather than a rendering engine. A retained a non-Lithuanian fragment. Neither plan's license, language, hardware, quality or compatibility claims were independently qualified. No voice/image was generated and no export was rendered. Different architectural choices do not establish a quality ranking; neither plan delivered a verified set of integrated modules.

## Actual source planning and failures

B decomposed the work into three discovery jobs: application foundation, editors and AI. The foundation search returned twenty distinct results and five pinned repositories with twenty HTTPS requests. Jev recommended `storytold/filmcraft` at `dd525c93d43b96843aedc50d7fa94a052474f476` as source-only, not a prepared/approved dependency. Its worker job took 15,197 ms including source research; this is not pure model latency. This is a more concrete application candidate than the broad directory recommended in RepairDesk.

The editor and AI searches returned twenty and twenty-five results but zero pinned candidates. Their network evidence recorded `rateLimited: true` and `rate_or_access_limit`; no Jev call was dispatched for those jobs. Their `no_current_pinned_source` outcomes are not evidence that no suitable implementation exists or that Jev judged the candidates unsuitable. A subsequent FilmCraft source-read job was blocked with the generic `profile_tool_or_receipt_unavailable` reason; its receipt does not establish the precise internal cause. The observer separately reassembled and SHA-256 verified all four terminal receipts.

B made fifty-five Zero MCP calls, including thirty-six artifact-page reads. One page request was rejected for asking for 65,536 bytes instead of the maximum 8,192. Host decoding attempts also failed on unavailable JavaScript globals, an incomplete JSON fragment and an attempted connector call from a Node REPL where it was unavailable. Those retries, failures and the original plans are preserved. B also performed ordinary host-side official-source research; that is separate from successful Zero/Jev selection. Source, prompts and checkers were not changed inside the pair.

The larger task produced a plausible application candidate, but complete multi-component source inspection/integration and benefit remain unproven. B took longer and used more Codex tokens. The observed receipt-consumption and access problems contribute uncertainty; their exact share of host time/tokens was not isolated. Final application quality cannot be compared because no implementation occurred. Next issues for review are source-access/rate-limit handling, distinguishing implementable code from directories, and reliable compact receipt consumption.

## Stop and retained budget

Both workspaces remained byte-unchanged. Application generation is stopped for human plan review. Grants were revoked and the owned API/worker/PostgreSQL fixture stopped; host-managed plugin processes were not broadly terminated. The cumulative additional USD 3 ledger retains USD 0.70 across seven prior/control/native invocations. This pair added USD 0.10 held, distinct from the provider-reported USD 0.000190512. The exhausted historical USD 1 allocation was not reset. No MVP or repeated-benefit gate was closed.

## Atskiras 0.10.2 pakartojimas — išsaugotas no-fit

Po GitHub autentifikavimo ir skaitomo receipt pataisų atlikta atskira švari Luna/high pora, tuo pačiu promptu ir SPEC. A: 109 009 ms, 328 180 input (290 304 cached), 10 216 output, 338 396 total. B: 123 263 ms, 688 197 input (628 736 cached), 11 041 output, 699 238 total. Failai, promptas ir užfiksuota versija poroje nekeisti; programos nekurtos.

B pasiekė autentifikuotą public-only GitHub, atliko 3 paieškas be rate-limit ar prieigos klaidų ir vienu skaitomu artifact kvietimu perskaitė hash patikrintą no-fit receipt. Tačiau trys perduotos frazės buvo ilgos reikalavimų eilutės: grąžinta 0 rezultatų ir 0 pins, todėl Jev dispatch = 0, provider USD = 0, module inspection = 0. Tai nėra pilno GitHub/Jev/modulių kelio native PASS. B savarankiškai pasiūlė Qt/MLT pagal dokumentaciją; šio pasiūlymo negalima priskirti Zero atrankai. Plane yra nelietuviškos kalbos fragmentas. Pirminė pora ir visi nesėkmių faktai išsaugoti; 0.10.3 trumpų frazių kontraktas ir skaidymo gairės tikrinami tik kitoje poroje.

## Atskiras 0.10.3 bandymas — nebaigta pora

Naujoje B sesijoje naudotos trumpesnės frazės ir keturi atskiri source tikslai. B planas užbaigtas per 168 155 ms; host input 1 464 841 (cached 1 357 184), output 10 296, total 1 475 137. Visi keturi source darbai sustojo po maždaug 20 s, Jev dispatch = 0 ir provider USD = 0. Originalūs blocked receipt ir planas išsaugoti. A nepaleistas, todėl tai nėra A/B pora ar lyginamoji naudos išvada.

Reprodukuota priežastis: atskiras GitHub tyrimo abort buvo perduotas kaip viso darbo klaida, todėl jau sukaupti source faktai nepasiekė receipt ir Jev. Pataisa 0.10.4 skiria tyrimo biudžetą nuo tėvinio darbo atšaukimo, išsaugo dalinius įrodymus su aiškiomis ribomis ir palieka laiko Jev; tikrinama atskirai, ne šio bandymo metu.

## Atskira 0.10.4 pora — GitHub ir Jev veikė, papildomi keliai nerasti

Švari pora tuo pačiu SPEC/promptu, Luna/high, eilė B tada A. A: 91 221 ms, input 256 901 (cached 219 648), output 6 980, total 263 881. B: 222 594 ms, input 1 238 145 (cached 998 528), output 13 025, total 1 251 170. Darbo katalogai ir užfiksuoti failai nepakeisti; programų kūrimas NOT_RUN.

B atliko 5 tikrus Jev pasirinkimus: 3 rekomendacijos ir 2 abstain, provider USD 0.000478380; Jev input iš headline host tokenų išimtas. Penki GitHub tyrimai išsaugojo 8 unikalius pins ir 5 hash patikrintus kodo failų pavyzdžius. Visi pažymėjo pasibaigusį ribotą tyrimo biudžetą; tai nėra viso GitHub ar viso repo peržiūra. Rekomenduoti MartinDelophy/ai-video-editor, igorski/bitmappery ir EitanWong/com.eitan.sherpa-onnx-unity liko source-only.

Dvi papildomos modulių apžiūros grąžino source_unavailable. Host pateikė numanomus kelius; pirmas HTTP 404 užbaigė visą kelių grupę. Kiti pateikti keliai nebuvo kvalifikuoti. B teisingai nepaskelbė šių kandidatų paruoštomis priklausomybėmis, tačiau tai neuždaro modulio apžiūros kelio native priėmimo. Plane taip pat yra nelietuviškos kalbos fragmentas. Visas planas, pradiniai receipt ir nesėkmės išsaugoti. 0.10.5 virtualaus repo šakninio katalogo ir per-path rezultatų pataisa vykdoma tik po šios poros.

## Galutinė 0.10.5 planų pora

Abu nauji pokalbiai: gpt-6-luna / high, Codex 0.163.0-alpha.11.1; identiškas SPEC ir promptas, eilė B → A. Šaltinis ee501edf7d38cdb32f2f372a7673461cfe6e0169; 226 source failai ir paketas/backend užfiksuoti prieš porą. A Zero nematė, B turėjo įdiegtą skill, bendras operatoriaus AGENTS gaires ir scoped GitHub/Jev source-only profilį. B preflight statuso kvietimas nepraėjo dėl nonce >64 simbolių; išsaugotas kaip klaida. Tikro pagrindinio B pokalbio zero_status patvirtino 0.10.5 / 1.11.5 ir aktyvų backend. Promptas nekeistas.

| Rodiklis | A be Zero | B su Zero |
|---|---:|---:|
| Laikas | 78.994 s | 221.097 s |
| Host input (įskaitant cache) | 231 919 | 1 992 421 |
| Iš jų cached input | 167 552 | 1 896 064 |
| Input be cache | 64 367 | 96 357 |
| Host output (reasoning yra poaibis) | 6 382 | 13 370 |
| Iš jų reasoning | 1 649 | 4 621 |
| Host total | 238 301 | 2 005 791 |
| Jev API kvietimai | 0 | 3 |
| Jev provider USD | 0 | 0.000343434 |

Jev input 8177 ir output 129 saugomi atskirai; į host total neįtraukti. Cached input yra input dalis, reasoning — output dalis. Host USD iš prenumeratos nežinomas. Tai vienos poros planavimo duomenys, ne kūrimo lenktynės: B truko 2.80× ilgiau ir turėjo 8.42× daugiau bendrų host tokenų; input be cache buvo tik 1.50× didesnis. Šie santykiai nėra USD kainos santykis. Cache nebuvo valomas ar kontroliuotas.

### Ką Zero tikrai atliko

3 GitHub/Jev tyrimai, 6 unikalūs pins, 4 hash patikrinti kodo failų pavyzdžiai discovery metu. 11 papildomų source skaitymo darbų baigėsi sėkmingai, per-path klaidų 0. Modelis iki plano finalo perskaitė 6 inspection receipt; kitų 5 rezultatus vėliau perskaitė tik read-only stebėtojas — jų nepriskiriame modelio panaudotiems įrodymams. 57 tikri MCP kvietimai, klaidų 0; modelio artifact kvietimų 9, be base64 dekodavimo ciklų. Visi 14 terminaliniai originalai atskirai SHA-256 patikrinti.

Jev rekomendacijos: Cutnora, OpenScene ir TTS Audio Suite. Modelis iš exact-pin README, priklausomybių manifestų ir katalogų nustatė naršyklės/debesijos/ComfyUI neatitikimus bei paliko juos architektūros nuorodomis. Tai teisėtas atsisakymas kopijuoti netinkamą priklausomybę, bet ne įrodymas, kad Zero rado geriausius galimus modulius ar sumažino kūrimo darbą. Visi discovery tyrimai pažymėjo riboto laiko pabaigą; aprėptis dalinė.

### Planų kokybės peržiūra

Abu siūlo Tauri/React/TypeScript/Rust, FFmpeg, SQLite, pasirenkamus vietinius AI ir etapinius scenarijus. A turi konkretų konservatyvų SQLite/WAL bei proceso argumentų valdymą ir aiškesnį CPU atskaitos rendererį. B papildomai pateikia tris konkrečius source pasiūlymus su commitais ir tikrais priklausomybių/architektūros neatitikimais. B projekte JSON manifestas yra atkuriama tiesa, SQLite — indeksas; A redagavimo duomenis daugiausia saugotų projekto SQLite.

Abiejuose dar neparinktas konkretus sluoksnių kompozitorius, neužfiksuoti kvalifikuoti AI modeliai/balsai, neįrodyta preview/export atitiktis ir faktinis resursų biudžetų vykdymas. B turi nelietuvišką fragmentą etapo antraštėje; originalas netaisytas. B nukelia dalį autosave/undo-recovery sutvirtinimo į vėlyvą etapą, nors tai turėtų lemti ankstyvą duomenų modelį. Nė viename nėra realiai integruoto modulių kodo ar vykdytų StudioDesk testų. Negalima skelbti kodo kokybės ar viso kūrimo naudos laimėtojo.

Visi ankstesni v1–v4 rezultatai ir nesėkmės išsaugoti atskirai. Pataisos nedarytos porų viduje. Bandymo API/worker/PostgreSQL sustabdyti, grant atšauktas. USD3 kumuliacinis ledger išlaiko USD1.80 hold per 18 kvietimų; tai nėra provider nurašyta suma, rezervai negrąžinti. Istorinis USD1 nepakeistas. Programos nekurtos; sustota žmogaus planų peržiūrai.
