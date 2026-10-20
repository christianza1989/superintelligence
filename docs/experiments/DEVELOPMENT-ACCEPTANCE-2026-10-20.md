# Frozen 30-task development acceptance plan

2026-10-20. This is a visible **development** corpus and an execution plan. No task in this new corpus has been executed. It is not an independent holdout, a G2 PASS, a model evaluation or an additional benefit claim.

[The frozen manifest](DEVELOPMENT-ACCEPTANCE-2026-10-20.json) contains every prompt, input digest, separately authored expected result, prompt/truth digest and source pin. Its SHA-256 is `c1fe342487813cc83a6e4f285777ad46b1cb901eaa0122d750607e23c1d58627`. The [initial result rows](DEVELOPMENT-ACCEPTANCE-2026-10-20-NOT-RUN.json) retain all thirty tasks, with no attempts or inherited acceptance results.

| Domain | Tasks | Current result | Required outcome |
| --- | --- | --- | --- |
| PDF | Ten new purchase, receipt, hours, credit, stock, meter, delivery, payment, quality and seating documents | 0/10; NOT_RUN | Every original cell, numeric text, dimensions, exact input SHA, page and independently authored table/cell bounds |
| Browser/research | Ten synthetic URL research briefs: hours, meeting, collection, deadline, fare, access, pickup, cancellation, repair and lecture | 0/10; BLOCKED | Actual allowlisted URL navigation, semantic fact, source URL/content SHA registry and screenshot |
| Coding | Ten useful application briefs: expenses, inventory, bookings, invoice allocation, quotes, tasks, logs, conversion, meals and contact import | 0/10; BLOCKED | Actual pinned component reuse, source artifact, isolated build, independent functional checks, running preview and workspace handoff |

The PDF documents reuse only the deterministic PDF renderer. Their task content and expected cells are new and authored in separate source files; expected truth does not come from parser output. The content grader checks all cells and table/cell geometry in top-left PDF coordinates with 0.01-point tolerance, including page provenance. Its PASS alone cannot establish an API, worker or product outcome. The earlier ten PDF fixtures and browser cohorts remain unchanged.

Browser URLs use synthetic `https://acceptance.invalid/` routes with per-route HTML digests. These are research tasks requiring real browser navigation to the declared URL route; they do not assert external internet research or facts about real organizations. Current durable browser extraction accepts immutable HTML file IDs and cannot satisfy URL navigation/source-registry requirements. Keeping those ten rows blocked prevents inert HTML extraction from being promoted to research success.

The current scoped backend has no general application-creation operation. A prepared CSV component or a host editing an application does not establish these ten jobs' actual reuse, build, preview and verified handoff. Coding component selection, exact source/license pins and validators must be qualified before execution; absent pins are a blocker. No model is selected or authorized for this frozen profile; the paid API cap is zero. P2.9's fixed-model execution remains NOT_RUN.

The runner plan uses the existing authenticated API, owned immutable input artifacts, PostgreSQL and Graphile worker. Each execution must create a distinct immutable attempt directory containing the source and grader pins, transport/receipt hashes, job events, timing, resource/accounting evidence and result. Failures, blocked, cancelled, partial, unknown and exhausted-budget outcomes stay in the denominator. A changed prompt, input, grader, runtime or task capability requires a new cohort/epoch; earlier artifacts remain retained.

G2 still requires at least 24/30 and 7/10 in each domain, plus dedicated permissions, cancellation, restart and budget controls passing completely with no forbidden side effect. Those four controls start NOT_RUN and cannot inherit prior fixture or integration PASS. The eleven plan/grader integrity checks pass; these checks deliberately do not count as task outcomes.

The initial private freeze was made from the older scoped branch and retained without execution. A second private freeze followed integration of the tested grant-revocation source; this public manifest records that second freeze. The frozen manifest's `sourceBaseHead` identifies the base before the new acceptance files were committed; per-file source pins identify the exact planned sources.

Recreate a fresh local freeze and verify it with:

```bash
node platform/scripts/zero-development-acceptance.mjs freeze NEW_DIRECTORY
node platform/scripts/zero-development-acceptance.mjs verify NEW_DIRECTORY
node platform/scripts/zero-development-acceptance.mjs plan NEW_DIRECTORY
node --test platform/scripts/zero-development-acceptance.test.mjs
```

Freeze refuses an existing directory. Verify checks manifest, prompt, input, expected-output and current source hashes; it does not rewrite failed or changed bytes. A fresh freeze from a later source head has a distinct manifest digest.

The existing `zero-browser-research.ts` already provides bounded BrowserProvider/tool calls, repeated authorization, URL/content source records, screenshots and cleanup. Its fixed task enum and fixture-only routing currently exclude these new tasks. The bounded next step is a trusted operator URL/task registry passed to that driver through the existing job service, preserving exact destination grants, request/resource/time caps, cancellation and receipt ownership. That seam must be qualified with real API/worker tests; it needs no second browser runtime or scheduler.
