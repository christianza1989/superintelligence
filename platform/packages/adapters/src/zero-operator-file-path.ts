import { readlink } from "node:fs/promises";

/** Linux descriptor identity: never resolve through a replaced pathname. */
export function fileHandlePath(fd: number): Promise<string> {
  return readlink(`/proc/self/fd/${fd}`);
}
