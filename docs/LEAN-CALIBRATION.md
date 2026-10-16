# Lean CLI calibration protocol

This is an experimental RepositoryZero CLI execution configuration, not evidence that the full product runtime or Jev is faster. The operator authorized unlimited Sonnet calibration; Jev retains its separate USD 1 total ceiling. The fixed model remains `claude-sonnet-5-5` and first-party Claude subscription auth.

Freeze this protocol before screening. Run `lean-high`, `lean-medium`, and `lean-low`, in that order, with one fresh pair each. Each compares the unchanged `claude-fixed-v1` high-effort baseline against a named candidate. Candidates replace the default CLI system prompt with the fixed prompt in `zero-lab-strategies.mjs`, expose only Bash/Read/Write/Edit, and omit catalog context. The user task, common safety instructions, runtime limits and independent quality checks are identical. Different efforts compare the complete configured system; they cannot establish the causal benefit of Jev or source reuse.

```bash
npm run lab:cohort -- --mode lean-high --pairs 1 --live
npm run lab:cohort -- --mode lean-medium --pairs 1 --live
npm run lab:cohort -- --mode lean-low --pairs 1 --live
```

Keep every planned attempt, including failures. Do not tune a prompt or grader within a cohort. A candidate is eligible only when both screening programs pass every declared API, SQLite, desktop/mobile keyboard and cleanup check, with intact sources and clocks. Among eligible candidates, choose the lowest reported CLI API-equivalent estimate; use total trial time as a tie breaker. Also report the fastest eligible candidate if it differs. These estimates do not measure subscription charges. Unknown prices and missing usage remain null.

Repeat the selected candidate in a separate three-pair alternating cohort. Do not pool the selected screening pair with confirmation. A 50% target requires all six confirmation programs to pass and at least 50% lower summed workflow time or summed API-equivalent estimate. This is a one-task calibration result; other tasks and independent holdouts are necessary before a general product claim. Report coding, grading, total trial, cache reads/creation, uncached input and output separately.

Host sleep or clock discontinuity invalidates timing comparisons. The runner records wall and monotonic time and rejects discrepancies above five seconds. Never turn a quickly failed application into a speed victory. Official CLI usage and requested effort are local receipts, not an independent provider or billing attestation.

After confirmation, any combination with pinned Git libraries or Jev must use a separate named profile and new frozen cohort. Its complete preparation time and Jev expense must be charged once to that cohort. Do not describe an operator-selected library as a Jev decision.
