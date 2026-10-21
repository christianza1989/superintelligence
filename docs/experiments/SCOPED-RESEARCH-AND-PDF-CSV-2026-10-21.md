# Scoped research, PDF CSV and MCP 0.7 development checks

2026-10-21. Source baseline `d6ff14190058e321a7e51285f7388a53662b9c4f`. These are bounded development checks, not native-host acceptance, G2, an independent holdout or a measured speed/cost advantage. Earlier failed epochs remain retained separately.

| Check | Observed result | Boundary |
|---|---|---|
| Private artifact and research units | 130/130 PASS | Internal job artifacts excluded from generic read/write/replay/version/delete/search/attachment paths; user Library planning artifacts remain public |
| Research API, PostgreSQL, Graphile, controlled HTTP and inert Docker | 11/11 PASS, epoch 3 | Approved source registry, immutable snapshot, separate raw/rendered hashes and current-grant reads; no original-page navigation/JavaScript/fidelity claim |
| PDF CSV units | 37/37 PASS | Cell strings, quotes/newlines/Unicode, CSV/page byte limits, hashes, provenance and cursors |
| Integrated PDF/browser API, PostgreSQL, Graphile and pinned Docker | 19/19 PASS | Raw/paged CSV, immutable receipts, source/receipt/CSV hashes, isolation and revocation during both receipt reads |
| Combined MCP/client/transport/PDF/profile regression | 162/162 PASS, eight files | Existing CSV, three default discovery tools, research and PDF CSV wire boundaries; overlaps the projection tests above |
| Runtime messaging profile regression | 47/47 PASS | Actual barrel aliases, unsupported constructors/use, 17 configured credential checks and excluded packages; no sealed runtime qualification yet |
| Types | PASS | Research/security: adapter-kit, core, adapters, API, worker; PDF: adapters/API; integrated MCP: adapters; runtime: canonical adapters program extended with aliases |
| Standalone MCP 0.7 package | PASS | Portable/compatibility STDIO, loopback HTTP fixture, 3 default / 22 opt-in tools, research submit, PDF CSV read, binding reread/restart/revoke and invalid/exported/linked binding rejection |

Do not sum these as unique tests. Process fixtures are separate from the actual worker/API suites and native host acceptance. All checks above made zero paid Zero model dispatches; native host development usage is a separate account boundary. The original Jev cumulative cap was not reset or extended.

## Preserved failures

Research epoch 1 passed 10/11: a known private source artifact ID bypassed the scoped reader through generic artifact RPC after grant revocation. Explicit internal artifact names and nonce families now guard generic access, creation/replay/versioning, search and attachments. This is not a blanket denial of every `zero.*` user artifact.

Research epoch 2 passed 10/11: bytes were denied, but RPC returned HTTP 500. Artifact-only middleware now maps the existing isolation error to a redacted 403; unrelated failures retain their handling. Epoch 3 passed the unchanged suite, test SHA-256 `2d7a71a76d0152b656b27722072475c3ed32fb65e4d03f8aa8db73660e7d4137`.

The integrated PDF endpoint test SHA-256 remained `86aad26eeff41c70d1d5a5a12d3247015920d9189cf93e3575ad29ab50c7cfae`. Earlier worktree dependency/generated-client setup failures remain retained; existing dependencies were reused without downloads. Runtime alias-only types first lacked the normal ambient program, then the canonical program passed. Integrated MCP types first found a missing callback annotation; the corrected program passed. Skill validation initially lacked YAML, then passed using an already installed validator dependency.

## Transport and results

Source server 0.7.0 / schema 1.7.0 retains default discovery. Opt-in adds `zero_research_extract/job/artifact/cancel` and `zero_pdf_csv`. Research accepts an approved task ID, not a caller URL. CSV pages derive from a currently authorized successful immutable PDF receipt and retain source/receipt/CSV hashes plus page/bbox provenance. Reassemble byte pages before UTF-8 decoding and verify the full digest.

Only pure Zod contracts enter the execution bundle; backend research, SSRF, database, worker and verifier modules are excluded. Observed package files:

| File | Bytes | SHA-256 |
|---|---:|---|
| `server/index.mjs` | 635 | `3fd506fa07f34f2c2d9fa3b59d2d6779e452dc9b72909dca6e6ffaa3b458231d` |
| `server/discovery.mjs` | 2232672 | `285fc43d891e8dbacdd8c6856a36bd7cf06e2b0cf9bb26b5a5b0669bd6f8032b` |
| `server/execution.mjs` | 2285671 | `10c4d36d2dd875142fcf038e38a6182fb41541994bb61ade7c62ad1b3651b4f7` |

This is a transport package, not the full product runtime. Native Codex/plugin acceptance remains 0.4; no native 0.7 install, tool-use or lifecycle acceptance is inherited.

## Open gates

Three earlier native packaging failures remain preserved; a new sealed package and relocated API/worker/web qualification are still required. Whole-profile G0, remaining G1, thirty-task G2, application creation/Library handoff, own-app model qualification, required locale flows and real new-user MVP1 remain open. Frozen corpus/truth/grader files were not changed to turn component checks into task outcomes.
