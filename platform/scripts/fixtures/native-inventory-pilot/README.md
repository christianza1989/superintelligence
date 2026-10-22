This directory contains grader-owned qualification reference/control solutions. Never copy it into a coding trial or supply it to a trial author. It is separate from the frozen SPEC, prompt and neutral starter.

The reference uses Node 24 built-in SQLite and no downloaded dependencies. `control.json` selects one narrow faulty behavior; every negative control starts an actual HTTP server. Controls cover permissive malformed quoting, parser bypass, import-time file writes/network connect/server listen, invalid input writes to inventory/key ledger, replay/conflict handling, lost inventory/ledger persistence, and browser commit/invalidation/HTML rendering faults.

Run qualification only when the operator grants the shared local execution slot:

```sh
PILOT_QUALIFICATION_ROOT=/explicit/evidence/root \
PILOT_PLAYWRIGHT_MODULE=/explicit/installed/playwright/index.mjs \
PILOT_REQUIRE_BROWSER=1 \
PILOT_CHROMIUM=/usr/bin/chromium \
node --test --test-concurrency=1 platform/scripts/native-inventory-pilot-grader.test.mjs
```

The evidence root must already exist. Each case retains a small fresh app copy, SQLite data, bounded server log and JSON report. Browser runs retain bounded viewport JPEG evidence. No browser, package, database service or model is downloaded or contacted. Omitting the installed Playwright path skips browser qualification and produces incomplete reference reports; it is not full acceptance. `--no-sandbox` is used for the owned headless Chromium profile and does not provide hostile candidate isolation.

Grade a real candidate with explicitly selected paths:

```sh
node platform/scripts/native-inventory-pilot-grader.mjs \
  --workspace /explicit/candidate \
  --output /explicit/evidence/outside-candidate \
  --spec /explicit/frozen/SPEC.md \
  --prompt /explicit/frozen/prompt.txt \
  --playwright-module /explicit/installed/playwright/index.mjs \
  --chromium /usr/bin/chromium
```

Optional `--d3-module`, `--d3-export` and `--d3-sha256` identify an operator-reviewed vendored module/export and expected pin. A matching file hash and observed wrapper call are reported separately; neither authenticates an arbitrary operator-declared module as d3 nor replaces Zero's separate component verification receipt. Internal calls that do not cross the observed module export can remain unknown. The parser fault probe throws in that exact wrapped export and records whether the exercised HTTP path is intercepted. The bypass control qualifies this distinction without turning missing instrumentation into a functional failure.

The grader does not edit candidate source. Its source manifest detects ordinary writes outside DATA_DIR within the candidate tree, excluding `.git`, `node_modules`, `.artifacts` and `.local`; it does not monitor every filesystem path or defend against hostile same-user code. The isolated DATA_DIR is retained after shutdown. Only the process groups created by the grader are terminated. The import worker observes selected instrumented filesystem, server-listen, socket-connect, HTTP, datagram, fetch and child-process entry points; deferred effects and uninstrumented paths remain unknown. Node permission flags with fs-read are not a no-network proof. Network access by the candidate server is not claimed to be isolated. These are development cases, not a hidden holdout, and a single pair cannot establish general benefit.

Source authoring does not establish qualification. Record the actual command, environment, case results and failures before freezing and running a pilot. No checks have been run merely because these files exist.
