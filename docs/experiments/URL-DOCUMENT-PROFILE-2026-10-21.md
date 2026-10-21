# Captured document replay at its original URL

2026-10-21. This is a bounded development profile, not live browser internet research, original-page fidelity, native integration or G2 acceptance. No model or paid API was dispatched. The earlier inert HTML research profile and its results remain separate.

The new `zero-url-captured-document-v1` profile uses `ComputerBrowserProvider.navigate` and `snapshot` with the exact declared original URL. The browser receives the unchanged captured HTML response at that one URL. Its requested, response and final URLs, captured-body hash, parsed-document hash, first visible paragraph and screenshot remain separate evidence fields. The paragraph is an observed quote, not general semantic reasoning. The outer scoped fetch still owns source authorization, DNS and SSRF policy; this standalone profile does not grant a new network destination.

JavaScript, service workers, permissions, downloads and external resources are disabled. One exact top-frame GET is admitted; other requests, redirects and frames cause rejection. A release-owned, read-only, hash-pinned runner is loaded through a bounded regular-file reader. Calls cannot supply code, commands or headers. Current authority is checked before release I/O, dispatch, result processing and delivery after cleanup. Stalled authorization, cancellation and deadlines settle through the existing bounded Docker transport.

## Results and preserved failures

At author revision `514dc7540f77e9aa1cd5a4364e4315dffbd6a0e4`, focused offline checks pass **14/14**, adapter type checking passes and explicit offline bundle preparation passes. The production runner is 1,107,260 B, SHA-256 `c08f0161b8be7624a1e792c54690bf141056d9aa8e5c985bea4837c9cd79ed1d`; its manifest hash is `8d40f62b5e929cddfc7de50b48845ab6ecdac4a1fb0fed9174f5e4996c44a7e0`. The bundle retains exact source/dependency pins and original notices. Preparation alone does not approve distribution.

The second actual epoch passes **7/7** with the original case expectations:

| Case | Outcome | Elapsed |
|---|---|---|
| Exact original URL and first visible paragraph | Success | 5.844 s |
| Inline script and fetch disabled | Success | 5.021 s |
| External CSS/image blocked by CSP | Success | 4.088 s |
| Meta redirect | Rejected | 6.201 s |
| Subframe | Rejected | 3.533 s |
| Grant revoked after output | Output withheld | 4.118 s |
| Cancellation after dispatch | Cancelled | 0.447 s |

All seven cases confirm container absence. Source remains clean and unchanged during execution. The case-table hash is `ca1537614379a40a7d9c93ea049ac1a3ed075bf6985f4545de3b5c2ff554a323`; expected outcomes were not changed between epochs.

The first actual epoch passed the first two cases, then failed the resource-blocking case; the remaining cases were not run. Targeted diagnostics proved that CSP correctly blocked the resource requests and Chromium exited with `SIGXFSZ` under the inherited 4 MiB per-file limit. No OOM or PID-limit event was observed. The particular oversized file was not identified. These failures and diagnostic revisions remain retained.

The new source therefore declares an explicit **16 MiB per-file** scratch limit for this profile. It overrides exactly one inherited flag; the shared static-browser helper stays at 4 MiB. Total tmpfs stays 128 MiB, memory 512 MiB, CPU 1, PIDs 128, output 2 MiB and PNG 1 MiB, with a 1280×720 viewport and device scale 1. The change created a new pinned source/bundle epoch; no further limit tuning or retry was needed for the seven-case run. Earlier type/setup/bundle-metadata failures are also retained.

- Runtime image: `sha256:b74bf06b473909daae82590fb427c1ee37888568f605340ee88c0f858385b6af`.
- Image input lock: `96cd2c725060ba0dfc36688ef57cd174375c74bcf4a76d72e6a4c9108ddc90c4`.
- Exact runtime facts: Node 24.22.0, Playwright 1.63.0 and Chromium 153.0.8010.12.

The profile is not yet wired into the authenticated API/Graphile research job. The frozen ten browser tasks, their independent fact grader, mandatory controls, native host and complete product flow remain unexecuted for this profile. The [thirty-task plan](DEVELOPMENT-ACCEPTANCE-2026-10-20.md) and its original results are unchanged. See [current implementation](../IMPLEMENTATION.md) for acceptance boundaries.
