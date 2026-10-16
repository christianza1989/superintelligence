# Pirmas porinis bandymas: SprintDesk

**Claude prenumeratos v2 pora atlikta: abu variantai PASS deklaruotam automatiniam kontraktui.** [Vienodas užduoties tekstas](PROMPT.md) ir nepriklausomas [API acceptance](acceptance.mjs) užfiksuoti prieš generavimą. Tai15minučių lokali Kanban programa su tikru SQLite, paieška, validacija, JSON export ir mobile UI, ne pilna verslo apskaita.

Aktyvus porinis variantas: abi naujos oficialaus Claude CLI sesijos naudoja `claude-sonnet-5-5`, effort `high`, naudotojo prenumeratą ir vienodą tuščią pradžią. [PROMPT.v2.md](PROMPT.v2.md) paaiškina tikslius headings, originalus promptas išsaugotas. RepositoryZero pusė papildomai gauna savo katalogo retrieval/reuse kontekstą; tai aiškiai pažymėtas eksperimentinis CLI adapterio profilis, ne viso web produkto acceptance. Antras variantas pridės Jev atranką; vėlesnis — Auto model, kai turėsime realiai leidžiamų modelių sąrašą.

Abiejų sesijų teisės, tinklas, laiko cap, pradinis toolchain ir galimybė naudoti open source vienodi. Pirminis promptas nekeičiamas; RepositoryZero sistemos kontekstas išsaugomas atskirai ir jo paruošimo laikas įskaičiuojamas. Tikrintojo failai nepatenka į redaguojamą workspace. Vienas bendras Git checkout ar iš anksto antros pusės perskaitytas pirmos rezultatas netinka.

API kontraktas tikrinamas `BENCHMARK_ORIGIN=http://127.0.0.1:<port> node --test acceptance.mjs`. Atskiras Zero Lab evaluator jau tikrina app konteinerio restart, tikrą SQLite row ir eksportą. Ribotas desktop/mobile/keyboard UI grader taip pat patikrintas kontroliuojamu fixture; bendras pipeline PASS. Abi modelių sesijos gaus tą patį PROMPT.md aprašytą accessible UI kontraktą. Tikri modelių artefaktai dar NOT_RUN. Šis API failas pats restart/UI patikros neatlieka. Artefakto kodas vykdomas atskirame secretless izoliuotame profilyje. Tik žinomas kontroliuojamas tikrintuvas siunčia loopback HTTP užklausas.

Registruojami tikri CLI usage event input/output/cache tokenai, elapsed laikas, exit ir testai; trūkstanti metrika lieka unavailable. Prenumeratos OAuth nėra nulinė API kaina. Vienas atvejis neįrodo bendro laimėjimo.

Pirmas vykdymo profilis turi bendrą prebuilt Node24 runtime apribojimą abiem pusėms: be deklaruotų external npm dependencies, subundlintas kodas su notices leidžiamas. [Vietinio runnerio instrukcijos](../../docs/LOCAL-LAB.md). [Viena patikrinta Claude pora ir jos ribos](../../docs/CLAUDE-CALIBRATION.md). Codex auth, OpenRouter/Jev ir Auto lenktynės dar atskiri, dabar atidėti profiliai.
