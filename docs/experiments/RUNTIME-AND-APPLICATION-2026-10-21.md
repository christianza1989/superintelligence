# Relocated runtime and fixed expense application development checks

2026-10-21. These are bounded development checks, not full MVP, G0/G1/G2 or a comparative efficiency claim. No model or paid API was dispatched in these checks. Earlier failures remain in private operator evidence.

## Relocated runtime

The fourth local-only stage sealed source `d207882266306f136424ede802c07f1d82c8ce1b` with BUILD SHA-256 `1e22cc6b303c17897e02a787f401b980b5bcd7b8eb94ed2095b719dd77239b3f`. Its payload was 389,859,852 B, BUILD inventory 3,595,258 B, and combined directory 393,455,110 B. These numbers exclude Docker images, database data and the rest of the whole-profile footprint. The stage remains local-only and unsuitable for publication; the strict distribution-license gate was not relaxed.

| Relocated qualification epoch | Observed result | Repair and remaining boundary |
|---|---|---|
| 1 | FAIL before migrations/API: the separate PostgreSQL UID could not traverse the empty mounted data parent | Give only that empty parent traversal permission; retain private outer directories and PostgreSQL's private actual data directory. Capture bounded owned-container logs before cleanup |
| 2 | FAIL during canonical migrations: the Prisma child probed the actual home configuration because its minimal environment omitted HOME/XDG/TMPDIR | Give the migration child a fresh private temporary home/config/cache. Preserve the ambient-access denial and copy bounded audit evidence after child cleanup even on failure |
| 3 | FAIL after actual successful migrations: SQL locale ordering differed from JavaScript ordering for two migration names | Compare cloned inventories with the same ordering; missing, duplicate, substituted or extra migration names remain rejected |
| 4 | Seven package scenarios passed, then strict graceful-stop FAIL | Preserve the failure and record actual per-process stop outcomes before changing runtime behavior |
| 5, diagnostic | API exited with code 0; worker terminated by SIGTERM despite a requested stop, without forced cleanup | The worker and Graphile both owned signal handling. Disable Graphile's handler only in the application composition; keep the strict stop criterion |

Stage 5 sealed source `58f30262b9c9d14e2471377dce24b529a09bf7dd`, BUILD SHA-256 `a4459b4e90b80a7ea764049434b16a70714d79337c0ef236259160fe8c7f43b6`: payload 389,860,242 B, inventory 3,595,258 B, combined 393,455,500 B. Epochs 3–5 used that unchanged payload with separately pinned qualification-helper revisions. The seven successful scenarios cover sealed relocation, owned PostgreSQL 18.6, all 103 canonical migrations, actual API/worker readiness, eight shared-web GET/HEAD/hash/404 checks, authenticated private policy, and a durable Graphile CSV receipt with idempotency, content hash and zero usage rows. Those epochs remain **FAIL**, because graceful shutdown and final audits had not passed.

The focused runtime suite passes **50/50**, including actual generated-launcher environment isolation, PostgreSQL directory permissions, guarded nested Node children, bounded failure-audit retention and collation-independent strict migration inventory. A separate **30/30** host/worker regression suite and worker types pass after the narrow signal-ownership repair. One initial missing local dependency-link test setup failure is retained; the link was restored from existing installed dependencies, without installation or download. The changed worker required a new sealed payload; stage 6 below records that actual verification. Earlier packages cannot qualify the changed worker bundle.

### Stage 6: bounded package feasibility passes

Stage 6 sealed the repaired source `b5c622eb01dd5a56295ee41dd2b944c54a804358`, BUILD SHA-256 `f527c42615c024ca1aa37198ca89303bb8c4b008f7cf6e97ddd761b7d0bbaed7`. Payload is 389,860,338 B, inventory 3,595,258 B and combined directory **393,455,596 B**. Qualification epoch 6 passes **9/9 scenarios** in **37.594 s**: the seven scenarios above, actual graceful stop, and closed-package guard audits. Both API and worker exit with code 0 and no signal, forced cleanup, process error or output overflow. All owned child processes and the fixture container were stopped; private fixture data and previous failures remain retained.

Four migration/API/worker audits show zero denied module, filesystem or network operations. Observed direct-process peak RSS is 77,716 and 189,272 KiB for migration launcher/CLI, 504,216 KiB for API, and 456,380 KiB for worker. These are individual process peaks, not a simultaneous whole-profile RAM measurement. PostgreSQL apparent data is 70,299,613 B, including 33,554,432 B WAL. The controlled job records zero usage rows; model dispatch is disabled in this deterministic package qualification.

