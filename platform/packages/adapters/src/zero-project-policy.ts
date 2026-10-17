import path from "node:path";
import type { Actor } from "@rakazo/contracts";
import { IsolationError } from "@rakazo/db";
import { z } from "zod";
import { ZERO_BROWSER_STATIC_PROFILE } from "./zero-browser-contract.js";
import type { ZeroBrowserBinding, ZeroPdfBinding } from "./zero-component-services.js";
import type { ZeroCsvPrincipal } from "./zero-csv-preparation.js";
import type { ZeroCsvProjectVerifierConfig } from "./zero-csv-project-verifier.js";
import { ZERO_CSV_PROJECT_FILES, ZERO_CSV_PROJECT_LIMITS } from "./zero-csv-project-verifier.js";
import { zeroJevProfileSchema } from "./zero-jev-profile.js";
import { readZeroOperatorFile as readOperatorFile } from "./zero-operator-file.js";
import { ZERO_PDF_PROFILE } from "./zero-pdf-contract.js";

export const ZERO_PROJECT_POLICY_LIMITS = Object.freeze({ bytes: 65_536, grants: 64 });
const principalSchema = z
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
const operatorPath = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (value) =>
      path.posix.isAbsolute(value) &&
      path.posix.normalize(value) === value &&
      value !== "/" &&
      value !== "/mnt" &&
      !value.startsWith("/mnt/") &&
      ![...value].some((character) => character.charCodeAt(0) < 32) &&
      !value.includes(","),
  );
const verificationSchema = z
  .object({
    profile: z.literal("zero-csv-project-v1"),
    projectRoot: operatorPath,
    stagingRoot: operatorPath,
    dockerExecutable: operatorPath,
    imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    limits: z
      .object({
        maxFiles: z.literal(5),
        maxFileBytes: z.number().int().min(1).max(131_072),
        maxTotalBytes: z.number().int().min(1).max(ZERO_CSV_PROJECT_LIMITS.sourceBytes),
      })
      .strict(),
  })
  .strict();
const fileId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/u);
const files = z
  .array(
    z
      .object({
        fileId,
        path: z
          .string()
          .min(1)
          .max(1024)
          .refine(
            (value) =>
              !path.posix.isAbsolute(value) &&
              !/[\\:%]/u.test(value) &&
              value
                .split("/")
                .every((segment) => segment !== "" && segment !== "." && segment !== ".."),
          ),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
      })
      .strict(),
  )
  .min(1)
  .max(10)
  .refine((items) => new Set(items.map((item) => item.fileId)).size === items.length);
const pdfSchema = z
  .object({
    profile: z.literal(ZERO_PDF_PROFILE),
    projectRoot: operatorPath,
    stagingRoot: operatorPath,
    bundleDirectory: operatorPath,
    files,
  })
  .strict();
const browserSchema = z
  .object({
    profile: z.literal(ZERO_BROWSER_STATIC_PROFILE),
    projectRoot: operatorPath,
    stagingRoot: operatorPath,
    dockerExecutable: operatorPath,
    dockerConfigDirectory: operatorPath,
    imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    buildInputLockSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    files,
  })
  .strict();
const grantSchema = principalSchema
  .extend({
    verification: verificationSchema.optional(),
    jev: zeroJevProfileSchema.optional(),
    pdf: pdfSchema.optional(),
    browser: browserSchema.optional(),
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

/** Compatibility boundary: policy consumers retain the IsolationError subclass. */
export async function readZeroOperatorFile(
  file: string,
  maxBytes: number = ZERO_PROJECT_POLICY_LIMITS.bytes,
): Promise<Uint8Array> {
  try {
    return await readOperatorFile(file, maxBytes);
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
  const checkedGrant = async (principal: ZeroCsvPrincipal) => {
    const parsed = principalSchema.safeParse(principal);
    if (!parsed.success) throw new ZeroProjectPolicyError();
    const checked = parsed.data;
    const current = await find(checked);
    if (fields.some((field) => checked[field] !== current[field]))
      throw new ZeroProjectPolicyError();
    return current;
  };
  return {
    async resolve(
      actor: Pick<Actor, "spaceId" | "userId">,
      scopeId: string,
    ): Promise<ZeroCsvPrincipal> {
      const current = await find({ spaceId: actor.spaceId, userId: actor.userId, scopeId });
      return principalSchema.parse(
        Object.fromEntries(fields.map((field) => [field, current[field]])),
      );
    },
    async authorize(principal: ZeroCsvPrincipal): Promise<void> {
      await checkedGrant(principal);
    },
    async resolveVerifier(
      principal: ZeroCsvPrincipal,
    ): Promise<ZeroCsvProjectVerifierConfig | undefined> {
      const grant = await checkedGrant(principal);
      if (!grant.verification) return undefined;
      const verification = grant.verification;
      return {
        dockerExecutable: verification.dockerExecutable,
        imageId: verification.imageId,
        snapshot: {
          scopeId: grant.scopeId,
          projectRoot: verification.projectRoot,
          stagingRoot: verification.stagingRoot,
          allowedFiles: [...ZERO_CSV_PROJECT_FILES],
          limits: { ...verification.limits },
        },
      };
    },
    async resolveJev(principal: ZeroCsvPrincipal) {
      const grant = await checkedGrant(principal);
      if (!grant.jev || Date.parse(grant.jev.expiresAt) <= Date.now())
        throw new ZeroProjectPolicyError();
      return grant.jev;
    },
    async resolvePdf(principal: ZeroCsvPrincipal): Promise<ZeroPdfBinding | undefined> {
      const grant = await checkedGrant(principal);
      return grant.pdf
        ? {
            snapshot: { projectRoot: grant.pdf.projectRoot, stagingRoot: grant.pdf.stagingRoot },
            files: grant.pdf.files,
            runtime: { bundleDirectory: grant.pdf.bundleDirectory },
          }
        : undefined;
    },
    async resolveBrowser(principal: ZeroCsvPrincipal): Promise<ZeroBrowserBinding | undefined> {
      const grant = await checkedGrant(principal);
      return grant.browser
        ? {
            snapshot: {
              projectRoot: grant.browser.projectRoot,
              stagingRoot: grant.browser.stagingRoot,
            },
            files: grant.browser.files,
            runtime: {
              dockerExecutable: grant.browser.dockerExecutable,
              dockerConfigDirectory: grant.browser.dockerConfigDirectory,
              imageId: grant.browser.imageId,
              buildInputLockSha256: grant.browser.buildInputLockSha256,
            },
          }
        : undefined;
    },
  };
}

/** Unset stays disabled. An invalid configured file fails closed when an operation checks it. */
export function zeroProjectPolicyFromEnv(env: { ZERO_PROJECT_POLICY_FILE?: string } = process.env) {
  return env.ZERO_PROJECT_POLICY_FILE
    ? createZeroProjectPolicy(env.ZERO_PROJECT_POLICY_FILE)
    : undefined;
}
