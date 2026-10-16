# Kalbos, garso, vaizdų ir video kandidatų programa

Tikslas: pasirinkti stipriausią tinkamą sprendimą kiekvienam realiam darbui, įskaitant lietuvių kalbą ir kinematografinę generaciją. Tai tyrimo kandidatai, ne kokybės reitingas ar jau įdiegtų modelių sąrašas. Visi `NOT_RUN`. Pilni šaltiniai ir SHA [media JSON](../../catalog/media-candidates.json); licencijos žyma preliminari, modelių/duomenų/voice teisės audituojamos atskirai.

## Pirmi palyginimo krepšeliai

| Gebėjimas | Kandidatai palyginimui, jei prieinami ir tinkami pagal teises | Ką išmatuoti |
|---|---|---|
| TTS / balso generavimas | Kokoro, F5-TTS, Chatterbox, Fish Speech, Higgs Audio, Dia, IndexTTS, Qwen3-TTS, CosyVoice, Piper, Sherpa | LT/EN ir tikslinių kalbų suprantamumas, tarimas, aklas klausymas, natūralumas, latency iki pirmo garso, real-time factor, CPU/VRAM, voice/weights sąlygos |
| STT / ASR | Whisper / faster-whisper / whisper.cpp, Qwen3-ASR, FunASR, WhisperX, Sherpa, Vosk, NeMo | LT/EN WER/CER, triukšmas, akcentai, laiko žymos, diarization, streaming latency ir resursai |
| Realaus laiko pokalbis | Pipecat, LiveKit Agents, TEN, RealtimeSTT/TTS, Silero/TEN/WebRTC VAD | Kalbėjimo pertraukimas, turn-taking, echo, p95 viso voice loop latency, disconnect/reconnect, išorinių paslaugų kaina |
| Kinematografinis video | Wan, HunyuanVideo, LTX, CogVideo, Open-Sora, Mochi; MotionCtrl / CameraCtrl / CameraCtrl2 | T2V/I2V, kameros trajektorija, scenos/veikėjo nuoseklumas, judesys, trukmė/raiška/fps, laikas, VRAM ir modelio teisės |
| Avatarai ir lip-sync | LivePortrait, MuseTalk, Wav2Lip, SadTalker, Hallo, HunyuanVideo-Avatar | Audio/video sync, tapatumo išlaikymas, išraiška, artefaktai, batch/streaming ir leidžiami šaltiniai |
| Vaizdai / redagavimas | Diffusers / ComfyUI, Qwen-Image, FLUX, Step1X-Edit, Janus | Instrukcijos laikymasis, lokalus edit, mask, personažo nuoseklumas, OCR/text ir modelių/LoRA sąlygos |
| Montažas ir eksportas | FFmpeg, HyperFrames, MoviePy, Manim, RIFE, Real-ESRGAN, ProPainter | Atkuriamas receptas, codec/container, subtitles, frames/audio sync, CPU/GPU ir laikinas diskas |

Vieno absoliučiai „geriausio“ modelio visoms kalboms, įrangai ir užduotims nepasirenkame be palyginimų. Research kandidatai, API SDK, mokymo kodas, custom nodes ir realūs self-hosted modeliai turi būti atskirti kiekvienos kortelės deep-dive metu. README našumo skaičiai šiame darbe nekartoti.

## Higgsfield tipo funkcijos

Naudotojo poreikį verčiame konkrečia pipeline: scenarijus / storyboard → vaizdai ir veikėjų nuoseklumas → T2V/I2V → kamera ir judesys → voice / muzika / lip-sync → timeline ir eksportas. Tai keli su vienodu artefaktų kontraktu jungiami gebėjimai, galintys turėti tiek vietinį GPU profilį, tiek aiškiai pažymėtą mokamą API profilį.

Paieška rado `higgsfield-ai/higgsfield`, `higgsfield-ai/cli`, `wide-trace/open-higgsfield`, `SegFault42/HeliosGen` ir įvairių skills/wrappers. Pavadinimo sutapimas ar „Higgsfield alternative“ aprašymas neįrodo oficialaus kino produkto modelių svorių, API teisės ar visos platformos open-source statuso. `higgsfield-ai/higgsfield` README kryptis – GPU / training infrastruktūra; jo nelaikome savaime kinematografiniu varikliu. Oficialus kino API, jo SDK kilmė ir sąlygos dar turi atskirą patikrą. Higgs Audio yra atskiras balso kandidatas.

