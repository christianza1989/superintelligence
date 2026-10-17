/** Qualification-only child. The parent kills this process at an acknowledged SQL boundary. */

import type { PrismaClient } from "@rakazo/db";
import { createDb, finalizeRun } from "@rakazo/db";

const input = JSON.parse(process.env.ZERO_G1_CHILD_INPUT!);
const db = createDb(process.env.DATABASE_URL!, { poolMax: 1 });
const hold = async () => {
  process.send?.("boundary");
  await new Promise(() => {});
};
const prisma = new Proxy(db.prisma, {
  get(target, key) {
    if (key !== "$transaction") return Reflect.get(target, key);
    return async (operation: Parameters<PrismaClient["$transaction"]>[0]) => {
      const result = await target.$transaction(async (tx) => {
        const value = await (operation as (value: typeof tx) => Promise<unknown>)(tx);
        if (process.env.ZERO_G1_CUT === "before-commit") await hold();
        return value;
      });
      if (process.env.ZERO_G1_CUT === "after-commit") await hold();
      return result;
    };
  },
});
try {
  await finalizeRun(prisma, input);
  process.exitCode = 2;
} catch {
  process.send?.("failed");
  process.exitCode = 1;
} finally {
  await db.prisma.$disconnect();
  await db.pool.end();
}
