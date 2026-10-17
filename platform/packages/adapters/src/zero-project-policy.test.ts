import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Descriptor from "./file-handle-path.js";
import { fileHandlePath } from "./file-handle-path.js";
import {
  createZeroProjectPolicy,
  readZeroOperatorFile,
  ZERO_PROJECT_POLICY_LIMITS,
  ZeroProjectPolicyError,
  zeroProjectPolicyFromEnv,
} from "./zero-project-policy.js";

vi.mock("./file-handle-path.js", async (original) => {
  const actual = await original<typeof Descriptor>();
  return { ...actual, fileHandlePath: vi.fn(actual.fileHandlePath) };
});
const roots: string[] = [];
const actor = { spaceId: "fixture-space", userId: "fixture-user" };
const grant = () => ({
  ...actor,
  scopeId: "fixture-project",
  policyRevision: "fixture-policy-v1",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
});
async function fixture(value: unknown = { version: 1, grants: [grant()] }) {
  const root = await mkdtemp(path.join(tmpdir(), "zero-policy-test-"));
  roots.push(root);
  const file = path.join(root, "operator-policy.json");
  await writeFile(file, JSON.stringify(value), { mode: 0o600 });
  return { root, file, policy: createZeroProjectPolicy(file) };
}
beforeEach(async () => {
  const actual = await vi.importActual<typeof Descriptor>("./file-handle-path.js");
  vi.mocked(fileHandlePath).mockReset().mockImplementation(actual.fileHandlePath);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe.skipIf(process.platform !== "linux")("trusted operator project policy", () => {
  it("keeps optional verifier roots/images outside the principal and reopens their live policy", async () => {
    const principal = grant();
    const verification = {
      profile: "zero-csv-project-v1",
      projectRoot: "/tmp/fixture-project",
      stagingRoot: "/tmp/fixture-staging",
      dockerExecutable: "/usr/bin/docker",
      imageId: `sha256:${"a".repeat(64)}`,
      limits: { maxFiles: 5, maxFileBytes: 131_072, maxTotalBytes: 262_144 },
    };
    const { file, policy } = await fixture({
      version: 1,
      grants: [{ ...principal, verification }],
    });
    expect(await policy.resolve(actor, principal.scopeId)).toEqual(principal);
    await policy.authorize(principal);
    expect(await policy.resolveVerifier(principal)).toMatchObject({
      imageId: verification.imageId,
      dockerExecutable: verification.dockerExecutable,
      snapshot: {
        scopeId: principal.scopeId,
        projectRoot: verification.projectRoot,
        stagingRoot: verification.stagingRoot,
        limits: verification.limits,
      },
    });
    await writeFile(file, JSON.stringify({ version: 1, grants: [principal] }));
    expect(await policy.resolveVerifier(principal)).toBeUndefined();
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        grants: [{ ...principal, verification: { ...verification, imageId: "node:latest" } }],
      }),
    );
    await expect(policy.resolveVerifier(principal)).rejects.toBeInstanceOf(ZeroProjectPolicyError);
  });
  it("shares the descriptor reader with smaller bounded operator bindings", async () => {
    const { file } = await fixture();
    const expected = await readFile(file);
    expect(Buffer.from(await readZeroOperatorFile(file, expected.byteLength))).toEqual(expected);
    for (const bound of [0, expected.byteLength - 1, ZERO_PROJECT_POLICY_LIMITS.bytes + 1])
      await expect(readZeroOperatorFile(file, bound)).rejects.toBeInstanceOf(
        ZeroProjectPolicyError,
      );
  });

  it("keeps an unset policy disabled and authorizes only exact actor/project grants", async () => {
    expect(zeroProjectPolicyFromEnv({})).toBeUndefined();
    expect(zeroProjectPolicyFromEnv({ ZERO_PROJECT_POLICY_FILE: "" })).toBeUndefined();
    const { file, policy } = await fixture();
    const principal = await policy.resolve(actor, "fixture-project");
    await policy.authorize({
      expiresAt: principal.expiresAt,
      policyRevision: principal.policyRevision,
      scopeId: principal.scopeId,
      userId: principal.userId,
      spaceId: principal.spaceId,
    });
    await zeroProjectPolicyFromEnv({ ZERO_PROJECT_POLICY_FILE: file })!.authorize(principal);
    await expect(
      policy.resolve({ ...actor, userId: "another-user" }, "fixture-project"),
    ).rejects.toBeInstanceOf(ZeroProjectPolicyError);
    await expect(
      policy.resolve({ ...actor, spaceId: "another-space" }, "fixture-project"),
    ).rejects.toBeInstanceOf(ZeroProjectPolicyError);
    await expect(policy.resolve(actor, "another-project")).rejects.toBeInstanceOf(
      ZeroProjectPolicyError,
    );
  });

  it("rereads policy on every call: revisions, deletion, expiry and revocation deny stale grants", async () => {
    const { file, policy } = await fixture();
    const principal = await policy.resolve(actor, "fixture-project");
    for (const grants of [
      [],
      [{ ...principal, policyRevision: "fixture-policy-v2" }],
      [{ ...principal, expiresAt: new Date(Date.now() - 1000).toISOString() }],
    ]) {
      await writeFile(file, JSON.stringify({ version: 1, grants }));
      await expect(policy.authorize(principal)).rejects.toBeInstanceOf(ZeroProjectPolicyError);
    }
    await writeFile(file, JSON.stringify({ version: 1, grants: [principal] }));
    await policy.authorize(principal);
    await rm(file);
    await expect(policy.authorize(principal)).rejects.toBeInstanceOf(ZeroProjectPolicyError);
  });

  it("observes a complete atomic replacement without retaining a cached authorization", async () => {
    const { root, file, policy } = await fixture();
    const principal = await policy.resolve(actor, "fixture-project");
    const replacement = path.join(root, "replacement.json");
    await writeFile(
      replacement,
      JSON.stringify({ version: 1, grants: [{ ...principal, policyRevision: "next" }] }),
      { mode: 0o600 },
    );
    await rename(replacement, file);
    await expect(policy.authorize(principal)).rejects.toBeInstanceOf(ZeroProjectPolicyError);
    expect((await policy.resolve(actor, "fixture-project")).policyRevision).toBe("next");
  });

  it.each([
    { version: 2, grants: [] },
    { version: 1, grants: [], credentials: "forbidden" },
    { version: 1, grants: [{ ...grant(), root: "/" }] },
    { version: 1, grants: [{ ...grant(), userId: "" }] },
    { version: 1, grants: [{ ...grant(), expiresAt: "never" }] },
    { version: 1, grants: [{ ...grant(), expiresAt: "2099-01-01T00:00:00+99:99" }] },
    { version: 1, grants: [grant(), grant()] },
    {
      version: 1,
      grants: Array.from({ length: ZERO_PROJECT_POLICY_LIMITS.grants + 1 }, (_, i) => ({
        ...grant(),
        scopeId: `scope-${i}`,
      })),
    },
  ])("rejects malformed, unbounded or ambiguous policy records", async (value) => {
    const { policy } = await fixture(value);
    await expect(policy.resolve(actor, "fixture-project")).rejects.toBeInstanceOf(
      ZeroProjectPolicyError,
    );
  });

  it.each([
    "malformed-json",
    "oversized",
    "invalid-utf8",
    "insecure-mode",
    "wrong-owner",
    "directory",
    "hardlink",
    "symlink",
    "ancestor-symlink",
    "inside-repo",
  ] as const)("fails closed for %s with redacted errors", async (kind) => {
    const { root, file } = await fixture();
    let configured = file;
    if (kind === "malformed-json") await writeFile(file, '{"private-path":"/fixture/private",');
    if (kind === "oversized")
      await writeFile(file, " ".repeat(ZERO_PROJECT_POLICY_LIMITS.bytes + 1));
    if (kind === "invalid-utf8") await writeFile(file, Buffer.from([0xc0, 0xaf]));
    if (kind === "insecure-mode") await chmod(file, 0o640);
    if (kind === "wrong-owner") vi.spyOn(process, "getuid").mockReturnValue(process.getuid!() + 1);
    if (kind === "directory") configured = root;
    if (kind === "hardlink") await link(file, path.join(root, "another-name.json"));
    if (kind === "symlink") {
      configured = path.join(root, "link.json");
      await symlink(file, configured);
    }
    if (kind === "ancestor-symlink") {
      const sibling = `${root}-link`;
      roots.push(sibling);
      await symlink(root, sibling);
      configured = path.join(sibling, "operator-policy.json");
    }
    if (kind === "inside-repo") await writeFile(path.join(root, ".git"), "gitdir: fake");
    const error = await createZeroProjectPolicy(configured)
      .resolve(actor, "fixture-project")
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ZeroProjectPolicyError);
    expect(String(error)).toBe(
      "ZeroProjectPolicyError: Project policy unavailable or scope denied",
    );
    expect(String(error)).not.toContain(root);
    expect(String(error)).not.toContain(actor.userId);
  });

  it.each(["relative/policy.json", "/tmp/../operator.json", "", "/tmp/invalid\0.json"])(
    "rejects a noncanonical operator path",
    async (file) => {
      await expect(
        createZeroProjectPolicy(file).resolve(actor, "fixture-project"),
      ).rejects.toBeInstanceOf(ZeroProjectPolicyError);
    },
  );

  it("rejects pathname replacement after opening the original descriptor", async () => {
    const { root, file, policy } = await fixture();
    const actual = await vi.importActual<typeof Descriptor>("./file-handle-path.js");
    vi.mocked(fileHandlePath).mockImplementationOnce(async (fd) => {
      const opened = await actual.fileHandlePath(fd);
      await rename(file, path.join(root, "old-policy.json"));
      await writeFile(file, JSON.stringify({ version: 1, grants: [grant()] }), { mode: 0o600 });
      return opened;
    });
    await expect(policy.resolve(actor, "fixture-project")).rejects.toBeInstanceOf(
      ZeroProjectPolicyError,
    );
  });

  it("rejects a permission change during descriptor validation", async () => {
    const { file, policy } = await fixture();
    const actual = await vi.importActual<typeof Descriptor>("./file-handle-path.js");
    vi.mocked(fileHandlePath).mockImplementationOnce(async (fd) => {
      const opened = await actual.fileHandlePath(fd);
      await chmod(file, 0o644);
      return opened;
    });
    await expect(policy.resolve(actor, "fixture-project")).rejects.toBeInstanceOf(
      ZeroProjectPolicyError,
    );
  });

  it("rejects a descriptor whose actual path differs from the trusted configured path", async () => {
    const { file, policy } = await fixture();
    vi.mocked(fileHandlePath).mockResolvedValueOnce(`${file}-outside`);
    await expect(policy.resolve(actor, "fixture-project")).rejects.toBeInstanceOf(
      ZeroProjectPolicyError,
    );
    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ version: 1 });
  });

  it("rejects a symlinked checkout marker and nested repository policy", async () => {
    const { root, file } = await fixture();
    const nested = path.join(root, "nested");
    await mkdir(nested);
    const nestedFile = path.join(nested, "policy.json");
    await rename(file, nestedFile);
    await symlink("missing-marker", path.join(root, ".git"));
    await expect(
      createZeroProjectPolicy(nestedFile).resolve(actor, "fixture-project"),
    ).rejects.toBeInstanceOf(ZeroProjectPolicyError);
  });
});
