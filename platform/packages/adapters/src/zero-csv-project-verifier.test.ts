import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareZeroCsvComponent, validateZeroCsv, zeroCsvHash } from "./zero-csv-profile.js";
import type { ZeroCsvProjectVerifierConfig } from "./zero-csv-project-verifier.js";
import {
  checkZeroCsvProjectFreshness,
  verifyZeroCsvProject,
  ZERO_CSV_PROJECT_CASES,
  ZERO_CSV_PROJECT_FILES,
  ZERO_CSV_PROJECT_LIMITS,
} from "./zero-csv-project-verifier.js";

const app = `import { csvParseRows } from './vendor/d3-dsv/src/csv.js';
export function parseCsv(input) { return csvParseRows(input); }
`;
const never = () => new AbortController().signal;
const imageId = `sha256:${"a".repeat(64)}`;

/** Offline transport runs only these reviewed synthetic fixtures on the local Node.
 * It exercises the exact production harness, without claiming Docker isolation. */
const offlineDocker = String.raw`#!/usr/bin/node
import { appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const args = process.argv.slice(2);
appendFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'calls.jsonl'), JSON.stringify({args, envKeys: Object.keys(process.env)}) + '\n');
if (args.includes('run')) {
  const mounts = args.filter((_, i) => args[i-1] === '--mount');
  const source = mounts.find(m => m.includes('target=/project,')).split('source=')[1].split(',target=')[0];
  const runner = mounts.find(m => m.includes('target=/zero-runner.mjs,')).split('source=')[1].split(',target=')[0];
  let raw = ''; for await (const chunk of process.stdin) raw += chunk;
  const payload = JSON.parse(raw); payload.root = source;
  const child = spawn(process.execPath, [runner], { env: process.env, stdio: ['pipe','inherit','inherit'] });
  child.once('exit', code => { process.exitCode = code ?? 1; });
  child.stdin.end(JSON.stringify(payload));
}
`;

