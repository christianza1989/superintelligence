import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileHandlePath } from "./zero-operator-file-path.js";

export const ZERO_OPERATOR_FILE_MAX_BYTES = 65_536;
// The packager sets this compile-time flag. Host environment cannot relax it.
declare const ZERO_OPERATOR_BUNDLED: boolean;
const protectedRoot = fileURLToPath(
  new URL(
    typeof ZERO_OPERATOR_BUNDLED !== "undefined" && ZERO_OPERATOR_BUNDLED
      ? "../"
      : "../../../../",
    import.meta.url,
  ),
);
export class ZeroOperatorFileError extends Error {
  constructor() {
    super("Operator configuration unavailable");
    this.name = "ZeroOperatorFileError";
  }
}

function contained(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
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
    throw new ZeroOperatorFileError();
  if (contained(await realpath(protectedRoot), file))
    throw new ZeroOperatorFileError();
  let directory = path.dirname(file);
  for (;;) {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new ZeroOperatorFileError();
    // Refuse config beneath any checkout, including worktrees whose .git is a file.
    const git = await lstat(path.join(directory, ".git")).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (git) throw new ZeroOperatorFileError();
    if (directory === "/") break;
    directory = path.dirname(directory);
  }
  if ((await realpath(file)) !== file) throw new ZeroOperatorFileError();
}

/** Secure bounded reader shared only by trusted operator configuration consumers. */
export async function readZeroOperatorFile(
  file: string,
  maxBytes: number = ZERO_OPERATOR_FILE_MAX_BYTES,
): Promise<Uint8Array> {
  try {
    if (
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 1 ||
      maxBytes > ZERO_OPERATOR_FILE_MAX_BYTES
    )
      throw new ZeroOperatorFileError();
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
        throw new ZeroOperatorFileError();
      if ((await fileHandlePath(handle.fd)) !== file)
        throw new ZeroOperatorFileError();
      const buffer = Buffer.alloc(maxBytes + 1);
      let size = 0;
      while (size < buffer.byteLength) {
        const read = await handle.read(
          buffer,
          size,
          buffer.byteLength - size,
          size,
        );
        if (!read.bytesRead) break;
        size += read.bytesRead;
      }
      if (size > maxBytes) throw new ZeroOperatorFileError();
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
        throw new ZeroOperatorFileError();
      await assertOperatorPath(file);
      return buffer.subarray(0, size);
    } finally {
      await handle.close();
    }
  } catch {
    throw new ZeroOperatorFileError();
  }
}
