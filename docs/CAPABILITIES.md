# Gebėjimų, etapų ir dubliavimosi žemėlapis

Visi pasirinkimai šiuo metu yra source-reviewed kandidatai. Vienas užduočių autoritetas, vienas galutinis produkto UI ir pagal poreikį diegiami moduliai yra bendras principas. Vartotojo naujai pateiktas Rakazo įtrauktas į privalomą P0 build-vs-adapt palyginimą.

## Vienas vykdomas produktas

P0 turi pasirinkti: pritaikyti Rakazo kaip vienintelę platformos bazę arba kurti mažą Python kontrolės branduolį su React UI. SAI, gebėjimų ir priėmimo kontraktai lieka reikalavimais abiem variantams. Dviejų produktų užduočių būsenų sujungimas nėra MVP strategija. [Sprendimo vartai](../ROADMAP.md).

## Aprėptis ir pagrįsti pasirinkimai

| Sritis | Pirmas pasirinkimas / kandidatas | Kas gali papildyti | Ką palikti alternatyva |
|---|---|---|---|
| Planuotojas ir koordinavimas | Vienas deterministinis task runtime; Rakazo bazės tyrimas | Struktūrinis ModelAdapter, vertintojo rolė ir ribotas delegavimas | LangGraph, Pydantic AI, Smolagents, Hermes, OpenClaw kaip riboti adapteriai arba baseline |
| Įrankių registras ir protokolai | Vienas Tool RPC/JSON Schema ir oficialus MCP SDK | OpenAPI ar CLI adapteriai | Antras bendras įrankių registras be sinchronizavimo poreikio |
| Ilgos užduotys ir atkūrimas | Vienas scheduler, transakciniai events/outbox/effects | PostgreSQL pagal paskirstymo gate | Temporal arba DBOS vienam pagrįstam workflow autoritetui; ne abu kartu |
| Atmintis, RAG, paieškos kilmė | Projekto faktai, SQLite FTS ir ArtifactRef provenance | Vienas embedding/RAG modulis pagal duomenų poreikį | pgvector ar Qdrant; LlamaIndex ar Haystack vienoje retrieval grandinėje |
| Interneto tyrimai | Playwright ir paprastas fetch, ribotas šaltinių registras | Trafilatura tekstui, Scrapling laukams, Crawl4AI didesniam pipeline | Firecrawl kaip atskiras AGPL/cloud alternatyvus profilis; Scrapy didesniam crawl |
| Browser / computer use | Playwright deterministiniams veiksmams | Browser-use ar Stagehand modeliniam veiksmui; CUA desktop lane | Keli modeliniai browser agentai vienu metu tam pačiam darbui |
| Kodo kūrimas | Ribotas modelis→diff→test ciklas | Aider kaip pasirinktas CLI, AST paieška | OpenHands, SWE-agent, Goose kaip palyginimai ar atskiri specializuoti agentai |
| Testai ir vertinimas | pytest, Playwright, atskiras evaluator | Inspect, AgentDojo, SWE-bench, tau2 su užrakintu grader/data | Promptfoo/DeepEval papildomoms metrikoms; LLM judge vienas nepakankamas |
| Reverse engineering | **REA privalomas static JS profilis** | ast-grep/tree-sitter faktams; Ghidra native; mitmproxy savo HTTP srautui | Runtime/process capture atskirame profilyje, ne static profilio leidimų plėtra |
| PDF, OCR, Office | Docling pirmam corpus | Tesseract/OCRmyPDF; python-docx/python-pptx redaguojamiems failams | PyMuPDF ir Unstructured pagal licencijos ir konkretaus corpus rezultatą |
| Duomenys ir statistika | DuckDB SQL | Pandas/Polars pasirenkamas profilis, SciPy, Plotly | Abu DataFrame engine be konkretaus suderinamumo ar našumo poreikio |
| Vaizdai ir dizainas | Jau turimi assets, Excalidraw schemoms | Vienas Diffusers ar ComfyUI profilis; GIMP/Krita žmogaus peržiūrai | Keli pilni diffusion UI pagal nutylėjimą; neperžiūrėti custom nodes |
| Kalba ir garsas | Pasirinktas transkribavimo profilis | Faster-whisper arba whisper.cpp, Piper/Sherpa balsui | Visos Whisper implementacijos kaip nuolatinės priklausomybės |
| Video ir subtitrai | FFmpeg ir versijuotas montažo receptas | HyperFrames HTML video; MoviePy ar Manim pagal turinį | Abu pilni render engine vienai scenai be poreikio; Remotion custom licenciją vertinti atskirai |
| 3D ir CAD | build123d tiksliai CAD užduočiai | Trimesh patikrai, Blender scenai/render, FreeCAD peržiūrai | CadQuery ar OpenSCAD alternatyviam parametriniam API; ne visi CAD engine bazėje |
| Verslo procesai | Ploni API connector adapteriai | Activepieces core ar Node-RED; jau turimas ERPNext testinis endpoint | Naujas globalus workflow scheduler kiekvienai jungčiai; n8n licencija nėra permissive |
| Izoliavimas ir infrastruktūra | Trusted local lane ir atskiras hostile VM lane | Moby/runtime, gVisor pagal threat model; Firecracker tinkamame KVM host | Bubblewrap/nsjail kaip papildomas Linux hardening, ne garantuotas VM pakaitalas |
| Stebėsena ir sąnaudos | OTel, task/usage ledger | Prometheus/Grafana/OpenLIT operatoriui | Pilnas antras telemetrijos produktas prieš atsirandant apkrovai |
| Modelių aptarnavimas | Vienas providerio SDK ar jau turimas lokalus HTTP endpoint | Vienas Ollama/llama.cpp arba vLLM/SGLang profilis | Visi serveriai ar modelių svoriai baziniame diegime; MLX atskirai Mac |
| UI ir žmogaus įsikišimas | Rakazo feasibility arba React/assistant-ui | Artefaktų diff, preview, permission ir contribution vaizdai | LibreChat/chat-ui kaip produkto palyginimai, ne dar viena nesuderinta užduočių istorija |
| Indėlis ir atnaujinimai | GitHub discovery/review, patikimi release ir registras | Cosign, TUF, Trivy; bendras lease coordinator tik paskirstytam SAI | GitHub issues laikyti atomine lease ar autoriaus testus nepriklausomu acceptance |