describe.skipIf(process.platform !== "linux" || process.getuid?.() === 0)(
  "CSV host project verifier",
  () => {
    let base: string;
    let root: string;
    let staging: string;
    let config: ZeroCsvProjectVerifierConfig;
    beforeEach(async () => {
      base = await mkdtemp(path.join(tmpdir(), "zero-project-verifier-test-"));
      root = path.join(base, "project");
      staging = path.join(base, "staging");
      await mkdir(root);
      await mkdir(staging);
      await writeFile(path.join(root, "app.mjs"), app);
      for (const file of (await prepareZeroCsvComponent()).files) {
        const target = path.join(root, "vendor/d3-dsv", file.path);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, file.content);
      }
      const executable = path.join(base, "offline-docker.mjs");
      await writeFile(
        executable,
        offlineDocker.replace("#!/usr/bin/node", `#!${process.execPath}`),
        { mode: 0o700 },
      );
      config = {
        imageId,
        dockerExecutable: executable,
        snapshot: {
          scopeId: "fixture-project",
          projectRoot: root,
          stagingRoot: staging,
          allowedFiles: [...ZERO_CSV_PROJECT_FILES],
          limits: { maxFiles: 5, maxFileBytes: 131_072, maxTotalBytes: 262_144 },
        },
      };
    });
    afterEach(async () => {
      vi.unstubAllEnvs();
      async function writable(directory: string) {
        await chmod(directory, 0o700);
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          if (entry.isDirectory()) await writable(path.join(directory, entry.name));
        }
      }
      await writable(base);
      await rm(base, { recursive: true, force: true });
    });

    it("executes the captured app and records real pinned parseRows calls separately from app outcome", async () => {
      vi.stubEnv("ZERO_PRIVATE_TEST_SECRET", "fake-private-marker");
      await writeFile(
        path.join(root, "app.mjs"),
        `${app}if(process.env.ZERO_PRIVATE_TEST_SECRET)throw Error('host env leaked');`,
      );
      const { receipt, snapshotDirectory } = await verifyZeroCsvProject(config, never());
      expect(receipt).toMatchObject({ outcome: "pass", reason: "fixed_suite_passed", imageId });
      expect(receipt.cases).toHaveLength(3);
      for (const [i, result] of receipt.cases.entries()) {
        const expectedDigest = zeroCsvHash(
          JSON.stringify(validateZeroCsv(ZERO_CSV_PROJECT_CASES[i]!)),
        );
        expect(result).toEqual({
          inputSha256: zeroCsvHash(ZERO_CSV_PROJECT_CASES[i]!),
          appOutputSha256: expectedDigest,
          actualUse: { calls: 1, outputSha256: expectedDigest },
        });
      }
      const manifest = JSON.parse(
        await readFile(path.join(snapshotDirectory, "manifest.json"), "utf8"),
      );
      expect(zeroCsvHash(JSON.stringify(manifest))).toBe(receipt.snapshot.sha256);
      expect(receipt.snapshot.manifest.files).toHaveLength(5);
      expect(JSON.stringify(receipt)).not.toContain(base);
      expect(JSON.stringify(receipt)).not.toContain("fake-private-marker");
      expect(receipt.limitations.join(" ")).toMatch(
        /development conformance.*no independent holdout.*not an adversarially unforgeable/su,
      );
      const calls = (await readFile(path.join(base, "calls.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(calls[0].envKeys.sort()).toEqual(["DOCKER_CONFIG", "PATH"]);
      expect(calls[0].args).toEqual(
        expect.arrayContaining([
          "--pull=never",
          "--network=none",
          "--read-only",
          "--cap-drop=ALL",
          "--pids-limit=32",
          "--memory=128m",
          "--memory-swap=128m",
          "--cpus=1",
          "--security-opt=no-new-privileges",
          "--log-driver=none",
          imageId,
        ]),
      );
      expect(
        calls[0].args
          .filter((arg: string) => arg.startsWith("type=bind,"))
          .every((arg: string) => arg.endsWith(",readonly")),
      ).toBe(true);
      expect(calls.at(-1).args).toEqual(expect.arrayContaining(["rm", "--force"]));
    });

    it("rejects an imported but unused component even when independently produced output is correct", async () => {
      const answers = Object.fromEntries(
        ZERO_CSV_PROJECT_CASES.map((input) => [input, validateZeroCsv(input)]),
      );
      await writeFile(
        path.join(root, "app.mjs"),
        `import './vendor/d3-dsv/src/csv.js';\nconst answers=${JSON.stringify(answers)}; export function parseCsv(input){return answers[input];}`,
      );
      const { receipt } = await verifyZeroCsvProject(config, never());
      expect(receipt).toMatchObject({ outcome: "fail", reason: "component_not_used", cases: [] });
    });

    it("records actual component use but rejects an incorrect application result", async () => {
      await writeFile(
        path.join(root, "app.mjs"),
        `import {csvParseRows} from './vendor/d3-dsv/src/csv.js'; export function parseCsv(input){csvParseRows(input);return [];}`,
      );
      const { receipt } = await verifyZeroCsvProject(config, never());
      expect(receipt).toMatchObject({
        outcome: "fail",
        reason: "app_output_mismatch",
        cases: [{ actualUse: { calls: 1 } }],
      });
    });

    it.each(["src/csv.js", "src/dsv.js", "LICENSE", "package.json"])(
      "rejects tampered vendor %s before starting a process",
      async (file) => {
        await writeFile(path.join(root, "vendor/d3-dsv", file), "tampered");
        expect((await verifyZeroCsvProject(config, never())).receipt).toMatchObject({
          outcome: "fail",
          reason: "component_source_mismatch",
        });
        await expect(readFile(path.join(base, "calls.jsonl"))).rejects.toMatchObject({
          code: "ENOENT",
        });
      },
    );

    it("detects stale host edits while the existing receipt continues to bind its captured bytes", async () => {
      const original = await verifyZeroCsvProject(config, never());
      expect(
        (await checkZeroCsvProjectFreshness(config, original.receipt.snapshot.sha256, never()))
          .state,
      ).toBe("unchanged");
      await writeFile(path.join(root, "app.mjs"), `${app}\n// host edit\n`);
      const current = await checkZeroCsvProjectFreshness(
        config,
        original.receipt.snapshot.sha256,
        never(),
      );
      expect(current.state).toBe("changed");
      expect(current.sha256).not.toBe(original.receipt.snapshot.sha256);
      expect(original.receipt.outcome).toBe("pass");
      expect(await readFile(path.join(original.snapshotDirectory, "files/app.mjs"), "utf8")).toBe(
        app,
      );
    });

    it("bounds output and returns a fixed failure without echoing application diagnostics", async () => {
      await writeFile(
        path.join(root, "app.mjs"),
        `${app}console.log('PRIVATE_DIAGNOSTIC'.repeat(5000));`,
      );
      const { receipt } = await verifyZeroCsvProject(config, never());
      expect(receipt).toMatchObject({ outcome: "unknown", reason: "output_limit_exceeded" });
      expect(JSON.stringify(receipt)).not.toContain("PRIVATE_DIAGNOSTIC");
    });

    it("rejects arbitrary images/entrypoints, extra files and mounts outside the fixed profile", async () => {
      await expect(
        verifyZeroCsvProject({ ...config, imageId: "node:latest" }, never()),
      ).rejects.toThrow("invalid_csv_project_verifier_config");
      await expect(
        verifyZeroCsvProject({ ...config, dockerExecutable: "docker" }, never()),
      ).rejects.toThrow("invalid_csv_project_verifier_config");
      await expect(
        verifyZeroCsvProject(
          {
            ...config,
            snapshot: {
              ...config.snapshot,
              allowedFiles: [...ZERO_CSV_PROJECT_FILES, "private.txt"],
            },
          },
          never(),
        ),
      ).rejects.toThrow("invalid_csv_project_verifier_config");
      await expect(verifyZeroCsvProject(config, AbortSignal.abort())).rejects.toThrow();
      await expect(readFile(path.join(base, "calls.jsonl"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    const realDocker =
      process.env.VERIFY_ZERO_CSV_PROJECT_DOCKER === "1" && process.env.ZERO_CSV_PROJECT_IMAGE_ID
        ? it
        : it.skip;
    realDocker(
      "runs the actual offline container with isolation, negative controls and finite cancellation",
      async () => {
        config = {
          ...config,
          dockerExecutable: "/usr/bin/docker",
          imageId: process.env.ZERO_CSV_PROJECT_IMAGE_ID!,
        };
        vi.stubEnv("ZERO_PRIVATE_TEST_SECRET", "fake-private-marker");
        await writeFile(
          path.join(root, "app.mjs"),
          `${app}if(process.env.ZERO_PRIVATE_TEST_SECRET)throw Error('environment leaked');`,
        );
        expect((await verifyZeroCsvProject(config, never())).receipt.outcome).toBe("pass");
        await writeFile(path.join(root, "app.mjs"), `export function parseCsv(){return [];}`);
        expect((await verifyZeroCsvProject(config, never())).receipt).toMatchObject({
          outcome: "fail",
          reason: "component_not_used",
        });
        await writeFile(path.join(root, "app.mjs"), `${app}while(true){}`);
        const start = Date.now();
        const cancelled = await verifyZeroCsvProject(config, AbortSignal.timeout(1500));
        expect(cancelled.receipt).toMatchObject({ outcome: "unknown", reason: "aborted" });
        expect(cancelled.receipt.execution.cleanup).toBe("force_removed");
        expect(Date.now() - start).toBeLessThan(ZERO_CSV_PROJECT_LIMITS.wallMs);
      },
    );
  },
);
