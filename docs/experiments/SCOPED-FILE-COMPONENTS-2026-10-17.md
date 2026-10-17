# Scoped file components: bounded development proof

2026-10-17. These results qualify the stated development paths, not G2, independent holdout, repeated benefit, or the complete MVP.

PDF and browser jobs now use the existing authenticated API, PostgreSQL artifacts and Graphile worker. Each submit accepts only `fileId`, `idempotencyKey` and `deadline`. Current operator grants allow at most ten relative file paths with expected SHA-256 values. The snapshotter copies one bounded file into private staging before an owned immutable input artifact is persisted. Worker dispatch reads that artifact, never a caller path or a live project file.

Metadata ownership, file ID, SHA, current membership, grant and profile are checked before private input reads. Dispatch and successful publication recheck finite database time, deadline, expiry and cancellation. The request-row lock selects one terminal receipt. CSV names and nonces remain compatible; CSV, PDF and browser share four outstanding jobs per scope. Artifact transport returns hash-checked JSON in pages of at most 16 KiB.

| Proof | Result |
| --- | --- |
| Existing PDF driver, canonical LF bundle, frozen synthetic fixtures and independent grader | 10/10 PASS; 56 numeric cells with page/bbox provenance |
| Owned-input filesystem controls | 5/5 PASS: PDF/HTML capture and owned load, changed SHA, symlink and foreign metadata denial |
| Real authenticated API + PostgreSQL + Graphile + actual PDF/browser Docker drivers | 9/9 PASS |

The nine integration controls cover real-session and foreign-scope/origin denial, actual PDF and arbitrary allowlisted HTML extraction, idempotency, bounded artifact pages, prohibited caller arguments, cancellation before worker reconnect, file-grant revocation before private request reads, immutable PDF input after a host edit, grant revocation after successful storage, and the quota shared with CSV. They dispatch no model calls.

The initial integration attempt passed two controls and failed seven submit-dependent controls before dispatch. A distinct diagnostic found that the new capture consumer omitted the snapshotter's `files/` directory. The consumer was corrected without relaxing permissions, authorization or limits; the full nine controls then passed. A separate diagnostic used a stale ephemeral test port and failed before suite setup. Private original reports and logs remain retained.

The PDF image is `sha256:d016f2d236645626f243ca8fbf31778b1206f00af3d6e0661c33f2831db83f98` (310,032,256 bytes). The browser used in the API proof is a separately built inert-view candidate; its image/cohort qualification and earlier failures are recorded separately. Its screenshots show a declared inert rendering, not original-page visual fidelity. Raw input and rendered hashes remain distinct; original lexical links are returned as data.

Immutable inputs and receipts remain retained for operator-managed retention. Four bounded transient snapshot slots limit simultaneous capture; crash orphans require explicit operator recovery. This proof adds no automatic TTL, public upload, host-file freshness assertion, or generalized browser execution permission.