## Pirmų maždaug30 projektų portfelis

Tai prioritetų portfelis, ne teiginys apie30 skirtingų runtime modulių ar įdiegtų programų. Jei pasirenkama Rakazo bazė, bendri API/UI/DB enableriai iš naujo peržiūrimi: nereikia įrengti FastAPI šalia Hono vien dėl šio sąrašo.

1. FastAPI
2. Pydantic
3. SQLAlchemy
4. React
5. assistant-ui
6. uv
7. OpenTelemetry Python
8. MCP Python SDK
9. Playwright
10. Docling
11. pytest
12. DuckDB
13. tree-sitter
14. REA
15. Crawl4AI
16. Scrapling
17. Trafilatura
18. Inspect AI
19. AgentDojo
20. python-docx
21. python-pptx
22. OCRmyPDF
23. Tesseract
24. Pandas
25. Plotly
26. FFmpeg
27. Faster-whisper
28. Piper
29. build123d
30. Trimesh

Rakazo yra atskiras prieš šį sąrašą priimamas platformos bazės sprendimas. Cosign/TUF/scan ir Git/SQLite/VM infrastruktūra vertinami kaip bendri lifecycle/host komponentai, jų įtraukimas nėra papildomas vartotojo gebėjimas. Tikslus pasirenkamų projektų skaičius nėra acceptance kriterijus.

## Kaip parenkamas vienas iš konkuruojančių įrankių

Vienoda užduočių imtis → tie patys duomenys ir modelis → užrakintos versijos → atskiras correctness validator → kaina/laikas/peak RSS/disk → gedimų ir atkūrimo bandymai → priežiūros ir licencijų kaina. Laimi aiškiai geresnis fit konkrečiam gebėjimui; kitą laikome alternatyviu profiliu. Jei skirtumas neįrodytas, renkamės mažesnę operacinę ir priklausomybių kainą, ne populiarumo skaičių.

Norminė [panašių modulių atranka](MODULE-SELECTION.md) skiria alias/fork, funkcinį overlap ir naują gebėjimą. Keli adapteriai gali įgyvendinti tą patį kontraktą: default, LT, CPU/offline, GPU ar tikras fallback profilis. Privalomi teisingumo/licencijos/permissions vartai negali būti kompensuoti greičiu; neaiškūs matavimai lieka inconclusive. Visiems įrodytais svarbiais profilio kriterijais nusileidžiantis kandidatas lieka istorijoje be aktyvios rekomendacijos. Šios semantinės grupės dabartiniam baseinui dar nepritaikytos.

## Išplėstas portfelis be skaičiaus lubų

Ankstesnis maždaug30projektų sąrašas yra pirmų įgyvendinimo prioritetų hipotezė. Jis neriboja [atviro baseino](research/CANDIDATE-POOL.md):757unikalūs prieinami repo, griežta naujų kandidatų atranka dar laukia. Science/research, matematikos, robotikos ir kitų sričių kandidatai lieka alternatyvų tyrime, kol yra konkretus domeno testas ir operatoriaus pajėgumas.

[Media programa](research/MEDIA-CANDIDATES.md) išskiria TTS, STT/diarization, realtime voice, image edit, T2V/I2V, camera control, avatar/lip-sync ir montažą. Piper/Whisper nėra iš anksto paskelbti geriausiais visiems darbams: bus lyginami su Kokoro/F5/Chatterbox/Fish/Qwen/CosyVoice ir ASR alternatyvomis. Higgsfield tipo rezultatas yra kelių gebėjimų pipeline, o ne įrodymas, kad rastas vienas lygiavertis open modelis.

**Treg** privalomas planuojamas katalogo/gateway adapteris. Vienas Treg serveris gali suteikti daug endpointų, bet jų pasirenkamos schemos, account grants, read/write/send ir billing tikrinami atskirai. **ProviderHub** jungia oficialius modelių API/OAuth/local metodus ir capability matricą; tai nėra papildomas globalus scheduler. [Detali specifikacija](MODELS-AND-TOOLS.md).
