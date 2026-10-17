import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { IsolationError } from "@rakazo/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalArtifactStore } from "./artifacts.js";
import { captureZeroComponentInput, loadZeroComponentInput } from "./zero-component-input.js";
import { zeroComponentHash } from "./zero-component-jobs.js";

const roots: string[] = [];
afterEach(async () => {
  for (const directory of roots.splice(0)) await rm(directory, { recursive: true, force: true });
});
async function fixture(family: "pdf" | "browser") {
  const root = await mkdtemp("/tmp/zero-input-test-");
  roots.push(root);
  await mkdir(`${root}/project`, { mode: 0o700 });
  await mkdir(`${root}/staging`, { mode: 0o700 });
  const bytes = Buffer.from(family === "pdf" ? "%PDF-synthetic" : "<h1>Owned HTML</h1>");
  await writeFile(`${root}/project/source`, bytes, { mode: 0o600 });
  const principal = {
    spaceId: "space",
    userId: "user",
    scopeId: "scope",
    policyRevision: "policy",
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
  };
  let stored: Record<string, unknown> | undefined;
  const prisma = {
    spaceMember: { findUnique: vi.fn(async () => ({ id: "member" })) },
    artifact: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => stored),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        stored = { id: randomUUID(), ...data };
        return stored;
      }),
    },
  };
  const artifacts = new LocalArtifactStore(root);
  const get = vi.spyOn(artifacts, "get"),
    put = vi.spyOn(artifacts, "put");
  const deps = { prisma, artifacts, authorize: vi.fn(async () => undefined) };
  const binding = {
    snapshot: { projectRoot: `${root}/project`, stagingRoot: `${root}/staging` },
    files: [{ fileId: "source", path: "source", sha256: zeroComponentHash(bytes) }],
  };
  return { root, bytes, principal, deps, binding, get, put, recheck: vi.fn(async () => undefined) };
}
describe("owned immutable component input", () => {
  it("rejects paths beyond cleanup depth before capture, then captures the deepest allowed path and another file without orphans", async () => {
    const f = await fixture("pdf");
    const tooDeep = `${Array.from({ length: 15 }, (_, i) => `d${i}`).join("/")}/source`;
    const deepestAllowed = `${Array.from({ length: 11 }, (_, i) => `a${i}`).join("/")}/source`;
    for (const relative of [tooDeep, deepestAllowed]) {
      await mkdir(`${f.root}/project/${relative.slice(0, relative.lastIndexOf("/"))}`, {
        recursive: true,
        mode: 0o700,
      });
      await writeFile(`${f.root}/project/${relative}`, f.bytes, { mode: 0o600 });
    }
    f.binding.files[0]!.path = tooDeep;
    await expect(
      captureZeroComponentInput(
        f.deps as never,
        "pdf",
        f.principal,
        "source",
        f.binding,
        f.recheck,
      ),
    ).rejects.toBeInstanceOf(IsolationError);
    expect(f.put).not.toHaveBeenCalled();
    expect(f.deps.prisma.artifact.create).not.toHaveBeenCalled();
    expect(await readdir(f.binding.snapshot.stagingRoot)).toEqual([]);

    f.binding.files[0]!.path = deepestAllowed;
    await captureZeroComponentInput(
      f.deps as never,
      "pdf",
      f.principal,
      "source",
      f.binding,
      f.recheck,
    );
    f.binding.files[0]!.path = "source";
    await captureZeroComponentInput(
      f.deps as never,
      "pdf",
      f.principal,
      "source",
      f.binding,
      f.recheck,
    );
    expect(f.put).toHaveBeenCalledTimes(2);
    expect(f.deps.prisma.artifact.create).toHaveBeenCalledTimes(2);
    const scopes = await readdir(f.binding.snapshot.stagingRoot);
    expect(scopes).toHaveLength(1);
    expect(await readdir(`${f.binding.snapshot.stagingRoot}/${scopes[0]}`)).toEqual([]);
  });
  it.each(["pdf", "browser"] as const)(
    "captures %s from the snapshotter files directory, then verifies the owned artifact",
    async (family) => {
      const f = await fixture(family);
      const source = await captureZeroComponentInput(
        f.deps as never,
        family,
        f.principal,
        "source",
        f.binding,
        f.recheck,
      );
      expect(source.sha256).toBe(zeroComponentHash(f.bytes));
      expect(source.bytes).toBe(f.bytes.length);
      expect(
        await loadZeroComponentInput(
          f.deps as never,
          family,
          f.principal,
          "source",
          source,
          f.binding,
          f.recheck,
        ),
      ).toEqual(new Uint8Array(f.bytes));
      expect(f.deps.prisma.artifact.create).toHaveBeenCalledOnce();
    },
  );
  it("rejects source SHA changes before persisting private input", async () => {
    const f = await fixture("pdf");
    await writeFile(`${f.root}/project/source`, "%PDF-changed");
    await expect(
      captureZeroComponentInput(
        f.deps as never,
        "pdf",
        f.principal,
        "source",
        f.binding,
        f.recheck,
      ),
    ).rejects.toThrow("component_input_integrity_failed");
    expect(f.put).not.toHaveBeenCalled();
  });
  it("refuses a symlink before private input persistence", async () => {
    const f = await fixture("pdf");
    await symlink("source", `${f.root}/project/link`);
    f.binding.files[0]!.path = "link";
    await expect(
      captureZeroComponentInput(
        f.deps as never,
        "pdf",
        f.principal,
        "source",
        f.binding,
        f.recheck,
      ),
    ).rejects.toMatchObject({ name: "ProjectSnapshotError" });
    expect(f.put).not.toHaveBeenCalled();
  });
  it("checks scope metadata before reading a private input artifact", async () => {
    const f = await fixture("browser");
    const source = await captureZeroComponentInput(
      f.deps as never,
      "browser",
      f.principal,
      "source",
      f.binding,
      f.recheck,
    );
    await expect(
      loadZeroComponentInput(
        f.deps as never,
        "browser",
        { ...f.principal, scopeId: "foreign" },
        "source",
        source,
        f.binding,
        f.recheck,
      ),
    ).rejects.toBeInstanceOf(IsolationError);
    expect(f.get).not.toHaveBeenCalled();
  });
});
