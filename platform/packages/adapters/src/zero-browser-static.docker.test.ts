import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ZERO_BROWSER_STATIC_PROFILE,
  zeroBrowserHash,
  zeroBrowserRequestSchema,
} from "./zero-browser-contract.js";
import { ZERO_BROWSER_STATIC_FIXTURES } from "./zero-browser-static-fixtures.js";
import { executeZeroBrowser } from "./zero-browser-static-runtime.js";

// Literal rendered hashes frozen before epoch 3 Chromium execution.
const expectedRenderedHashes: Record<string, string> = {
  article: "ae631a1692bdb73126f6b60a0f8d1bc3595dc6233da0b3302e42bd1c7deb12d3",
  catalog: "7bcd2c22f740605cb6b91de507e9440639e47fd1a4a69da31da92cb2601ea1fa",
  table: "541c88fd0d0ac7e33b17b2ecb0da38044bbb87c52747083af9420b51f05e508c",
  unicode: "3ea138d6420ff1bd795cda0be57836d40c5fb9ec596ceec13dab072a8add6268",
  contact: "d1a9efb25bb3dc000819841948daa0ca7ad9f0ff253d080f7b59dcb700d0578e",
  hidden: "38eae9e64fea63a5a736b7742c809182bfab47bcc8c26f408a0527fb19d46c08",
  scripts: "0e07adccf3d764efd3c8f7799540115127f66cb72f47f885335df677827f4b20",
  network: "c4bbc9342dae8e89b5b144be63192237fb1ae227f911845ac9d9a618dac4a5eb",
  entities: "89689647f07ad2d3d4ca0cda6ac4689f8f8605a2c617ff7d5072c1c7af3be2b1",
  headings: "d57ce7080548c35f035522559deb6bf64a6003bf7e824db5fb06f0beae89d1e7",
};

const enabled =
  process.env.VERIFY_ZERO_STATIC_BROWSER_DOCKER === "1" &&
  process.env.ZERO_STATIC_BROWSER_IMAGE_ID &&
  process.env.ZERO_STATIC_BROWSER_LOCK_SHA256;
(enabled ? describe.sequential : describe.skip)(
  "static operator-input browser, separate Docker cohort",
  () => {
    let directory: string;
    beforeAll(async () => {
      directory = await mkdtemp("/tmp/zero-static-cohort-");
    });
    afterAll(async () => {
      if (directory) await rm(directory, { recursive: true });
    });
    it.each(ZERO_BROWSER_STATIC_FIXTURES)("extracts actual static HTML: $id", async (fixture) => {
      const bytes = Buffer.from(fixture.html);
      const request = {
        kind: "zero.browser.request.v1",
        principal: {
          spaceId: "fixture-space",
          userId: "fixture-user",
          scopeId: "fixture-scope",
          policyRevision: "fixture-revision",
          expiresAt: new Date(Date.now() + 120_000).toISOString(),
        },
        fileId: `operator-${randomUUID()}`,
        source: { artifactId: randomUUID(), bytes: bytes.length, sha256: zeroBrowserHash(bytes) },
        profile: ZERO_BROWSER_STATIC_PROFILE,
        imageId: process.env.ZERO_STATIC_BROWSER_IMAGE_ID!,
        buildInputLockSha256: process.env.ZERO_STATIC_BROWSER_LOCK_SHA256!,
        deadline: new Date(Date.now() + 60_000).toISOString(),
      };
      const result = await executeZeroBrowser(
        {
          dockerExecutable: "/usr/bin/docker",
          dockerConfigDirectory: directory,
          imageId: request.imageId,
          buildInputLockSha256: request.buildInputLockSha256,
        },
        {
          request: zeroBrowserRequestSchema.parse(request),
          requestDigest: zeroBrowserHash(JSON.stringify(zeroBrowserRequestSchema.parse(request))),
          bytes,
        },
        new AbortController().signal,
      );
      expect(result.state).toBe("succeeded");
      if (result.state !== "succeeded") return;
      expect(result.output.sourceSha256).toBe(request.source.sha256);
      expect(result.output.renderedSha256).toBe(expectedRenderedHashes[fixture.id]);
      expect(result.output.renderedSha256).not.toBe(result.output.sourceSha256);
      expect(result.output.rendering).toEqual({
        policy: "inert-static-v1",
        removedElements: fixture.id === "network" ? 2 : fixture.id === "scripts" ? 1 : 0,
        removedAttributes: 0,
        inertLinks: 1,
      });
      expect(result.output.title).toBe(fixture.title);
      expect(result.output.headings).toContainEqual({ level: 1, text: fixture.heading });
      expect(result.output.visibleText).toContain(fixture.text);
      expect(result.output.links.some((link) => link.href === fixture.link)).toBe(true);
      if ("absent" in fixture) expect(result.output.visibleText).not.toContain(fixture.absent);
      expect(result.output.actualUse).toEqual({ provider: "computer", navigate: 1, snapshot: 1 });
      const png = Buffer.from(result.output.screenshot.contentBase64, "base64");
      expect(png.length).toBe(result.output.screenshot.bytes);
      expect(createHash("sha256").update(png).digest("hex")).toBe(result.output.screenshot.sha256);
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(png.readUInt32BE(16)).toBe(1280);
      expect(png.readUInt32BE(20)).toBe(720);
    });
  },
);
