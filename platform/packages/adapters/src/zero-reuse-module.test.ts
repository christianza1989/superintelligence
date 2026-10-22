import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdtemp,
  mkdir,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverZeroReuseModules,
  eligibleZeroReuseModules,
  zeroReuseModules,
} from "@rakazo/core/zero-reuse-modules";
import { prepareZeroReuseModule } from "./zero-reuse-module.js";
import type { ZeroPreparedReuseModule } from "./zero-reuse-module.js";
import {
  checkZeroReuseHarness,
  ZERO_REUSE_CSV_CASES,
  ZERO_REUSE_HARNESS,
  ZERO_REUSE_INVALID_CSV,
  ZERO_REUSE_ZIP_CASES,
  verifyZeroReuseModule,
} from "./zero-reuse-verifier.js";
import { zeroCsvHash } from "./zero-csv-profile.js";
import { readZeroZip } from "./zero-zip-reference.js";

async function removeFixture(root: string) {
  const unseal = async (directory: string) => {
    await chmod(directory, 0o700);
    for (const entry of await readdir(directory, { withFileTypes: true }))
      if (entry.isDirectory()) await unseal(path.join(directory, entry.name));
  };
  await unseal(root);
  await rm(root, { recursive: true, force: true });
}

async function fixture(
  module: ZeroPreparedReuseModule,
  action: (root: string) => Promise<void>,
) {
  const root = await mkdtemp(path.join(tmpdir(), "zero-reuse-test-"));
  try {
    for (const file of module.files) {
      expect(zeroCsvHash(file.content)).toBe(file.sha256);
      await mkdir(path.dirname(path.join(root, file.path)), {
        recursive: true,
      });
      await writeFile(path.join(root, file.path), file.content);
    }
    await writeFile(
      path.join(root, "app.mjs"),
      module.capability === "csv"
        ? "export { parseCsv } from './csv-adapter.mjs';\n"
        : "export { createZip } from './zip-adapter.mjs';\n",
    );
    await action(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function run(module: ZeroPreparedReuseModule, root: string) {
  const csv = module.capability === "csv",
    nonce = "fixture-reuse-20261022";
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", ZERO_REUSE_HARNESS],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 65536,
      env: { PATH: process.env.PATH },
      input: JSON.stringify({
        root,
        entrypoint: "app.mjs",
        toolId: module.toolId,
        nonce,
        inputs: csv ? ZERO_REUSE_CSV_CASES : ZERO_REUSE_ZIP_CASES,
        invalid: csv
          ? ZERO_REUSE_INVALID_CSV
          : [{ "../bad": "x" }, { "huge.txt": "x".repeat(131073) }, {}],
      }),
    },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  const output = JSON.parse(result.stdout);
  return { output, passed: checkZeroReuseHarness(module, output, nonce) };
}

describe("file-level reuse sources and actual invocation", () => {
  it("finds focused alternatives inside a natural application request without certifying unknown constraints", () => {
    expect(
      discoverZeroReuseModules(
        "Strict bounded CSV parser that returns rectangular rows, supports quoted multiline fields, and can be used synchronously by a Node.js local inventory import application. Need exact RFC-like validation, malformed quote rejection, byte-size limits.",
      ).map((x) => x.toolId),
    ).toEqual(["module.csv.d3", "module.csv.papaparse"]);
    expect(
      discoverZeroReuseModules("CSV import and ZIP archive exports"),
    ).toHaveLength(3);
    expect(discoverZeroReuseModules("Say hello")).toHaveLength(0);
    expect(eligibleZeroReuseModules("CSV streaming parser")).toHaveLength(0);
    expect(
      eligibleZeroReuseModules("CSV parser for 5 MiB uploads"),
    ).toHaveLength(0);
    expect(eligibleZeroReuseModules("CSV semicolon parser")).toHaveLength(0);
    expect(eligibleZeroReuseModules("ZIP extraction")).toHaveLength(0);
    expect(eligibleZeroReuseModules("ZIP archive creation")).toHaveLength(1);
  });
  it("distinguishes excluded capabilities from requirements without discarding conflicting positive constraints", () => {
    expect(
      eligibleZeroReuseModules("CSV parser, no streaming or database logic"),
    ).toHaveLength(2);
    expect(
      eligibleZeroReuseModules(
        "ZIP creation. No extraction or encryption is needed.",
      ),
    ).toHaveLength(1);
    expect(
      eligibleZeroReuseModules(
        "CSV parser without streaming; XLSX is required too",
      ),
    ).toHaveLength(0);
    expect(
      eligibleZeroReuseModules(
        "ZIP creation, no extraction, but encryption is required",
      ),
    ).toHaveLength(0);
    expect(
      eligibleZeroReuseModules("CSV parser, no streaming, for 5 MiB input"),
    ).toHaveLength(0);
  });
  for (const profile of zeroReuseModules) {
    it(`prepares pinned ${profile.toolId} and passes independent conformance plus vendor-call evidence`, async () => {
      const module = await prepareZeroReuseModule(profile.toolId);
      expect(module.files.some((file) => file.path.endsWith("LICENSE"))).toBe(
        true,
      );
      expect(Buffer.byteLength(JSON.stringify(module))).toBeLessThan(80 * 1024);
      await fixture(module, async (root) => {
        const result = run(module, root);
        expect(result.passed, JSON.stringify(result.output)).toBe(true);
      });
    });
  }
  it("rejects a correct CSV parser that imports the source but never calls its parser", async () => {
    const module = await prepareZeroReuseModule("module.csv.d3");
    await fixture(module, async (root) => {
      const adapter = module.files.find(
        (file) => file.path === "csv-adapter.mjs",
      )!.content;
      await writeFile(
        path.join(root, "app.mjs"),
        adapter.replace(
          "const actual = parseVendor(input);",
          "const actual = expected;",
        ),
      );
      const result = run(module, root);
      expect(
        result.output.cases.map(
          (value: { calls: unknown[] }) => value.calls.length,
        ),
      ).toEqual([0, 0, 0, 0]);
      expect(result.passed).toBe(false);
    });
  });
  it("rejects a ZIP implementation that replays correct outputs without calling the vendor", async () => {
    const module = await prepareZeroReuseModule("module.zip.fflate");
    await fixture(module, async (root) => {
      const good = run(module, root);
      expect(good.passed).toBe(true);
      const map = Object.fromEntries(
        ZERO_REUSE_ZIP_CASES.map((input, i) => [
          JSON.stringify(input),
          good.output.cases[i].actual,
        ]),
      );
      await writeFile(
        path.join(root, "app.mjs"),
        `const outputs=${JSON.stringify(map)}; export function createZip(input){const output=outputs[JSON.stringify(input)];if(!output)throw Error('input');return Buffer.from(output,'base64');}`,
      );
      expect(run(module, root).passed).toBe(false);
    });
  });
  it("detects a modified vendor snapshot before any Docker process can run", async () => {
    const module = await prepareZeroReuseModule("module.csv.d3");
    await fixture(module, async (root) => {
      await writeFile(
        path.join(root, "vendor/d3-dsv/src/csv.js"),
        "export const csvParseRows=()=>[];",
      );
      const stagingRoot = await mkdtemp(
        path.join(tmpdir(), "zero-reuse-stage-"),
      );
      try {
        const result = await verifyZeroReuseModule(
          {
            projectRoot: root,
            stagingRoot,
            dockerExecutable: "/does-not-exist",
            imageId: `sha256:${"a".repeat(64)}`,
            entrypoints: { csv: "app.mjs" },
            limits: {
              maxFiles: 16,
              maxFileBytes: 131072,
              maxTotalBytes: 524288,
            },
          },
          module,
          "fixture-scope",
          AbortSignal.timeout(1000),
          async () => {
            throw Error("must_not_dispatch");
          },
        );
        expect(result.outcome).toBe("fail");
        expect(result.reason).toBe("source_mismatch");
      } finally {
        await removeFixture(stagingRoot);
      }
    });
  });
  it("independently rejects broken ZIP headers, CRC and impossible archives", async () => {
    const module = await prepareZeroReuseModule("module.zip.fflate");
    await fixture(module, async (root) => {
      const result = run(module, root);
      expect(result.passed).toBe(true);
      const bytes = Buffer.from(result.output.cases[0].actual, "base64");
      expect(Object.keys(readZeroZip(bytes)).sort()).toEqual([
        "items.csv",
        "manifest.json",
      ]);
      const broken = Buffer.from(bytes);
      broken[14] = broken[14]! ^ 1;
      expect(() => readZeroZip(broken)).toThrow();
      expect(() => readZeroZip(new Uint8Array(22))).toThrow();
      expect(() => readZeroZip(new Uint8Array(196609))).toThrow();
    });
  });
});
