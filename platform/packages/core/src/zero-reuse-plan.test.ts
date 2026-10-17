import { describe, expect, it } from "vitest";
import {
  createRepositoryReusePlan,
  InvalidRepositoryReusePlan,
} from "./zero-reuse-plan.js";
import catalog from "./zero-catalog-data.json" with { type: "json" };

describe("repository reuse planning handoff", () => {
  it.each(["foundation", "component", "reference"] as const)(
    "derives bounded canonical facts for the %s role without granting execution",
    (role) => {
      const plan = createRepositoryReusePlan({
        candidateId: "KDE/krita",
        role,
        brief: "  Build a local image workflow.  ",
      });
      const canonical = catalog.records.find(
        (entry) => entry.repository === "KDE/krita",
      )!;
      expect(plan).toMatchObject({
        planningOnly: true,
        requestedRole: role,
        brief: "Build a local image workflow.",
        sourceFacts: {
          repository: canonical.repository,
          revision: canonical.sourceRevision,
          licenseApproved: false,
          runtimeTested: false,
        },
      });
      expect(plan.datedMetadata?.sourcePin.status).toBe("present");
      expect(
        new TextEncoder().encode(JSON.stringify(plan)).byteLength,
      ).toBeLessThan(16384);
      expect(plan.nextStep).toContain("grants no");
      expect(plan.trust).toContain("untrusted data");
    },
  );
  it("refuses unknown canonical identities, unsupported roles and empty or excessive briefs", () => {
    const valid = {
      candidateId: "KDE/krita",
      role: "reference" as const,
      brief: "A small project.",
    };
    for (const changed of [
      { candidateId: "missing/repository" },
      { candidateId: "kde/KRITA" },
      { role: "execute" as never },
      { brief: " " },
      { brief: "x".repeat(2001) },
    ])
      expect(() => createRepositoryReusePlan({ ...valid, ...changed })).toThrow(
        InvalidRepositoryReusePlan,
      );
  });
  it("retains source-only and identity-conflict evidence instead of silently changing a selection", () => {
    const plan = createRepositoryReusePlan({
      candidateId: "get-convex/agent",
      role: "component",
      brief: "Investigate an agent component.",
    });
    expect(plan.sourceFacts.repository).toBe("get-convex/agent");
    expect(plan.datedMetadata).toMatchObject({
      githubStatus: "identity-conflict",
      resolvedRepository: "convex/agent",
      sourcePin: { status: "not-checked" },
    });
    expect(plan.sourceFacts.runtimeTested).toBe(false);
  });
});
