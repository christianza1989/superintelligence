import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Actor } from "@rakazo/contracts";
import { IsolationError } from "@rakazo/db";
import { z } from "zod";
import { fileHandlePath } from "./file-handle-path.js";
import type { ZeroCsvPrincipal } from "./zero-csv-preparation.js";

export const ZERO_PROJECT_POLICY_LIMITS = Object.freeze({ bytes: 65_536, grants: 64 });
const checkout = fileURLToPath(new URL("../../../../", import.meta.url));
const grantSchema = z
  .object({
    spaceId: z.string().min(1).max(128),
    userId: z.string().min(1).max(128),
    scopeId: z.string().min(1).max(128),
    policyRevision: z.string().min(1).max(128),
    expiresAt: z
      .string()
      .datetime({ offset: true })
      .refine((value) => Number.isFinite(Date.parse(value))),
  })
  .strict();
const policySchema = z
  .object({
    version: z.literal(1),
    grants: z.array(grantSchema).max(ZERO_PROJECT_POLICY_LIMITS.grants),
  })
  .strict();
const fields = ["spaceId", "userId", "scopeId", "policyRevision", "expiresAt"] as const;

/** Intentionally redacted: neither operator paths nor policy identities cross this boundary. */
export class ZeroProjectPolicyError extends IsolationError {
  constructor() {
    super("Project policy unavailable or scope denied");
    this.name = "ZeroProjectPolicyError";
  }
}

function contained(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

async function assertOperatorPath(file: string) {
  if (
    process.platform !== "linux" ||
    !process.getuid ||
    !path.posix.isAbsolute(file) ||
    path.posix.normalize(file) !== file ||
    file.length > 4096 ||
    file.includes("\0")
  )
    throw new ZeroProjectPolicyError();
  if (contained(await realpath(checkout), file)) throw new ZeroProjectPolicyError();
  let directory = path.dirname(file);
  for (;;) {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new ZeroProjectPolicyError();
    // Refuse config beneath any checkout, including worktrees whose .git is a file.
    const git = await lstat(path.join(directory, ".git")).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (git) throw new ZeroProjectPolicyError();
    if (directory === "/") break;
    directory = path.dirname(directory);
  }
  if ((await realpath(file)) !== file) throw new ZeroProjectPolicyError();
}

/** Secure bounded reader shared only by trusted operator configuration consumers. */
export async function readZeroOperatorFile(
  file: string,
  maxBytes: number = ZERO_PROJECT_POLICY_LIMITS.bytes,
): Promise<Uint8Array> {
  try {
    if (
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 1 ||
      maxBytes > ZERO_PROJECT_POLICY_LIMITS.bytes
    )
      throw new ZeroProjectPolicyError();
    await assertOperatorPath(file);
    const handle = await open(
      file,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const before = await handle.stat({ bigint: true });
      if (
        !before.isFile() ||
        before.nlink !== 1n ||
        before.uid !== BigInt(process.getuid!()) ||
        (before.mode & 0o7777n) !== 0o600n ||
        before.size > BigInt(maxBytes)
      )
        throw new ZeroProjectPolicyError();
      if ((await fileHandlePath(handle.fd)) !== file) throw new ZeroProjectPolicyError();
      const buffer = Buffer.alloc(maxBytes + 1);
      let size = 0;
      while (size < buffer.byteLength) {
        const read = await handle.read(buffer, size, buffer.byteLength - size, size);
        if (!read.bytesRead) break;
        size += read.bytesRead;
      }
      if (size > maxBytes) throw new ZeroProjectPolicyError();
      const after = await handle.stat({ bigint: true });
      const named = await lstat(file, { bigint: true });
      if (
        [after, named].some(
          (info) =>
            !info.isFile() ||
            info.dev !== before.dev ||
            info.ino !== before.ino ||
            info.uid !== before.uid ||
            info.mode !== before.mode ||
            info.nlink !== 1n ||
            info.size !== before.size ||
            info.mtimeNs !== before.mtimeNs ||
            info.ctimeNs !== before.ctimeNs,
        ) ||
        size !== Number(before.size) ||
        (await fileHandlePath(handle.fd)) !== file
      )
        throw new ZeroProjectPolicyError();
      await assertOperatorPath(file);
      return buffer.subarray(0, size);
    } finally {
      await handle.close();
    }
  } catch {
    throw new ZeroProjectPolicyError();
  }
}

async function readPolicy(file: string) {
  try {
    const bytes = await readZeroOperatorFile(file);
    const parsed = policySchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
    const bindings = new Set<string>();
    for (const grant of parsed.grants) {
      const binding = JSON.stringify([grant.spaceId, grant.userId, grant.scopeId]);
      if (bindings.has(binding)) throw new ZeroProjectPolicyError();
      bindings.add(binding);
    }
    return parsed;
  } catch {
    throw new ZeroProjectPolicyError();
  }
}

/** No cached policy or successful authorization survives a call. Operator writes may fail closed. */
export function createZeroProjectPolicy(file: string) {
  const find = async (identity: Pick<ZeroCsvPrincipal, "spaceId" | "userId" | "scopeId">) => {
    const policy = await readPolicy(file);
    const grant = policy.grants.find(
      (item) =>
        item.spaceId === identity.spaceId &&
        item.userId === identity.userId &&
        item.scopeId === identity.scopeId,
    );
    if (!grant || Date.parse(grant.expiresAt) <= Date.now()) throw new ZeroProjectPolicyError();
    return grant;
  };
  return {
    async resolve(
      actor: Pick<Actor, "spaceId" | "userId">,
      scopeId: string,
    ): Promise<ZeroCsvPrincipal> {
      return { ...(await find({ spaceId: actor.spaceId, userId: actor.userId, scopeId })) };
    },
    async authorize(principal: ZeroCsvPrincipal): Promise<void> {
      const parsed = grantSchema.safeParse(principal);
      if (!parsed.success) throw new ZeroProjectPolicyError();
      const checked = parsed.data;
      const current = await find(checked);
      if (fields.some((field) => checked[field] !== current[field]))
        throw new ZeroProjectPolicyError();
    },
  };
}

/** Unset stays disabled. An invalid configured file fails closed when an operation checks it. */
export function zeroProjectPolicyFromEnv(env: { ZERO_PROJECT_POLICY_FILE?: string } = process.env) {
  return env.ZERO_PROJECT_POLICY_FILE
    ? createZeroProjectPolicy(env.ZERO_PROJECT_POLICY_FILE)
    : undefined;
}
