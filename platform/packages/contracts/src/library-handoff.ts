import { z } from "zod";
import { Id } from "./ids.js";

export const RepositoryReuseRoleSchema = z.enum([
  "foundation",
  "component",
  "reference",
]);
export type RepositoryReuseRole = z.infer<typeof RepositoryReuseRoleSchema>;
export const PrepareLibraryHandoffInput = z.strictObject({
  botId: Id.max(200),
  candidateId: z
    .string()
    .regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/u)
    .max(200),
  role: RepositoryReuseRoleSchema,
  brief: z.string().trim().min(1).max(2000),
  clientNonce: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_-]+$/u),
});
export type PrepareLibraryHandoff = z.infer<typeof PrepareLibraryHandoffInput>;
export const PreparedLibraryHandoffSchema = z.strictObject({
  artifactId: Id,
  botId: Id,
  threadId: Id,
  candidateId: z.string(),
  role: RepositoryReuseRoleSchema,
  clientNonce: z.string(),
  planSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  planningOnly: z.literal(true),
});
