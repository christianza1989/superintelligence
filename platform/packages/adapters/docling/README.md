# Opt-in born-digital PDF CPU profile

This module is a bounded Docling runtime spike. It is not installed or downloaded by the application, package imports, discovery, or a health check. It does not yet register a Graphile job or satisfy durable PDF worker acceptance.

## Fixed scope and preparation

- Docling slim 2.140.0, upstream source commit and wheel hash in `profile.json`.
- Python 3.11 Linux/amd64 base image by digest; CPU Torch 2.8.0 and torchvision 0.23.0. Seventy resolved binary wheels are exact-version/hash locked in the committed wheel manifest; preparation never re-resolves versions. Source builds are disallowed.
- Heron layout and TableFormer accurate artifacts use immutable revisions and individual byte/hash pins. No default Docling model downloader, OCR, picture classification/description, code/formula enrichment, external plugins or remote inference.
- Explicit command from the repository: `node platform/scripts/zero-docling-prepare.mjs --prepare`. Without the exact flag, it returns blocked with zero downloads.
- Preparation: dependency archives <=2 GiB, model files <=1 GiB, installed image plus retained wheel/model cache <=6 GiB, <=10 minutes per attempt. Resolver traffic is reported separately from retained wheel payloads; an initial failed attempt is retained in local evidence. Optional module size does not count as passing the separate <=2 GB base installation gate.
- Runtime: network none, read-only root and input/model mounts, dropped capabilities, no-new-privileges, two CPU threads, 2 GiB memory without swap, 120 seconds per file including first model initialization, <=1 MiB PDF, <=5 pages, <=1 MiB result. The benchmark's container watchdog kills the owned container when a file deadline expires. Python's timeout is additional, not the hard boundary.

All downloads and runtime evidence stay in ignored `.cache/zero-docling-v1`. The application does not use this directory automatically. Remove only this owned cache and the explicitly tagged `zero-docling-cpu:2.140.0-local` image when no longer needed; shared base layers may remain in Docker.

## Truth and measurements

The ten synthetic input PDFs and manifest were committed before conversion. They contain eleven pages, eleven tables and 56 numeric cells, including negative/parenthesized values, grouping, decimals, blank cells, two tables, two pages, identifiers and a no-table narrative control. Manifest hash is in `profile.json`. The fixed grader checks source hash, page/table counts, table shape, numeric cell coordinates and values, and page/bounding-box provenance (12-point coordinate tolerance on these letter-size synthetic pages). Expected values are never regenerated from Docling output.

`node --test platform/packages/adapters/docling/grade.conformance.mjs platform/packages/adapters/docling/profile.conformance.mjs` checks the independent grader offline. These tests do not prove Docling runtime correctness. `node platform/scripts/zero-docling-spike.mjs --run` requires an already prepared immutable local image, mounts only the fixed synthetic corpus and pinned models, and records every case plus a separate warm repetition. Missing/failed/partial cases remain in the denominator. A warm repetition is not an eleventh independent fixture. Peak process RSS, container OOM state, image/cache disk and archive/model download bytes are separate measures. Unavailable measurements remain null, not zero.

This controlled development corpus is not an independent holdout, browser/coding acceptance, repeated benefit, OCR acceptance or full MVP acceptance. No paid APIs, user PDFs, host subscription tokens or project source are used.

## Licenses and official sources

Docling source is MIT; the Heron model card declares Apache-2.0; the TableFormer repository declares CDLA-Permissive-2.0. These are distinct artifacts. The profile records pinned code/model source links and hashes. A model-card declaration is not a completed transitive dependency redistribution review; that review remains outstanding.

- [Docling installation](https://docling-project.github.io/docling/getting_started/installation/)
- [Offline models and pipeline options](https://docling-project.github.io/docling/usage/advanced_options/)
- [Pinned Docling release source](https://github.com/docling-project/docling/tree/0e54294231b69bc2cf7a39873235495788f76b57)
- [Heron model](https://huggingface.co/docling-project/docling-layout-heron/tree/8f39ad3c0b4c58e9c2d2c84a38465abf757272d8)
- [TableFormer model](https://huggingface.co/docling-project/docling-models/tree/fc0f2d45e2218ea24bce5045f58a389aed16dc23)
- [Official CPU Torch pairing](https://pytorch.org/get-started/previous-versions/#v280)

## Measured result, 2026-10-17

The actual sealed CPU run completed in 29.487 seconds with all ten cases and the separate warm repeat failed during pipeline preparation with ModuleNotFoundError. This is a preparation failure, not an extraction quality score. Process peak RSS was 511,762,432 bytes; cgroup peak memory was 651,685,888 bytes; no OOM occurred and the owned container was removed. The first runner captured the exception class only, so the exact missing module and traceback are unknown. Static pinned-wheel inspection shows TableFormer imports cv2 while the chosen slim wheel closure omits its optional OpenCV extra. That is an inference about the failure cause. Future runner diagnostics now capture bounded module names and basename-only frames; that diagnostic change has not been rerun.

The installed image is 2,133,152,856 bytes; models add 384,434,788 bytes. Their sum 2,517,587,644 bytes already exceeds the 2,000,000,000-byte whole-profile G0 gate before Zero/browser/coding. Retained preparation data plus the image and conservatively rounded private BuildKit cache have an upper bound of 3,157,465,323 bytes, within only the separate optional 6 GiB cap. This sum is conservative logical accounting; physical filesystem deduplication was not measured. Failed resolution/accounting attempts are retained in the public result summary.

See [redacted measured report](spike-results-2026-10-17.json). No fallback was activated, no PDF worker was registered, and no MVP gate is closed by this experiment.