## Tolimesnio testo duomenys ir priėmimas

Iš anksto fiksuoti vienodą licencijuotą LT/EN corpus ir sintetinius / autorizuotus balsus bei veidus; užfiksuoti modelio weights digest, quantization, dtype, įrangą, seed ir pipeline. Tas pats tekstas / garso įrašas / scena, aklas žmogaus vertinimas + deterministinės metrikos, visi failures, kokybės–kainos palyginimas pagal konkrečią įrangą. Nežinomas VRAM ar kaina lieka null. Užduočiai skirtas rekomenduojamas profilis tik po OS, offline/reconnect, cancellation, install/update/uninstall ir resursų patikrų.

## Išsaugoti kandidatai

| Repo | Sritis | Būsena | Kodo licencijos šaltinio preliminari žyma |
|---|---|---|---|

| [altic-dev/FluidVoice](https://github.com/altic-dev/FluidVoice) | audio | unscored_discovery | GPL (inspect exact version/exceptions) |
| [block/buzz](https://github.com/block/buzz) | audio | unscored_discovery | Apache-2.0 |
| [chidiwilliams/buzz](https://github.com/chidiwilliams/buzz) | audio | unscored_discovery | MIT |
| [collabora/WhisperLive](https://github.com/collabora/WhisperLive) | audio | unscored_discovery | MIT |
| [coqui-ai/TTS](https://github.com/coqui-ai/TTS) | audio | unscored_discovery | MPL-2.0 |
| [debpalash/VoiceStudio](https://github.com/debpalash/VoiceStudio) | audio | unscored_discovery | AGPL-3.0 (inspect exceptions/version); LicenseRef-Manual-Review |
| [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp) | audio | initial_documentary_sample | MIT |
| [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | audio | initial_documentary_sample | Apache-2.0 |
| [livekit/agents](https://github.com/livekit/agents) | audio | unscored_discovery | Apache-2.0 |
| [myshell-ai/OpenVoice](https://github.com/myshell-ai/OpenVoice) | audio | unscored_discovery | MIT |
| [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl) | audio | initial_documentary_sample | GPL (inspect exact version/exceptions) |
| [openai/whisper](https://github.com/openai/whisper) | audio | initial_documentary_sample | MIT |
| [pipecat-ai/pipecat](https://github.com/pipecat-ai/pipecat) | audio | unscored_discovery | BSD family (inspect clause count) |
| [rhasspy/piper](https://github.com/rhasspy/piper) | audio | unscored_discovery | MIT |
| [RVC-Boss/GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) | audio | unscored_discovery | MIT |
| [SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper) | audio | initial_documentary_sample | MIT |
| [QwenLM/Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) | audio-music | unscored_discovery | Apache-2.0 |
| [SpeechBrain/speechbrain](https://github.com/SpeechBrain/speechbrain) | audio-music | unscored_discovery | Apache-2.0 |
| [aigc-apps/VideoX-Fun](https://github.com/aigc-apps/VideoX-Fun) | avatars-lipsync | unscored_discovery | Apache-2.0 |
| [fudan-generative-vision/hallo](https://github.com/fudan-generative-vision/hallo) | avatars-lipsync | unscored_discovery | MIT |
| [fudan-generative-vision/hallo2](https://github.com/fudan-generative-vision/hallo2) | avatars-lipsync | unscored_discovery | MIT |
| [HumanAIGC/AnimateAnyone](https://github.com/HumanAIGC/AnimateAnyone) | avatars-lipsync | unscored_discovery | Apache-2.0 |
| [HumanAIGC/EMO](https://github.com/HumanAIGC/EMO) | avatars-lipsync | unscored_discovery | — |
| [KlingAIResearch/LivePortrait](https://github.com/KlingAIResearch/LivePortrait) | avatars-lipsync | unscored_discovery | MIT |
| [OpenTalker/SadTalker](https://github.com/OpenTalker/SadTalker) | avatars-lipsync | unscored_discovery | Apache-2.0 |
| [Rudrabha/Wav2Lip](https://github.com/Rudrabha/Wav2Lip) | avatars-lipsync | unscored_discovery | — |
| [TMElyralab/MuseTalk](https://github.com/TMElyralab/MuseTalk) | avatars-lipsync | unscored_discovery | MIT |
| [AlibabaResearch/AMAP](https://github.com/AlibabaResearch/AMAP) | cinematic-camera-control | address_unresolved | — |
| [nju-wins/CameraCtrl](https://github.com/nju-wins/CameraCtrl) | cinematic-camera-control | address_unresolved | — |
| [Tencent-Hunyuan/HunyuanVideo-Avatar](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar) | cinematic-camera-control | unscored_discovery | UNKNOWN |
| [TencentARC/MotionCtrl](https://github.com/TencentARC/MotionCtrl) | cinematic-camera-control | unscored_discovery | Apache-2.0 |
| [THUDM/CameraCtrl2](https://github.com/THUDM/CameraCtrl2) | cinematic-camera-control | address_unresolved | — |
| [zhcui/CameraCtrl2](https://github.com/zhcui/CameraCtrl2) | cinematic-camera-control | address_unresolved | — |
| [black-forest-labs/flux2](https://github.com/black-forest-labs/flux2) | image-editing-consistency | unscored_discovery | Apache-2.0 |
| [bmaltais/kohya_ss](https://github.com/bmaltais/kohya_ss) | image-editing-consistency | unscored_discovery | Apache-2.0 |
| [deepseek-ai/Janus](https://github.com/deepseek-ai/Janus) | image-editing-consistency | unscored_discovery | MIT; LicenseRef-Manual-Review |
| [huggingface/peft](https://github.com/huggingface/peft) | image-editing-consistency | unscored_discovery | Apache-2.0 |
| [ostris/ai-toolkit](https://github.com/ostris/ai-toolkit) | image-editing-consistency | unscored_discovery | MIT |
| [QwenLM/Qwen-Image](https://github.com/QwenLM/Qwen-Image) | image-editing-consistency | unscored_discovery | Apache-2.0 |
| [QwenLM/Qwen-Image-Layered](https://github.com/QwenLM/Qwen-Image-Layered) | image-editing-consistency | unscored_discovery | Apache-2.0 |
| [stepfun-ai/Step1X-Edit](https://github.com/stepfun-ai/Step1X-Edit) | image-editing-consistency | unscored_discovery | Apache-2.0 |
| [Acly/krita-ai-diffusion](https://github.com/Acly/krita-ai-diffusion) | images | unscored_discovery | GPL (inspect exact version/exceptions) |
| [AUTOMATIC1111/stable-diffusion-webui](https://github.com/AUTOMATIC1111/stable-diffusion-webui) | images | unscored_discovery | AGPL-3.0 (inspect exceptions/version) |
| [black-forest-labs/flux](https://github.com/black-forest-labs/flux) | images | unscored_discovery | Apache-2.0 |
| [Comfy-Org/ComfyUI](https://github.com/Comfy-Org/ComfyUI) | images | initial_documentary_sample | GPL (inspect exact version/exceptions) |
| [GNOME/gimp](https://github.com/GNOME/gimp) | images | initial_documentary_sample | GPL (inspect exact version/exceptions) |
| [hao-ai-lab/FastVideo](https://github.com/hao-ai-lab/FastVideo) | images | unscored_discovery | Apache-2.0 |
| [huggingface/diffusers](https://github.com/huggingface/diffusers) | images | initial_documentary_sample | Apache-2.0 |
| [inkscape/inkscape](https://github.com/inkscape/inkscape) | images | unscored_discovery | — |
| [InvokeAI/InvokeAI](https://github.com/InvokeAI/InvokeAI) | images | address_unresolved | — |
| [KDE/krita](https://github.com/KDE/krita) | images | initial_documentary_sample | GPL (inspect exact version/exceptions); BSD family (inspect clause count) |
| [lllyasviel/ControlNet](https://github.com/lllyasviel/ControlNet) | images | unscored_discovery | Apache-2.0 |
| [lllyasviel/Fooocus](https://github.com/lllyasviel/Fooocus) | images | unscored_discovery | GPL (inspect exact version/exceptions) |
| [Tencent-Hunyuan/HunyuanImage-3.0](https://github.com/Tencent-Hunyuan/HunyuanImage-3.0) | images | unscored_discovery | UNKNOWN |
| [webui-dev/stable-diffusion-webui](https://github.com/webui-dev/stable-diffusion-webui) | images | address_unresolved | — |
| [Fannovel16/ComfyUI-Frame-Interpolation](https://github.com/Fannovel16/ComfyUI-Frame-Interpolation) | media-postproduction | unscored_discovery | MIT |
| [hzwer/ECCV2022-RIFE](https://github.com/hzwer/ECCV2022-RIFE) | media-postproduction | unscored_discovery | MIT |
| [jianchang512/pyvideotrans](https://github.com/jianchang512/pyvideotrans) | media-postproduction | unscored_discovery | GPL (inspect exact version/exceptions) |
| [kijai/ComfyUI-LTXVideo](https://github.com/kijai/ComfyUI-LTXVideo) | media-postproduction | unscored_discovery | UNKNOWN |
| [kijai/ComfyUI-WanVideoWrapper](https://github.com/kijai/ComfyUI-WanVideoWrapper) | media-postproduction | unscored_discovery | Apache-2.0 |
| [kkroening/ffmpeg-python](https://github.com/kkroening/ffmpeg-python) | media-postproduction | unscored_discovery | Apache-2.0 |
| [lightx2v/lightx2v](https://github.com/lightx2v/lightx2v) | media-postproduction | address_unresolved | — |
| [mifi/lossless-cut](https://github.com/mifi/lossless-cut) | media-postproduction | unscored_discovery | GPL (inspect exact version/exceptions) |
| [sczhou/ProPainter](https://github.com/sczhou/ProPainter) | media-postproduction | unscored_discovery | LicenseRef-Manual-Review |
| [vllm-project/vllm-omni](https://github.com/vllm-project/vllm-omni) | media-postproduction | unscored_discovery | Apache-2.0 |
| [xinntao/Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) | media-postproduction | unscored_discovery | BSD family (inspect clause count) |
| [ad-srvn/MicCheck](https://github.com/ad-srvn/MicCheck) | media-search-followup | unscored_discovery | MIT |
| [ajay-sainy/Wav2Lip-GFPGAN](https://github.com/ajay-sainy/Wav2Lip-GFPGAN) | media-search-followup | unscored_discovery | — |
| [AKCodez/higgsfield-claude-skills](https://github.com/AKCodez/higgsfield-claude-skills) | media-search-followup | unscored_discovery | — |
| [Anil-matcha/Open-Generative-AI](https://github.com/Anil-matcha/Open-Generative-AI) | media-search-followup | unscored_discovery | MIT |
| [api-evangelist/rev-ai](https://github.com/api-evangelist/rev-ai) | media-search-followup | unscored_discovery | — |
| [api-evangelist/runware](https://github.com/api-evangelist/runware) | media-search-followup | unscored_discovery | — |
| [api-evangelist/runway](https://github.com/api-evangelist/runway) | media-search-followup | unscored_discovery | — |
| [AsifiweAfisa/darkmind-auto](https://github.com/AsifiweAfisa/darkmind-auto) | media-search-followup | unscored_discovery | — |
| [babysor/MockingBird](https://github.com/babysor/MockingBird) | media-search-followup | unscored_discovery | MIT |
| [beshuaxian/higgsfield-seedance2-jineng](https://github.com/beshuaxian/higgsfield-seedance2-jineng) | media-search-followup | unscored_discovery | — |
| [bridgmain11/Otsav-Dj-Full-Version](https://github.com/bridgmain11/Otsav-Dj-Full-Version) | media-search-followup | unscored_discovery | MIT |
| [brycedrennan/imaginAIry](https://github.com/brycedrennan/imaginAIry) | media-search-followup | unscored_discovery | MIT |
| [bytedance/LatentSync](https://github.com/bytedance/LatentSync) | media-search-followup | unscored_discovery | Apache-2.0 |
| [cclank/lanshu-awesome-ai-video-kit](https://github.com/cclank/lanshu-awesome-ai-video-kit) | media-search-followup | unscored_discovery | MIT |
| [cemeka497/Dragon-Professional-Individual-Full-Version](https://github.com/cemeka497/Dragon-Professional-Individual-Full-Version) | media-search-followup | unscored_discovery | MIT |
| [cjpais/Handy](https://github.com/cjpais/Handy) | media-search-followup | unscored_discovery | MIT |
| [CollaborativeVideoDiffusion/CVD](https://github.com/CollaborativeVideoDiffusion/CVD) | media-search-followup | unscored_discovery | Apache-2.0 |
| [CorentinJ/Real-Time-Voice-Cloning](https://github.com/CorentinJ/Real-Time-Voice-Cloning) | media-search-followup | unscored_discovery | MIT |
| [cth9191/motion-design](https://github.com/cth9191/motion-design) | media-search-followup | unscored_discovery | — |
| [customdiffusion360/custom-diffusion360](https://github.com/customdiffusion360/custom-diffusion360) | media-search-followup | unscored_discovery | LicenseRef-Manual-Review |
| [DanielSWolf/rhubarb-lip-sync](https://github.com/DanielSWolf/rhubarb-lip-sync) | media-search-followup | unscored_discovery | MIT |
| [darshmahadevia/Voco](https://github.com/darshmahadevia/Voco) | media-search-followup | unscored_discovery | MIT |
| [derafeha249/Edimakor](https://github.com/derafeha249/Edimakor) | media-search-followup | unscored_discovery | MIT |
| [DrewThomasson/ebook2audiobook](https://github.com/DrewThomasson/ebook2audiobook) | media-search-followup | unscored_discovery | Apache-2.0 |
| [duixcom/Duix-Avatar](https://github.com/duixcom/Duix-Avatar) | media-search-followup | unscored_discovery | UNKNOWN |
| [EnVision-Research/DualCamCtrl](https://github.com/EnVision-Research/DualCamCtrl) | media-search-followup | unscored_discovery | — |
| [Eyeline-Labs/Virtually-Being](https://github.com/Eyeline-Labs/Virtually-Being) | media-search-followup | unscored_discovery | Apache-2.0 |
| [FlexMonkey/MetalKit-ReactionDiffusion](https://github.com/FlexMonkey/MetalKit-ReactionDiffusion) | media-search-followup | unscored_discovery | — |
| [fudan-zvg/WoVoGen](https://github.com/fudan-zvg/WoVoGen) | media-search-followup | unscored_discovery | Apache-2.0 |
| [gulucaptain/CameraNoise](https://github.com/gulucaptain/CameraNoise) | media-search-followup | unscored_discovery | — |
| [hasanarasinal/ai-video-generation-cost-forecast](https://github.com/hasanarasinal/ai-video-generation-cost-forecast) | media-search-followup | unscored_discovery | — |
| [HBAI-Ltd/Toonflow-app](https://github.com/HBAI-Ltd/Toonflow-app) | media-search-followup | unscored_discovery | MIT |
| [hecomi/uLipSync](https://github.com/hecomi/uLipSync) | media-search-followup | unscored_discovery | MIT |
| [higgsfield-ai/cli](https://github.com/higgsfield-ai/cli) | media-search-followup | unscored_discovery | MIT |
| [higgsfield-ai/higgsfield](https://github.com/higgsfield-ai/higgsfield) | media-search-followup | unscored_discovery | Apache-2.0 |
| [HKUDS/ViMax](https://github.com/HKUDS/ViMax) | media-search-followup | unscored_discovery | MIT |
| [ipsin/discokeyframe](https://github.com/ipsin/discokeyframe) | media-search-followup | unscored_discovery | MIT |
| [jamiepine/voicebox](https://github.com/jamiepine/voicebox) | media-search-followup | unscored_discovery | MIT |
| [jinwoo1601/VoXR-Speech-Recognition](https://github.com/jinwoo1601/VoXR-Speech-Recognition) | media-search-followup | unscored_discovery | Apache-2.0; UNKNOWN |
| [joonson/syncnet_python](https://github.com/joonson/syncnet_python) | media-search-followup | unscored_discovery | MIT |
| [k1ngofdarks/Automatic-Speech-Recognition](https://github.com/k1ngofdarks/Automatic-Speech-Recognition) | media-search-followup | unscored_discovery | MIT |
| [k2-fsa/OmniVoice](https://github.com/k2-fsa/OmniVoice) | media-search-followup | unscored_discovery | Apache-2.0 |
| [kingofarms989/Mgba](https://github.com/kingofarms989/Mgba) | media-search-followup | unscored_discovery | MIT |
| [kisonecat/times-tables-outloud](https://github.com/kisonecat/times-tables-outloud) | media-search-followup | unscored_discovery | — |
| [krizaka/orazaka-worker-media](https://github.com/krizaka/orazaka-worker-media) | media-search-followup | unscored_discovery | Apache-2.0 |
| [MeiGen-AI/InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk) | media-search-followup | unscored_discovery | Apache-2.0 |
| [met4citizen/TalkingHead](https://github.com/met4citizen/TalkingHead) | media-search-followup | unscored_discovery | MIT |
| [moonshine-ai/moonshine](https://github.com/moonshine-ai/moonshine) | media-search-followup | unscored_discovery | MIT |
| [mozilla/DeepSpeech](https://github.com/mozilla/DeepSpeech) | media-search-followup | unscored_discovery | MPL-2.0 |
| [open-mmlab/mmagic](https://github.com/open-mmlab/mmagic) | media-search-followup | unscored_discovery | Apache-2.0 |
| [orylite/lindyson-ai](https://github.com/orylite/lindyson-ai) | media-search-followup | unscored_discovery | Apache-2.0 |
| [OSideMedia/higgsfield-ai-prompt-skill](https://github.com/OSideMedia/higgsfield-ai-prompt-skill) | media-search-followup | unscored_discovery | MIT |
| [PaddlePaddle/PaddleSpeech](https://github.com/PaddlePaddle/PaddleSpeech) | media-search-followup | unscored_discovery | Apache-2.0 |
| [rany2/edge-tts](https://github.com/rany2/edge-tts) | media-search-followup | unscored_discovery | MIT |
| [rediumvex/ai-video-generator-claude](https://github.com/rediumvex/ai-video-generator-claude) | media-search-followup | unscored_discovery | MIT |
| [SegFault42/HeliosGen](https://github.com/SegFault42/HeliosGen) | media-search-followup | unscored_discovery | — |
| [ShmuelRonen/ComfyUI-LatentSyncWrapper](https://github.com/ShmuelRonen/ComfyUI-LatentSyncWrapper) | media-search-followup | unscored_discovery | — |
| [Shoebaislam/Technician-reviewed-vehicle-inspection-reporting-with-local-speech-recognition-and-n8n-automation](https://github.com/Shoebaislam/Technician-reviewed-vehicle-inspection-reporting-with-local-speech-recognition-and-n8n-automation) | media-search-followup | source_revision_unresolved | — |
| [snap-research/ac3d](https://github.com/snap-research/ac3d) | media-search-followup | unscored_discovery | Apache-2.0 |
| [timoncool/speech-studio](https://github.com/timoncool/speech-studio) | media-search-followup | unscored_discovery | MIT |
| [uni-halle/ts-api](https://github.com/uni-halle/ts-api) | media-search-followup | unscored_discovery | — |
| [valetchampions/Zune-Full-Version-Unlocked](https://github.com/valetchampions/Zune-Full-Version-Unlocked) | media-search-followup | unscored_discovery | MIT |
| [wide-trace/open-higgsfield](https://github.com/wide-trace/open-higgsfield) | media-search-followup | unscored_discovery | — |
| [wladradchenko/wunjo.wladradchenko.ru](https://github.com/wladradchenko/wunjo.wladradchenko.ru) | media-search-followup | unscored_discovery | GPL (inspect exact version/exceptions) |
| [ZGCTroy/CamI2V](https://github.com/ZGCTroy/CamI2V) | media-search-followup | unscored_discovery | MIT |
| [Zz-ww/SadTalker-Video-Lip-Sync](https://github.com/Zz-ww/SadTalker-Video-Lip-Sync) | media-search-followup | unscored_discovery | — |
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | popularity-discovery | initial_documentary_sample | Apache-2.0 |
| [KoljaB/RealtimeSTT](https://github.com/KoljaB/RealtimeSTT) | realtime-voice | unscored_discovery | MIT |
| [KoljaB/RealtimeTTS](https://github.com/KoljaB/RealtimeTTS) | realtime-voice | unscored_discovery | MIT |
| [pyannote/pyannote-core](https://github.com/pyannote/pyannote-core) | realtime-voice | unscored_discovery | MIT |
| [snakers4/silero-vad](https://github.com/snakers4/silero-vad) | realtime-voice | unscored_discovery | MIT |
| [speechmatics/speechmatics-python-sdk](https://github.com/speechmatics/speechmatics-python-sdk) | realtime-voice | unscored_discovery | MIT |
| [TEN-framework/ten-framework](https://github.com/TEN-framework/ten-framework) | realtime-voice | unscored_discovery | Apache-2.0 |
| [TEN-framework/ten-vad](https://github.com/TEN-framework/ten-vad) | realtime-voice | unscored_discovery | Apache-2.0 |
| [wiseman/py-webrtcvad](https://github.com/wiseman/py-webrtcvad) | realtime-voice | unscored_discovery | MIT |
| [ahmetoner/whisper-asr-webservice](https://github.com/ahmetoner/whisper-asr-webservice) | stt-asr-diarization | unscored_discovery | — |
| [alphacep/vosk-api](https://github.com/alphacep/vosk-api) | stt-asr-diarization | unscored_discovery | Apache-2.0 |
| [facebookresearch/fairseq](https://github.com/facebookresearch/fairseq) | stt-asr-diarization | unscored_discovery | MIT |
| [facebookresearch/seamless_communication](https://github.com/facebookresearch/seamless_communication) | stt-asr-diarization | unscored_discovery | LicenseRef-Manual-Review |
| [k2-fsa/icefall](https://github.com/k2-fsa/icefall) | stt-asr-diarization | unscored_discovery | Apache-2.0 |
| [k2-fsa/sherpa](https://github.com/k2-fsa/sherpa) | stt-asr-diarization | unscored_discovery | Apache-2.0 |
| [m-bain/whisperX](https://github.com/m-bain/whisperX) | stt-asr-diarization | unscored_discovery | BSD family (inspect clause count) |
| [modelscope/FunASR](https://github.com/modelscope/FunASR) | stt-asr-diarization | unscored_discovery | MIT |
| [OpenNMT/CTranslate2](https://github.com/OpenNMT/CTranslate2) | stt-asr-diarization | unscored_discovery | MIT |
| [pyannote/pyannote-audio](https://github.com/pyannote/pyannote-audio) | stt-asr-diarization | unscored_discovery | MIT |
| [QwenAudio/Fun-ASR](https://github.com/QwenAudio/Fun-ASR) | stt-asr-diarization | unscored_discovery | Apache-2.0 |
| [QwenLM/Qwen3-ASR](https://github.com/QwenLM/Qwen3-ASR) | stt-asr-diarization | unscored_discovery | Apache-2.0 |
| [boson-ai/higgs-audio](https://github.com/boson-ai/higgs-audio) | tts-voice-generation | unscored_discovery | Apache-2.0 |
| [canopyai/Orpheus-TTS](https://github.com/canopyai/Orpheus-TTS) | tts-voice-generation | unscored_discovery | Apache-2.0 |
| [fishaudio/fish-speech](https://github.com/fishaudio/fish-speech) | tts-voice-generation | unscored_discovery | UNKNOWN |
| [hexgrad/kokoro](https://github.com/hexgrad/kokoro) | tts-voice-generation | unscored_discovery | Apache-2.0 |
| [idiap/coqui-ai-TTS](https://github.com/idiap/coqui-ai-TTS) | tts-voice-generation | unscored_discovery | MPL-2.0 |
| [index-tts/index-tts](https://github.com/index-tts/index-tts) | tts-voice-generation | unscored_discovery | UNKNOWN |
| [myshell-ai/MeloTTS](https://github.com/myshell-ai/MeloTTS) | tts-voice-generation | unscored_discovery | MIT |
| [nari-labs/dia](https://github.com/nari-labs/dia) | tts-voice-generation | unscored_discovery | Apache-2.0 |
| [neonbjb/tortoise-tts](https://github.com/neonbjb/tortoise-tts) | tts-voice-generation | unscored_discovery | Apache-2.0 |
| [NVIDIA-NeMo/Speech](https://github.com/NVIDIA-NeMo/Speech) | tts-voice-generation | unscored_discovery | Apache-2.0 |
| [OpenBMB/VoxCPM](https://github.com/OpenBMB/VoxCPM) | tts-voice-generation | unscored_discovery | Apache-2.0 |
| [OuteAI/OuteTTS](https://github.com/OuteAI/OuteTTS) | tts-voice-generation | address_unresolved | — |
| [resemble-ai/chatterbox](https://github.com/resemble-ai/chatterbox) | tts-voice-generation | unscored_discovery | MIT |
| [resemble-ai/Perth](https://github.com/resemble-ai/Perth) | tts-voice-generation | unscored_discovery | MIT |
| [SparkAudio/Spark-TTS](https://github.com/SparkAudio/Spark-TTS) | tts-voice-generation | unscored_discovery | Apache-2.0 |
| [suno-ai/bark](https://github.com/suno-ai/bark) | tts-voice-generation | unscored_discovery | MIT |
| [SWivid/F5-TTS](https://github.com/SWivid/F5-TTS) | tts-voice-generation | unscored_discovery | MIT |
| [yl4579/StyleTTS2](https://github.com/yl4579/StyleTTS2) | tts-voice-generation | unscored_discovery | MIT |
| [3b1b/manim](https://github.com/3b1b/manim) | video | unscored_discovery | MIT |
| [Aegisub/Aegisub](https://github.com/Aegisub/Aegisub) | video | unscored_discovery | — |
| [FFmpeg/FFmpeg](https://github.com/FFmpeg/FFmpeg) | video | initial_documentary_sample | GPL (inspect exact version/exceptions); LGPL (inspect exact version/exceptions) |
| [ManimCommunity/manim](https://github.com/ManimCommunity/manim) | video | initial_documentary_sample | MIT |
| [mltframework/mlt](https://github.com/mltframework/mlt) | video | unscored_discovery | LGPL (inspect exact version/exceptions) |
| [mltframework/shotcut](https://github.com/mltframework/shotcut) | video | unscored_discovery | GPL (inspect exact version/exceptions) |
| [OpenCut-app/OpenCut](https://github.com/OpenCut-app/OpenCut) | video | unscored_discovery | MIT |
| [OpenShot/openshot-qt](https://github.com/OpenShot/openshot-qt) | video | unscored_discovery | GPL (inspect exact version/exceptions) |
| [remotion-dev/remotion](https://github.com/remotion-dev/remotion) | video | unscored_discovery | LicenseRef-Remotion |
| [SubtitleEdit/subtitleedit](https://github.com/SubtitleEdit/subtitleedit) | video | unscored_discovery | MIT |
| [Zulko/moviepy](https://github.com/Zulko/moviepy) | video | initial_documentary_sample | MIT |
| [AILab-CVC/VideoCrafter](https://github.com/AILab-CVC/VideoCrafter) | video-generation | unscored_discovery | Apache-2.0 |
| [genmoai/mochi](https://github.com/genmoai/mochi) | video-generation | unscored_discovery | Apache-2.0 |
| [guoyww/AnimateDiff](https://github.com/guoyww/AnimateDiff) | video-generation | unscored_discovery | Apache-2.0 |
| [hpcaitech/Open-Sora](https://github.com/hpcaitech/Open-Sora) | video-generation | unscored_discovery | Apache-2.0 |
| [Lightricks/LTX-2](https://github.com/Lightricks/LTX-2) | video-generation | unscored_discovery | UNKNOWN |
| [Lightricks/LTX-Video](https://github.com/Lightricks/LTX-Video) | video-generation | unscored_discovery | Apache-2.0 |
| [PKU-YuanGroup/Open-Sora-Plan](https://github.com/PKU-YuanGroup/Open-Sora-Plan) | video-generation | unscored_discovery | MIT |
| [showlab/Show-1](https://github.com/showlab/Show-1) | video-generation | unscored_discovery | LicenseRef-Manual-Review |
| [Tencent-Hunyuan/HunyuanVideo](https://github.com/Tencent-Hunyuan/HunyuanVideo) | video-generation | unscored_discovery | UNKNOWN |
| [Tencent-Hunyuan/HunyuanVideo-1.5](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5) | video-generation | unscored_discovery | UNKNOWN |
| [Vchitect/Vchitect-2.0](https://github.com/Vchitect/Vchitect-2.0) | video-generation | unscored_discovery | Apache-2.0 |
| [Wan-Video/Wan2.1](https://github.com/Wan-Video/Wan2.1) | video-generation | unscored_discovery | Apache-2.0 |
| [Wan-Video/Wan2.2](https://github.com/Wan-Video/Wan2.2) | video-generation | unscored_discovery | Apache-2.0 |
| [Wan-Video/Wan2.5](https://github.com/Wan-Video/Wan2.5) | video-generation | address_unresolved | — |
| [zai-org/CogVideo](https://github.com/zai-org/CogVideo) | video-generation | unscored_discovery | Apache-2.0 |
