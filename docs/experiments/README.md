# Istorinių eksperimentų ataskaitos

Naujausia [tikslinė Zero ASR kvalifikacija](WHISPER-MODULE-QUALIFICATION-2026-10-22.md): source ir atskirai sugeneruotas 0.12.3 / schema 1.13.3 paketas su nepakeistais v9 atrankos argumentais per 13.632 s gavo tikrą Jev rekomendaciją `ggml-org/whisper.cpp`, `include/whisper.h`. Vienas Jev kvietimas: 6 304 input auditui, 51 output, 0.000264768 USD; 149 offline, tipai bei Linux/Windows paketo patikros PASS. Tai atskira source modulio kontrolė: native įdiegtas paketas lieka 0.12.2, komponento įdiegimas, ASR vykdymas ir nauda netikrinti; naujų A/B ar native pokalbių nebuvo.

Naujausia natūrali native [StudioDesk 0.12.2 pakartota planų pora](NATIVE-STUDIODESK-MODULE-REPEAT-2026-10-22.md): A 82.184 s / 204 441 host tokenas, B 139.420 s / 559 717. GitHub paieška iš 21 atitikties pateikė tris pinned repo, bet modulio API vieneto nepateikė; Jev nebuvo kviestas, todėl tai nėra Jev atmetimas. Modulių atranka, kodo kokybė ir kūrimo nauda šia planų pora nepatvirtintos.

Atskira [konkretaus modulio planavimo kvalifikacija](GITHUB-MODULE-RETRIEVAL-2026-10-22.md#gyvas-0122-modulio-pasirinkimas) turi teigiamą MLT ir tikro Jev kontrolę; ji atskiria source pasiūlymą, įdiegimą ir native palyginimo naudą.

Istorinė diagnozė: [StudioDesk planavimo sąnaudos ir konkrečių modulių atrankos spragos](STUDIODESK-PLANNING-DIAGNOSIS-2026-10-22.md). Tai diagnozė, ne naujas gyvas bandymas ar įgyvendinta pataisa.

Šios ataskaitos išsaugo konkrečias modelio/CLI/prompt/grader epochas ir nesėkmes. Jos nėra nurodymas tęsti seną „aktyvią“ kohortą. Aktualus [kalibravimo metodas](../CALIBRATION.md), [produkto būsena](../IMPLEMENTATION.md).

- [Frozen thirty-task development acceptance plan, all outcomes NOT_RUN/BLOCKED](DEVELOPMENT-ACCEPTANCE-2026-10-20.md).
- [Native Codex value pilot preparation and preserved preflight failures](NATIVE-VALUE-PILOT-2026-10-22.md).
- [Jev-selected source modules and full scoped development-chain controls](REUSE-MODULE-CHAIN-2026-10-22.md).
- [RepairDesk native plan comparisons, preserved deadline failure and repaired live GitHub/Jev repeat](NATIVE-REPAIRDESK-PLANS-2026-10-22.md).
- [Targeted Zero-only ASR 0.12.3 qualification: actual Jev selected a pinned canonical Whisper header; no native upgrade, integration or runtime claim](WHISPER-MODULE-QUALIFICATION-2026-10-22.md).
- [StudioDesk 0.12.2 repeated native plan pair: three pinned repositories, no inspected API unit, no Jev dispatch; preserved invalid attempts](NATIVE-STUDIODESK-MODULE-REPEAT-2026-10-22.md).
- [Historical StudioDesk 0.11.1 native plan pair: preserved retrieval failure and no Jev dispatch](NATIVE-STUDIODESK-MODULE-PLANS-2026-10-22.md).
- [Historical StudioDesk 0.10.5 native plan pair: real GitHub/Jev/pinned file reads, full cost comparison and preserved earlier failures](NATIVE-STUDIODESK-PLANS-2026-10-22.md).
- [Scoped research, PDF CSV and MCP 0.7 development checks](SCOPED-RESEARCH-AND-PDF-CSV-2026-10-21.md).
- [Captured original-URL document profile and preserved Chromium limit failure](URL-DOCUMENT-PROFILE-2026-10-21.md).
- [Relocated runtime failures, repairs and fixed expense application checks](RUNTIME-AND-APPLICATION-2026-10-21.md).
- [MCP discovery preview ir native Codex ryšys](MCP-PREVIEW-2026-10-17.md).
- [Pirmas gyvas Jev worker profilis](JEV-WORKER-2026-10-17.md).
- [50 scenarijų patvarumo kvalifikacija](DURABILITY-2026-10-17.md).
- [Quiesced vietinio profilio DB ir artefaktų atkūrimas](NATIVE-BACKUP-2026-10-17.md).
- [Izoliuotas naršyklės profilis ir išsaugotos nesėkmės](BROWSER-SEALED-2026-10-17.md).
- [LT/EN poreikių paieškos kūrimo rinkinys](NEED-RETRIEVAL-2026-10-17.md).
- [Claude / Sonnet / SprintDesk](CLAUDE-CALIBRATION.md).
- [Lean konfigūracija](LEAN-CALIBRATION.md).
- [Haiku / StockDesk](STOCKDESK-CALIBRATION.md).

Metodikos dokumentai ir benchmark fixture originalai nekeičiami kohortos viduje. V1 grader klaidos lieka ataskaitoje; v2 kontrolė yra nauja epocha. Masininių JSON rezultatų ir originalių source hash neperrašyti dėl dokumentų pervadinimo.