The precise result is **PASS_HOST_PACKAGE_FEASIBILITY_ONLY**. Whole-profile G0, clean-host installation, physical deduplication, complete peak RAM, full UI, native host/plugin, three-family product acceptance and distribution remain unqualified. The strict distribution-license gate remains blocked. Every earlier failed epoch is preserved.

## Fixed CSV expense application

The new profile `zero-csv-expense-application-v1`, recipe `csv-expense-viewer-v1`, creates one self-contained expense viewer from a bounded CSV seed and the existing exact d3-dsv 3.0.1 component. The workspace preserves pinned source, source lock, LICENSE and NOTICE. It contains no package installation, model call or arbitrary candidate command.

The source generator and verifier pass **14/14** focused offline checks and adapter type checking. The real pinned Docker/browser epoch 4 passes **29/29** development assertions in **5,954 ms**, with four actual pinned-parser invocations, desktop and mobile PNGs, and confirmed container absence after cleanup. It checks category/value associations, category filtering, exact source-module CRLF export, integer-cent decimal sums, atomic rejection of invalid amounts, safe cell rendering, file import, normalized visible export, overflow and opaque preview isolation.

- Runtime image: `sha256:b74bf06b473909daae82590fb427c1ee37888568f605340ee88c0f858385b6af`.
- Image input lock: `96cd2c725060ba0dfc36688ef57cd174375c74bcf4a76d72e6a4c9108ddc90c4`.
- Harness: `79ce74d7e84313aaa3df4322112d4c58d0ff243665b0bbf2367f38c339260c8a`.
- Tested workspace manifest: `fd1f31845633c3bda91fc93e642a019b097e300b0c3237e3d3fc0cb2093ce5a5`.
- Author checkout proof revision: `bff245f46cf1f29c8a7a49a8a6000d06f1391792`; integrated application sources are unchanged at `ac5fc53`.

Earlier real epochs 1–3 reached screenshot capture and failed. A known static-driver control succeeded with the same image. A bounded viewport control then succeeded without changing isolation or resource limits. The supported profile now fixes desktop 1280×720 and mobile 390×844, device scale 1, and verifies PNG dimensions against the receipt. The larger desktop geometry failure is retained; a raw framebuffer exceeding the existing per-file limit was the diagnostic hypothesis, not a directly observed kernel error. A temporary mock-geometry regression failure is also preserved, followed by 14/14 PASS.

The fixed source is reconstructed before dispatch; a caller cannot replace the application and manufacture a matching manifest. Operator configuration is snapshotted before awaiting authorization. Cancellation and deadline tests cover a never-settling authorization callback and prove no Docker dispatch. Container execution retains the existing no-network, read-only, nonroot, capability, CPU/RAM/PID/tmpfs and output limits. The preview runs in an opaque `allow-scripts` iframe.

This is a fixed recipe, **not general AI-authored application verification**. Parser instrumentation covers the fixed source-module boundary. Visible textarea export normalizes line endings; exact downloadable browser-file export is not accepted. The screenshots show the actual bounded viewport and may crop below-fold content. API/Graphile/Library/MCP application wiring is not qualified by this proof. Frozen coding task/grader files are unchanged; this is not coding-01 or G2 acceptance.

## Integrated offline coverage

The root `test:components` command now includes the research, PDF CSV, private-artifact and application regressions: **160/160 across 13 files**. The MCP execution suite passes **73/73**, including correct external-entity annotations for URL research versus local PDF work. These suites overlap earlier reports and must not be added into a unique-test total. No new native host installation or 0.7 host lifecycle acceptance is claimed.

[CI run 39660704005](https://github.com/christianza1989/superintelligence/actions/runs/39660704005) on source `58f3026` passed offline, durability and web/Library jobs. The PostgreSQL job passed 37 worker and eight API tests, then failed the process proof's outdated three-family/17-tool assertion. The proof now requires the exact current four-family/22-tool inventory and schema 1.7.0. [CI run 39662202792](https://github.com/christianza1989/superintelligence/actions/runs/39662202792) on source `b5c622e` passes all four jobs, including that actual MCP/API/Graphile process proof, Library handoff and offline-provider Jev worker. The prior failed run remains unchanged. Jev here uses an offline provider and does not spend API budget.

See [current implementation](../IMPLEMENTATION.md), [the normative roadmap](../../ROADMAP.md) and [earlier research/PDF CSV checks](SCOPED-RESEARCH-AND-PDF-CSV-2026-10-21.md). Open gates retain their checkbox state.
