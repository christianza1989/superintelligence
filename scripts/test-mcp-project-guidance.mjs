import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  rm,
  symlink,
  link,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  configureProjectGuidance,
  projectGuidance,
} from "../plugins/repositoryzero/setup/project-guidance.mjs";

async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), "zero-guidance-"));
  try {
    await run(dir, join(dir, "AGENTS.md"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("explicit project setup is idempotent and removes only its guidance", () =>
  fixture(async (dir, file) => {
    assert.deepEqual(await configureProjectGuidance(dir, "status"), {
      state: "absent",
      changed: false,
    });
    assert.deepEqual(await readdir(dir), []);
    await configureProjectGuidance(dir, "apply");
    const installed = await readFile(file);
    assert.equal(installed.toString(), projectGuidance);
    assert.equal((await configureProjectGuidance(dir, "apply")).changed, false);
    await writeFile(
      file,
      Buffer.concat([installed, Buffer.from("\nUser-added rule.\n")]),
    );
    await configureProjectGuidance(dir, "remove");
    assert.equal(await readFile(file, "utf8"), "\nUser-added rule.\n");
    assert.equal(
      (await configureProjectGuidance(dir, "remove")).changed,
      false,
    );
  }));

test("keeps all existing BOM, CRLF and unterminated bytes across apply/remove", () =>
  fixture(async (dir, file) => {
    const original = Buffer.from(
      "\uFEFF# User rules\r\nKeep these.\r\nNo final newline",
    );
    await writeFile(file, original);
    await configureProjectGuidance(dir, "apply");
    assert.ok(
      (await readFile(file)).subarray(0, original.length).equals(original),
    );
    await configureProjectGuidance(dir, "remove");
    assert.deepEqual(await readFile(file), original);
    assert.deepEqual(await readdir(dir), ["AGENTS.md"]);
  }));

test("clean uninstall removes an entirely managed document", () =>
  fixture(async (dir) => {
    await configureProjectGuidance(dir, "apply");
    await configureProjectGuidance(dir, "remove");
    assert.deepEqual(await readdir(dir), []);
  }));

test("edited or duplicate managed blocks cannot overwrite user instructions", () =>
  fixture(async (dir, file) => {
    for (const changed of [
      projectGuidance.replace("RepositoryZero is enabled", "Edited project guidance"),
      projectGuidance + projectGuidance,
    ]) {
      assert.notEqual(changed, projectGuidance, "Tamper control must actually change the managed block");
      await writeFile(file, changed);
      await assert.rejects(configureProjectGuidance(dir, "apply"), /edited/);
      await assert.rejects(configureProjectGuidance(dir, "remove"), /edited/);
      assert.equal(await readFile(file, "utf8"), changed);
    }
  }));

test("shadowing override fails without modifying either instruction file", () =>
  fixture(async (dir, file) => {
    await writeFile(file, "Existing rules");
    await writeFile(join(dir, "AGENTS.override.md"), "Overrides");
    await assert.rejects(configureProjectGuidance(dir, "apply"), /shadows/);
    assert.equal(await readFile(file, "utf8"), "Existing rules");
    assert.equal(
      await readFile(join(dir, "AGENTS.override.md"), "utf8"),
      "Overrides",
    );
  }));

test("linked instructions cannot mutate an outside document", () =>
  fixture(async (dir, file) => {
    const outside = join(dir, "outside.txt");
    await writeFile(outside, "Keep original");
    await link(outside, file);
    await assert.rejects(configureProjectGuidance(dir, "apply"), /unlinked/);
    await rm(file);
    // Windows symlink creation may require privileges; hard-link control above is
    // portable and must pass, while the symlink control is required on Linux.
    if (process.platform !== "win32") {
      await symlink(outside, file);
      await assert.rejects(configureProjectGuidance(dir, "apply"), /regular/);
    }
    assert.equal(await readFile(outside, "utf8"), "Keep original");
  }));
