import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type { ArtifactStore } from "@rakazo/adapter-kit";
import type { Actor, PrepareLibraryHandoff } from "@rakazo/contracts";
import {
  createRepositoryReusePlan,
  InvalidRepositoryReusePlan,
} from "@rakazo/core/repositoryzero";
import type { PrismaClient } from "@rakazo/db";
import { createOwnedArtifact } from "./artifacts.js";
import { resolveThreadTarget } from "./thread-target.js";

export async function prepareLibraryHandoff(
  deps: { prisma: PrismaClient; artifacts: ArtifactStore },
  actor: Actor,
  input: PrepareLibraryHandoff,
) {
  // Resolve ownership before any artifact I/O. Public catalog IDs grant no workspace access.
  const target = await resolveThreadTarget(deps.prisma, actor, {
    botId: input.botId,
  });
  if (target.kind !== "bot") throw new ORPCError("BAD_REQUEST");
  let plan;
  try {
    plan = createRepositoryReusePlan(input);
  } catch (error) {
    if (error instanceof InvalidRepositoryReusePlan)
      throw new ORPCError("BAD_REQUEST", { message: error.message });
    throw error;
  }
  const content = Buffer.from(JSON.stringify(plan, null, 2) + "\n", "utf8");
  const planSha256 = createHash("sha256").update(content).digest("hex");
  const operation = createHash("sha256")
    .update(JSON.stringify([actor.spaceId, actor.userId, input.clientNonce]))
    .digest("hex");
  const nonce = `library-plan-${operation}`;
  const existing = await deps.prisma.artifact.findFirst({
    where: { spaceId: actor.spaceId, userId: actor.userId, clientNonce: nonce },
  });
  const assertSameIntent = (row: {
    hash: string;
    botId: string | null;
    groupId: string | null;
  }) => {
    if (
      row.hash !== planSha256 ||
      row.botId !== target.botId ||
      row.groupId !== null
    )
      throw new ORPCError("CONFLICT", {
        message:
          "A different plan already uses this request. Change the brief or role to save a new plan.",
      });
  };
  if (existing) assertSameIntent(existing);
  const artifact = await createOwnedArtifact(deps, actor, {
    botId: target.botId,
    name: `reuse-plan-${operation.slice(0, 16)}.json`,
    description:
      "Repository reuse planning handoff; source facts do not grant execution.",
    mimeType: "application/json",
    contentBase64: content.toString("base64"),
    clientNonce: nonce,
  });
  // createOwnedArtifact serializes concurrent retries; check the winning payload too.
  const persisted = await deps.prisma.artifact.findFirst({
    where: { id: artifact.id, spaceId: actor.spaceId, userId: actor.userId },
  });
  if (!persisted) throw new ORPCError("INTERNAL_SERVER_ERROR");
  assertSameIntent(persisted);
  return {
    artifactId: artifact.id,
    botId: target.botId,
    threadId: target.threadId,
    candidateId: plan.sourceFacts.repository,
    role: input.role,
    clientNonce: input.clientNonce,
    planSha256,
    planningOnly: true as const,
  };
}
