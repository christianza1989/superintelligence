/** Server-only trusted profile resolution. Nothing here grants a paid default. */
import type { SecretStore } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { IsolationError } from "@rakazo/db";
import { z } from "zod";
import { ZERO_REUSE_TOOL_IDS } from "@rakazo/core/zero-reuse-modules";
import { parseModelSecret } from "./pi-oauth.js";
import type { ZeroCsvPrincipal } from "./zero-csv-preparation.js";
import { zeroCsvHash } from "./zero-csv-profile.js";

const id = z.string().regex(/^[a-zA-Z0-9_.:-]{1,128}$/);
const instant = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)));
const amount = z.string().regex(/^[1-9][0-9]{0,15}$/);
export const zeroJevPrincipalSchema = z
  .object({
    spaceId: id,
    userId: id,
    scopeId: id,
    policyRevision: id,
    expiresAt: instant,
  })
  .strict();
export const zeroJevProfileSchema = z
  .object({
    revision: id,
    credentialId: id,
    model: z.string().trim().min(1).max(200),
    payerAccountId: id,
    lane: z.literal("routing"),
    reserveUsdMicros: amount,
    reserveTokens: amount,
    timeoutMs: z.number().int().min(100).max(30000),
    expiresAt: instant,
    enabled: z.literal(true),
    allowTaskDataToOpenRouter: z.literal(true),
    tools: z
      .array(z.enum(["csv.parse", "json.normalize", ...ZERO_REUSE_TOOL_IDS]))
      .min(1)
      .max(5)
      .refine((tools) => new Set(tools).size === tools.length),
  })
  .strict();
export type ZeroJevProfile = z.infer<typeof zeroJevProfileSchema>;
export interface ZeroJevConnection {
  profile: ZeroJevProfile;
  connectionDigest: string;
  apiKey: string;
}
export type ZeroJevResolver = (
  principal: ZeroCsvPrincipal,
) => Promise<ZeroJevConnection>;

/** Policy is trusted operator composition; a model request cannot choose a payer or credential. */
export function createStoredZeroJevResolver(deps: {
  prisma: PrismaClient;
  secretStore: Pick<SecretStore, "load">;
  policy: (principal: ZeroCsvPrincipal) => Promise<unknown>;
}): ZeroJevResolver {
  return async (trustedPrincipal) => {
    try {
      const principal = zeroJevPrincipalSchema.parse(trustedPrincipal);
      const profile = zeroJevProfileSchema.parse(await deps.policy(principal));
      if (
        Math.min(
          Date.parse(principal.expiresAt),
          Date.parse(profile.expiresAt),
        ) <= Date.now()
      )
        throw new IsolationError();
      const member = await deps.prisma.spaceMember.findUnique({
        where: {
          spaceId_userId: {
            spaceId: principal.spaceId,
            userId: principal.userId,
          },
        },
        select: { id: true },
      });
      const preference = await deps.prisma.spaceModelPreference.findUnique({
        where: {
          spaceId_userId_credentialId: {
            spaceId: principal.spaceId,
            userId: principal.userId,
            credentialId: profile.credentialId,
          },
        },
        include: { credential: true },
      });
      if (
        !member ||
        !preference ||
        preference.modelId !== profile.model ||
        preference.credential.userId !== principal.userId ||
        preference.credential.provider !== "openrouter"
      )
        throw new IsolationError();
      const secret = await deps.prisma.secret.findFirst({
        where: {
          id: preference.credential.secretId,
          userId: principal.userId,
          spaceId: null,
        },
        select: { id: true, ciphertext: true },
      });
      if (!secret) throw new IsolationError();
      const auth = parseModelSecret(
        await deps.secretStore.load(secret.ciphertext, secret.id),
      );
      if (
        auth.kind !== "api_key" ||
        !auth.key.trim() ||
        auth.key.length > 8192 ||
        /[\r\n]/.test(auth.key)
      )
        throw new IsolationError();
      return {
        profile,
        apiKey: auth.key,
        connectionDigest: zeroCsvHash(
          JSON.stringify([
            preference.id,
            preference.updatedAt.toISOString(),
            preference.credential.id,
            preference.credential.updatedAt.toISOString(),
            secret.id,
            secret.ciphertext,
            auth.key,
          ]),
        ),
      };
    } catch {
      // Secret-store errors and policy details must never escape through a job receipt/log.
      throw new IsolationError("Routing profile unavailable");
    }
  };
}
