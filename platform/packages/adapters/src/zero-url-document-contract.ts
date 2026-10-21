import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";

export const ZERO_URL_DOCUMENT_PROFILE = "zero-url-captured-document-v1" as const;
export const ZERO_URL_DOCUMENT_MODE = "original-url-captured-response-replay" as const;
export const ZERO_URL_DOCUMENT_LIMITS = Object.freeze({
  sourceBytes: 16_384,
  runnerBytes: 2_097_152,
  capsuleBytes: 3_145_728,
  outputBytes: 2_097_152,
  screenshotBytes: 1_048_576,
  scratchFileBytes: 16_777_216,
  textBytes: 65_536,
  answerBytes: 4096,
  runtimeMs: 30_000,
  browserMs: 15_000,
  cleanupMs: 3000,
  memoryMiB: 512,
  cpus: 1,
  pids: 128,
  width: 1280,
  height: 720,
  deviceScaleFactor: 1,
});
export const ZERO_URL_DOCUMENT_CSP =
  "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
export const urlDocumentHash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const base64 = z
  .string()
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u);
/** Syntax boundary only: the outer scoped fetch still owns exact grants, DNS and SSRF checks. */
export function isUrlDocumentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      value.length <= 2048 &&
      url.href === value &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      ![...value].some(
        (character) =>
          character === "\\" || character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
      ) &&
      !isIP(url.hostname) &&
      /^[a-z0-9.-]+$/u.test(url.hostname) &&
      url.hostname.includes(".") &&
      url.hostname.length <= 253 &&
      url.hostname
        .split(".")
        .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)) &&
      !/(?:^|\.)(?:localhost|local|internal|lan|home)$/u.test(url.hostname)
    );
  } catch {
    return false;
  }
}
const url = z.string().refine(isUrlDocumentUrl);
export const zeroUrlDocumentSourceSchema = z
  .object({
    url,
    sha256: hash,
    bytes: z.number().int().min(1).max(ZERO_URL_DOCUMENT_LIMITS.sourceBytes),
  })
  .strict();
/** Internal sealed transport. Public requests never contain runner code, argv or headers. */
export const zeroUrlDocumentPayloadSchema = z
  .object({
    profile: z.literal(ZERO_URL_DOCUMENT_PROFILE),
    nonce: z.string().uuid(),
    source: zeroUrlDocumentSourceSchema,
    contentBase64: base64.max(4 * Math.ceil(ZERO_URL_DOCUMENT_LIMITS.sourceBytes / 3)),
  })
  .strict()
  .superRefine((value, context) => {
    const bytes = Buffer.from(value.contentBase64, "base64");
    if (
      bytes.toString("base64") !== value.contentBase64 ||
      bytes.length !== value.source.bytes ||
      urlDocumentHash(bytes) !== value.source.sha256
    )
      context.addIssue({ code: "custom", message: "Invalid captured document integrity" });
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      context.addIssue({ code: "custom", message: "UTF-8 document required" });
    }
  });
export type ZeroUrlDocumentPayload = z.infer<typeof zeroUrlDocumentPayloadSchema>;
export const zeroUrlDocumentOutputSchema = z
  .object({
    profile: z.literal(ZERO_URL_DOCUMENT_PROFILE),
    mode: z.literal(ZERO_URL_DOCUMENT_MODE),
    nonce: z.string().uuid(),
    source: zeroUrlDocumentSourceSchema,
    navigation: z
      .object({
        requestedUrl: url,
        responseUrl: url,
        finalUrl: url,
        status: z.literal(200),
        method: z.literal("GET"),
        topFrame: z.literal(true),
        fulfilledBodySha256: hash,
        fulfilledBodyBytes: z.number().int().min(1).max(ZERO_URL_DOCUMENT_LIMITS.sourceBytes),
        contentType: z.literal("text/html; charset=utf-8"),
        csp: z.literal(ZERO_URL_DOCUMENT_CSP),
      })
      .strict(),
    documentSha256: hash,
    title: z.string().max(512),
    visibleText: z
      .string()
      .refine((value) => Buffer.byteLength(value) <= ZERO_URL_DOCUMENT_LIMITS.textBytes),
    answer: z
      .object({
        kind: z.literal("first-visible-paragraph"),
        selector: z.literal("p"),
        visibleIndex: z.literal(0),
        sourceUrl: url,
        quote: z
          .string()
          .min(1)
          .refine((value) => Buffer.byteLength(value) <= ZERO_URL_DOCUMENT_LIMITS.answerBytes),
      })
      .strict(),
    screenshot: z
      .object({
        mimeType: z.literal("image/png"),
        encoding: z.literal("base64"),
        bytes: z.number().int().min(24).max(ZERO_URL_DOCUMENT_LIMITS.screenshotBytes),
        sha256: hash,
        contentBase64: base64.max(4 * Math.ceil(ZERO_URL_DOCUMENT_LIMITS.screenshotBytes / 3)),
      })
      .strict(),
    actualUse: z
      .object({
        provider: z.literal("computer"),
        navigate: z.literal(1),
        snapshot: z.literal(1),
        documentRequests: z.literal(1),
        fulfilledDocuments: z.literal(1),
        unexpectedRequests: z.literal(0),
        unexpectedNavigations: z.literal(0),
        externalEffects: z.literal(0),
      })
      .strict(),
    runtime: z
      .object({
        node: z.literal("24.22.0"),
        playwright: z.literal("1.63.0"),
        chromium: z.literal("153.0.8010.12"),
        javaScriptEnabled: z.literal(false),
        serviceWorkers: z.literal("block"),
        width: z.literal(1280),
        height: z.literal(720),
        deviceScaleFactor: z.literal(1),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const nav = value.navigation,
      png = Buffer.from(value.screenshot.contentBase64, "base64");
    if (
      [nav.requestedUrl, nav.responseUrl, nav.finalUrl, value.answer.sourceUrl].some(
        (url) => url !== value.source.url,
      ) ||
      nav.fulfilledBodySha256 !== value.source.sha256 ||
      nav.fulfilledBodyBytes !== value.source.bytes ||
      !value.visibleText.includes(value.answer.quote) ||
      png.toString("base64") !== value.screenshot.contentBase64 ||
      png.length !== value.screenshot.bytes ||
      urlDocumentHash(png) !== value.screenshot.sha256 ||
      png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      png.length < 24 ||
      png.subarray(12, 16).toString() !== "IHDR" ||
      png.readUInt32BE(16) !== 1280 ||
      png.readUInt32BE(20) !== 720
    )
      context.addIssue({ code: "custom", message: "Invalid URL document evidence" });
  });
export type ZeroUrlDocumentOutput = z.infer<typeof zeroUrlDocumentOutputSchema>;

/** One exact original document, never a resource, redirect or caller-selected action. */
export function admitsUrlDocumentNavigation(
  expectedUrl: string,
  request: {
    url: string;
    method: string;
    resourceType: string;
    navigation: boolean;
    topFrame: boolean;
    redirected: boolean;
    credentialHeaders: boolean;
  },
  consumed: boolean,
): boolean {
  return (
    !consumed &&
    isUrlDocumentUrl(expectedUrl) &&
    request.url === expectedUrl &&
    request.method === "GET" &&
    request.resourceType === "document" &&
    request.navigation &&
    request.topFrame &&
    !request.redirected &&
    !request.credentialHeaders
  );
}
