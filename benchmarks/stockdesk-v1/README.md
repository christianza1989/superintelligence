# StockDesk: matched Haiku 5.5 / high experiment proposal

Status: **task and experimental design prepared; independent grader and live runner integration NOT IMPLEMENTED; no StockDesk programs generated.** This is a proposed new benchmark, not a renamed SprintDesk run or a runnable lab:cohort mode. The existing lab commands still run SprintDesk with their declared Sonnet profiles. Do not pass a StockDesk prompt to the SprintDesk grader or label that result a StockDesk PASS.

The user requested a moderately harder program and the same Haiku 5.5/high in both lanes. The objective is to find the best observed quality/time/cost tradeoff; the previous 50% cutoff does not apply to this new experiment. [The complete common user prompt](PROMPT.md) adds real CSV parsing, preview without writes, idempotent operations, transactional batch rollback, atomic warehouse transfers and concurrent stock protection to the prior persistence/UI task.

## Matched settings

- Exact model claude-haiku-5-5, effort high, official first-party Claude subscription CLI. Record the requested model and actual CLI modelUsage; no Sonnet or other fallback, no effort reduction. A synthetic error model is a failure, not model attestation.
- The same standard Claude CLI system prompt mode, safe mode, permissions, no custom skills/MCP/subagents, and tools Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch in every lane. Record the complete effective arguments and CLI version. System prompt/cache byte identity across sessions cannot be independently attested by this harness and must remain a limitation.
- Byte-identical user task and common rules, fresh workspaces, same Node/Docker/browser/runtime limits. A 20-minute coding deadline and 100 observed tool-action stop threshold apply equally, subject to adapter implementation and regression before any live run. The old 15-minute/60-action adapter must not silently be used for this new contract. Tool-action stops are observational, not pre-dispatch authorization.
- Same vetted source candidate pool, pinned revisions, licenses and content hashes. No StockDesk implementation, grader fixture, generated code or previous lane's output in the source pack. Both lanes can independently consult public sources under the same network policy. Candidate setup/copy/build/verification time and all Jev work must be recorded and charged to the appropriate workflow.

## Staged comparisons

A is plain Haiku from an empty application workspace. B is Haiku plus a deterministic, operator-selected Zero source pack. C is Haiku plus a Zero source pack selected by Jev from the SAME eligible source pool as B. Jev may only select source material; it cannot change the model, effort, tools, instructions, permissions, acceptance rules or limits. Use the same context format and byte budget for B/C, and preregister the deterministic B policy and Jev threshold before dispatch.

1. Screen A versus C in one fresh pair to test the complete Zero-assisted system. Preserve both results regardless of outcome. Do not claim an isolated Jev contribution from this comparison.
2. Screen B versus C in a separate fresh pair to measure the marginal effect of Jev selection over a deterministic pack. A positive A/C result alone cannot establish that Jev helped. C can also tie or lose to B; preserve that outcome.
3. Confirm an eligible assisted configuration versus A in three NEW pairs in alternating order AB / BA / AB. Do not pool screening into confirmation. A separate three-pair B/C confirmation is required before claiming a repeatable Jev-specific benefit.

Every cohort freezes its task, profiles, source pack, preparer, grader and browser digests before the first generation. Do not edit them between its trials; preserve failures. Changed code needs a new cohort, never retroactive relabeling. Stop on shared auth/model/quota/network/protocol failure; no automatic retry or fallback. A later manual connectivity probe is separate evidence with its own receipt and cost.

## Quality gates required before generation

Implement and regression-test a StockDesk-specific independent grader first. It must verify API and real SQLite persistence plus the requested UI workflows; the SprintDesk grader is insufficient. Keep evaluator source and fixtures outside the coding workspaces.

API/data gates: product normalization and bounds; combined filters and low-stock threshold; nonzero integer deltas; exact response/status contracts; malformed bodies without mutation; repeated identical operations without extra entries; conflicting references and operation types; conservation of stock; insufficient-stock rollback; concurrent withdrawal/transfer/commit without overspending; real SQLite product and movement rows; all product, stock, history and reference state after app restart.

CSV gates: BOM/LF/CRLF, quoted commas, escaped quotes and quoted newlines; malformed quote/header/field-count rejection; complete row reports; preview never writes or reserves references; ordering against virtual stock; duplicate references inside a file and across files; conflicting references; all-or-nothing failed batch; stale preview revalidation after a competing adjustment; identical reimport; filter-independent escaped export; text containing HTML remains text. Freeze unshared fixture values before coding and retain their digest.

Desktop/mobile browser gates: actual keyboard product creation, receipt and transfer; CSV preview followed by commit and duplicate replay; field-specific errors; search and low-stock filtering; CSV download contents; reload persistence; safe rendering of HTML-like input; layout and JavaScript/console/external-request checks; screenshots at 1440x900 and 390x844. Use non-overflowing accessible region layouts. Do not replace these flows with checks that the buttons merely exist.

Negative controls must demonstrate rejection of at least a broken quoted-CSV parser, mutating preview, partial batch commit, duplicate application, non-atomic transfer/overspending, lost SQLite data and a UI which does not call the API. Controls may be synthetic and must be labeled as grader regression, not model-generated quality evidence. Fix grader bugs between cohorts and retain original failed results.

After hard gates, review generated source and screenshots using the same rubric in blinded lane order: working coverage of the full brief, clear data/transaction boundaries, safe rendering/validation, meaningful checks, maintainable structure, keyboard and mobile usability. Record concrete findings; do not infer quality from line count, framework choice or test count. A PASS does not prove exhaustive security, design quality, power-loss durability or production readiness.

## Measurement and selection

Record generation, independent grading, preparation and complete workflow time separately, including candidate preparation once per cohort. Report every trial, totals and medians; retain clock discontinuities and provider cache/service-load limitations. Also show coding-plus-preparation separately so a cheaper grader run cannot be presented as model acceleration. Report failures and any later repair attempts as part of their distinct declared experiment, not removed attempts.

Record raw non-cache input, cache creation, cache read, normalized input, output, total tokens and the CLI API-equivalent estimate. Normalize input by adding the three input categories once; do not double-count cached input. The CLI estimate is not the subscription invoice. Actual subscription cost remains null. Jev API actual usage/cost is separate; all new Jev requests share the pre-existing USD 1 ledger and remaining reservation. Never reset the ledger or send paid calls just to produce a favorable example.

First compare accepted complete applications; a failed application cannot win on time or price. No arbitrary 50% claim is needed. Report all observed quality/time/estimate tradeoffs and configurations which are no worse on the measured dimensions and better on at least one, including uncertainty. Three repetitions of StockDesk still establish only one-task evidence. A later independent task is required for broader claims.

## Current availability evidence

The official [Haiku 5.5 model documentation](https://platform.claude.com/docs/en/models/haiku-5-5/overview) documents the exact model ID and effort support. The local [one-turn probe](../../catalog/haiku-connectivity-2026-10-17.json) failed with a CLI server_error and synthetic error message model, with zero reported tokens. It is not an application race, not proof of confirmed subscription model access, and not a speed/cost result. No Jev call or StockDesk coding run was made. Raw diagnostics remain in ignored private storage.
