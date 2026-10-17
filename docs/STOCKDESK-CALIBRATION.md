# StockDesk: Haiku 5.5 / high calibration

The first exploratory A/C pair completed with **both generated applications passing the declared independent API, SQLite restart and desktop/mobile workflow checks**. No general winner or repeatable Jev benefit is established. All lanes request the same Haiku 5.5/high, standard system prompt mode and eight tools. The [task](../benchmarks/stockdesk-v1/PROMPT.md), [protocol](../benchmarks/stockdesk-v1/README.md), [measurements](../catalog/stockdesk-results-2026-10-17.json), [harness checks](../catalog/stockdesk-checks-2026-10-17.json) and [post-race review](../catalog/stockdesk-review-2026-10-17.json) are separate records.

## First pair: preserved CLI 2.1.292 exploration

Cohort `2026-10-17T07-28-05-298Z-eb61d99afd31`, source `f7ba950b91f73ece2c93178ef8f649a1fb42b71e`, order A then C. Task and all runner/grader hashes stayed fixed. Both CLI model receipts identify `claude-haiku-5-5`; these are not independent provider attestations. The old official CLI was version 2.1.292. All API, persistence, browser and cleanup gates passed.

| Measurement | A: plain Haiku | C: Jev-selected Zero context |
|---|---:|---:|
| Coding | 513667 ms | 452845 ms |
| Independent grading | 37026 ms | 34131 ms |
| Trial | 550733 ms | 487012 ms |
| Workflow including full preparation | 550733 ms | 491445 ms |
| Total tokens | 2760007 | 2040988 |
| Normalized input | 2634246 | 1935097 |
| Cache read | 2496076 | 1818828 |
| Cache creation | 138126 | 116231 |
| Non-cache input | 44 | 38 |
| Output | 125761 | 105891 |
| CLI API-equivalent receipt, unvalidated old-client pricing | 4.1196192 USD | 3.4115856 USD |
| Actual subscription charge | unknown | unknown |
| Jev source-selection API cost | 0 | 0.00015414 USD |

Observed coding reduction 11.84%, workflow reduction including preparation 10.77%, total-token reduction 26.05%. These are observations from one pair, not a causal or repeated improvement claim. Provider cache and service load are uncontrolled. Cache categories are counted once inside normalized input; total-token change is not an equally weighted cost change.

Jev selected no source at the preregistered 0.7 threshold: generic Hono HTTP foundation 0.18; sqlite-utils metadata 0.11; SQLite source metadata 0.09; sqlitebrowser metadata 0.05. C received the empty selection context and **no library assets**. All preparation (4433 ms, including verification of the candidate library) and the real Jev cost are charged to C. The deterministic B pack contains the verified HTTP foundation but did not participate in this pair. This limited source pool has no prepared CSV parser or inventory foundation, so having a Git catalog alone did not supply a task-specific solution.

## Quality evidence and limits

The API grader has twelve subtests and their parent, thirteen TAP tests in total. It exercises CSV quoted fields/newlines and malformed syntax, preview without writes, exact repeated operations, conflicting references, full failed-batch rollback, stale preview, concurrent withdrawal/transfer/import, filtering and escaped export. Persistence checks real product and seeded movement rows plus replayable references after an app-container restart. Browser flows exercise keyboard product creation, adjustments/transfers, CSV preview/commit/replay, error feedback, filters/export, text rendering, reload, overflow and runtime errors at two viewports. This is the declared sampled contract, not exhaustive product or security quality.

Four screenshots were reviewed in randomized sample order before lane labels were revealed. Both desktop views have clear labels and form groupings. A's mobile SKU and Name columns collapse into character-by-character wrapping and very tall rows. C's mobile table shows only some columns in the captured view; usability of its internal scrolling needs further interaction review. Neither has proven high subjective design quality. The page-overflow gate alone does not measure table readability.

Targeted source inspection found loopback binding, explicit SQLite transaction boundaries and DOM textContent in both. This was an unblinded limited review, not a complete security audit. Both model-authored npm test commands were also replayed successfully in bounded, network-none Docker containers after the race; their TAP counts were unavailable and remain null. Those replays do not create new generations or change the original timing.

The harness's positive fixture and seven deliberate faults passed their expected checks before app generation. An early prototype selected the legacy restart probe; it was corrected and regressed before either app was generated, with the original failure retained privately. Regression counts overlap and must not be summed as distinct tests on each generated program.

## Supported CLI for subsequent cohorts

The [official Claude Code changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) added Haiku 5.5 recognition in 2.1.293. The older 2.1.292 client's dollar receipt is retained but unvalidated; no reliable Haiku tariff saving or subscription charge is inferred from it. The [official pricing](https://platform.claude.com/docs/en/about-claude/pricing) also prices Haiku requests differently above 100,000 input tokens, so exact retrospective tariff calculation requires per-request information absent from these aggregates.

CLI 2.1.301 is now installed between cohorts. Subsequent races pin its versioned executable and SHA256, validate it before every lane and block another CLI version. New runner source hashes require a fresh Jev preparation using the same original USD 1 ledger. B/C screening and any fresh three-pair confirmation stay separate from the older exploratory pair. The user task and acceptance rules remain unchanged; no fixed 50% target is used.
