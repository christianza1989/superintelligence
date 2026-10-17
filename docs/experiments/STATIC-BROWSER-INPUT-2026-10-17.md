# Static operator-input browser: separate development candidate

2026-10-17. This is a separate candidate and cohort from the frozen browser research image. It qualifies bounded arbitrary operator-allowlisted HTML input, not original-page fidelity, an independent holdout, G2, or the complete MVP.

The API accepts only an operator `fileId`, idempotency key and deadline. The owned immutable input is at most 16 KiB; its original SHA-256 remains in the request and receipt. The worker uses the existing current-principal, grant, membership, cancellation, deadline and terminal-publication guards. See [the backend proof](SCOPED-FILE-COMPONENTS-2026-10-17.md).

The separately built image parses HTML with the already pinned JSDOM without script execution or a resource loader. The declared `inert-static-v1` rendering removes `script`, `link`, `img`, `source`, `track`, `iframe`, `frame`, `embed`, `base` and HTTP-equivalent `meta` elements. It removes event attributes and `src`, `srcset`, `poster`, `data`, `background`, `ping`, `action`, `formaction`, `manifest` and `xlink:href`. Resource-bearing CSS containing `url`, `@import` or a backslash is rejected. Other styles remain, including styles that hide content.

Anchor hrefs become inert `#` values for rendering. Each actual original href overwrites `data-zero-original-href`, so caller-supplied values cannot replace the original lexical link data returned by extraction. Receipts include raw and serialized-rendering hashes, the policy and removal/link counts. Removing an image changes visible content: the PNG depicts this declared inert view, not the original page.

Chromium runs with JavaScript disabled and a restrictive CSP. Only the first main-document request to one fixed synthetic origin is fulfilled; other routes are aborted. Docker has no network and no host mounts. The fixed operation extracts title, headings, links and visible text, then captures a 1280 by 720 PNG using the actual computer provider's navigate/snapshot path. Callers cannot provide URLs, selectors, scripts or navigation commands.

| Measurement | Qualified candidate |
| --- | --- |
| Immutable image | `sha256:b74bf06b473909daae82590fb427c1ee37888568f605340ee88c0f858385b6af` |
| Build-input lock SHA-256 | `96cd2c725060ba0dfc36688ef57cd174375c74bcf4a76d72e6a4c9108ddc90c4` |
| Total image / added image bytes | 866,584,399 / 1,570,066 |
| Application, notices and lock bytes | 1,186,450 |
| Caps | 900 MiB total; 2 MiB added; 512 MiB RAM; 2 CPUs; 128 PIDs; 128 MiB tmpfs |
| Time caps | 15 seconds driver; 20 seconds job |
| Build | COPY-only from the immutable frozen base; no downloads or installs; network disabled |

The image inherits the pinned Node 24.22.0, Playwright 1.63.0, Chromium 153.0.8010.12 and JSDOM from the frozen base. The bundled source, retained notices and build inputs are hashed; all 324 recorded source entries matched the qualification checkout after the run. The frozen base and its earlier cohort remain unchanged.

Epoch 3 passed all ten actual Docker cases in 32.40 seconds of test execution. The [redacted receipt](STATIC-BROWSER-INPUT-2026-10-17.json) records the frozen source hashes and each raw/rendered input hash. Before execution, the cohort froze the same ten raw fixture inputs and semantic facts used previously, plus exact expected rendered hashes for the new declared transformation. Assertions checked raw SHA, exact rendered SHA, policy/removal/link counts, title, heading, visible text, original lexical hrefs, hidden/script sentinels, actual navigate/snapshot use, PNG digest and dimensions. The inputs include Unicode, entities, tables, hidden content, script attempts and external resource markup. These remain synthetic development cases; no fixture IDs are exposed as the execution API.

Earlier failures remain retained separately. An unminified preparation exceeded the unchanged 2 MiB layer cap before building. A BuildKit attempt tried remote metadata resolution and failed; the successful builder uses the already cached exact image ID and the legacy offline COPY path. Cohort epoch 1 rejected all ten requests before Docker because the harness hashed an unnormalized object. Epoch 2 normalized that harness under the original candidate and passed nine of ten cases; the external-resource case failed when Chromium exited with SIGXFSZ. Diagnostics did not establish the file target or root cause. No cap was relaxed and no cause is claimed. Epoch 3 uses the explicitly declared new inert candidate; it does not erase or reinterpret those failures.

The build entry point is `node platform/scripts/zero-browser-static-image.mjs --prepare`. Actual qualification requires explicit `VERIFY_ZERO_STATIC_BROWSER_DOCKER=1`, `ZERO_STATIC_BROWSER_IMAGE_ID` and `ZERO_STATIC_BROWSER_LOCK_SHA256` values for `zero-browser-static.docker.test.ts`. Private epoch locks, JSON results and original logs remain retained by the operator. No paid model calls were dispatched.
