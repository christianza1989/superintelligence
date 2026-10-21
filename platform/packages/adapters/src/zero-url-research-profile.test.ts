import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ZERO_URL_RESEARCH_LIMITS,
  ZERO_URL_RESEARCH_MODE,
  ZERO_URL_RESEARCH_PROFILE,
  zeroUrlResearchSubmitSchema,
} from "./zero-url-research-profile.js";
describe("standalone URL research profile", () => {
  const valid = { taskId: "research_1", idempotencyKey: "once", deadline: "2030-01-01T00:00:00Z" };
  it("keeps bounded profile metadata and the strict task submission shape", () => {
    expect(ZERO_URL_RESEARCH_PROFILE).toBe("zero-url-research-v1");
    expect(ZERO_URL_RESEARCH_MODE).toBe("safe-http-fetch+inert-snapshot");
    expect(ZERO_URL_RESEARCH_LIMITS).toMatchObject({
      paidModelCalls: 0,
      redirects: 0,
      sourceBytes: 16384,
    });
    expect(zeroUrlResearchSubmitSchema.parse(valid)).toEqual(valid);
  });
  it.each([
    { ...valid, taskId: "../outside" },
    { ...valid, fileId: "file" },
    { ...valid, deadline: "tomorrow" },
    { ...valid, url: "https://example.invalid/" },
    { ...valid, idempotencyKey: "" },
  ])("rejects input outside the approved task contract", (input) => {
    expect(zeroUrlResearchSubmitSchema.safeParse(input).success).toBe(false);
  });
  it("imports only Zod so standalone tools cannot load backend or network adapters", () => {
    const source = readFileSync(new URL("./zero-url-research-profile.ts", import.meta.url), "utf8");
    expect([...source.matchAll(/from ["']([^"']+)["']/gu)].map((match) => match[1])).toEqual([
      "zod",
    ]);
  });
});
