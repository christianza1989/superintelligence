/** Offline plan only. Live runs use the same shared experiment snapshot. */
import { mkdir, writeFile } from "node:fs/promises";
import { buildLabPlan } from "./zero-lab-config.mjs";

if (process.argv.length !== 2)
  throw new Error("lab:plan takes no arguments and never dispatches models.");
const report = await buildLabPlan();
const root = new URL("../../", import.meta.url);
await mkdir(new URL(".artifacts/zero-lab/", root), { recursive: true });
await writeFile(
  new URL(".artifacts/zero-lab/plan.json", root),
  `${JSON.stringify(report, null, 2)}\n`,
  { mode: 0o600 },
);
console.log(
  JSON.stringify(
    {
      status: report.status,
      suite: report.config.suite,
      profiles: report.config.profiles.map((p) => p.id),
      sourceDigests: report.sourceDigests,
      plannedTrials: report.trials.length,
      attempted: 0,
      modelDispatchAttempts: 0,
      costUsd: null,
    },
    null,
    2,
  ),
);
