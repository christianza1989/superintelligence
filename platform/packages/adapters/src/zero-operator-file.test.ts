import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readZeroOperatorFile,
  ZeroOperatorFileError,
} from "./zero-operator-file.js";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
describe.skipIf(process.platform !== "linux")(
  "standalone secure operator reader",
  () => {
    it("reads exact bounded bytes from a private external operator file", async () => {
      const root = await mkdtemp(path.join(tmpdir(), "zero-operator-unit-"));
      roots.push(root);
      const file = path.join(root, "binding.json");
      await writeFile(file, "fixture", { mode: 0o600 });
      expect(Buffer.from(await readZeroOperatorFile(file, 7)).toString()).toBe(
        "fixture",
      );
      for (const max of [0, 6, 65537])
        await expect(readZeroOperatorFile(file, max)).rejects.toBeInstanceOf(
          ZeroOperatorFileError,
        );
      await chmod(file, 0o644);
      const error = await readZeroOperatorFile(file).catch((e) => e);
      expect(String(error)).toBe(
        "ZeroOperatorFileError: Operator configuration unavailable",
      );
      expect(String(error)).not.toContain(root);
    });
  },
);
