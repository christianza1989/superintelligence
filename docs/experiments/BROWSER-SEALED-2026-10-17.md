# Sealed browser shell preparation and interrupted qualification

2026-10-17. The revised sealed synthetic-fixture driver passed its complete second qualification epoch. This is not a user-facing browser module, G2 result or MVP acceptance.

## Frozen candidate

- Linux amd64; Playwright 1.63.0; Chromium headless shell 153.0.8010.12, revision 1243; Node 24.22.0.
- Image: `sha256:24b0beed3d8a4f70d3daeae8c27c4bb4efe32526abada6ebb210b7bd6996eb63`, 865,014,333 bytes.
- Build-input lock SHA-256: `f322503f060b6c1539863cdd759e9f8f89853055699e1052483113daa46a636d`.
- Browser archive: 119,809,080 bytes; SHA-256 `a9da028861a0cf789ff25c2fed45f5f1aaf969ed9247835b6a7821a4f7af9d1d`.
- Finite preparation caps: downloads 400 MiB, extracted browser 400 MiB, final image 900 MiB. The reviewed archive contained 287 files; the initial 256-file preparation guard rejected it. That failed preparation is preserved separately; the next preparation used a 512-file guard without increasing byte caps.
- Runtime limits: 2 CPUs, 512 MiB memory with equal memory/swap ceiling, 128 PIDs, read-only root, nonroot user, no network, 128 MiB tmpfs, 15-second wall limit, 4 MiB combined process output. Browser assertions and synthetic input sources are unchanged.

The preparation script records exact image layers, downloaded Debian packages and hashes, bundled source/dependency hashes, notices, runtime closure and extracted-browser inventory. It retains cold preparation inputs and failures. Its apparent preparation totals overlap image layers and omit build cache/storage-driver overhead; peak preparation footprint is **not measured**.

## Evidence by epoch

The prior native Chromium 155 development epoch remains separate: 38/38 checks, including ten frozen synthetic tasks. It does not qualify this sealed 153 image.

Sealed epoch 1 froze the runner, harness, task/source files and image/input lock before dispatch. Four tasks were attempted: article-fact, table-total, offer-comparison and primary-citation. All returned unknown after the 15-second boundary or initially unconfirmed cleanup. The remaining batch was deliberately stopped (exit 143); no complete JSON test result exists. Original receipts and execution logs remain retained. Later checks found no surviving named browser container. These outcomes are failures, not discarded warm-up runs.

Separate finite diagnostics retained the same image and resource caps:

1. Node version returned 24.22.0; a direct sealed article invocation reached its 15-second deadline without output.
2. A trusted diagnostic entrypoint measured library imports and a real Chromium launch/connect/close. It reported Chromium 153.0.8010.12, closed in 3.9 seconds inside the container, and completed in 5.6 seconds overall.
3. A stdin-only control received 25 bytes and EOF in 7 ms. An instrumented import of the unchanged sealed entrypoint produced an article PASS, actual provider navigate count 1, matching DOM assertion, PNG/trace evidence, normal task exit at 3.5 seconds, and confirmed named-container absence in 4.3 seconds overall.

The diagnostics isolate stdin EOF, module bootstrap, browser startup and task exit. They do not replace the incomplete frozen ten-task qualification. Intermittent host launch failures, memory pressure and WSL latency were observed nearby; a causal attribution is **not established**.

## Complete sealed epoch 2

Candidate revision `b012d5c` was frozen before dispatch. Its only runner change was explicit named-container absence verification after bounded removal, preserving normal container-exited state. Three offline controls cover remove-success with a surviving listed container, daemon-query failure and affirmative absence. Resource probe mechanics respect the existing 4 MiB per-file limit and avoid file-descriptor exhaustion preempting the PID check; expected resource quotas and outcomes were unchanged. Image, input lock, ten tasks, DOM grader and 15-second runtime boundary were unchanged. No code or grader changed inside this epoch.

**35/35 checks passed in 96.13 seconds**, including ten frozen tasks with actual component invocation, matching DOM assertions, separate screenshot and trace hashes, five negative controls, image/input binding, cancellation, authorization revocation and cleanup. The early two good task checks took 12.3 and 12.6 seconds including post-run cleanup; the later checks took about 2.5 seconds. No performance cause or broad latency claim is inferred.

Actual resource controls observed nonroot UID 1000, read-only-root EROFS, no-network ENETUNREACH/EHOSTUNREACH, cgroup memory 536,870,912 bytes, PID ceiling 128 and CPU quota 2; 128 MiB tmpfs exhaustion returned ENOSPC, over-limit allocation exited 137, PID exhaustion returned EAGAIN, and a deliberately persistent child was killed at its finite wall deadline. The resource probes confirmed named-container absence after cleanup. Revoked or cancelled runs published no research artifacts.

The [public bounded proof summary](BROWSER-SEALED-2026-10-17.json) records source/input hashes, per-task component/assertion evidence, artifact hashes and resource observations. Full original epoch logs, PNGs, traces, frozen inputs and failures are retained privately. The earlier four unknown outcomes remain unchanged and visible above.

## Current checks and boundaries

Eleven deterministic offline runner boundary checks and the adapters TypeScript check passed. The sealed qualification harness contains ten frozen task checks, five negative controls, image/input binding, cgroup/isolation, actual memory/PID/tmpfs/wall enforcement, cancellation and grant-revocation cases. Its complete second real suite passed for this exact synthetic fixture profile.

No paid model API was called. No independent holdout, general research quality, lifetime artifact admission, complete application/worker composition or hostile-code security acceptance is claimed.
