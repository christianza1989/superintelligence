import { describe, expect, it } from "vitest";
import { zeroJevExecuteInputSchema } from "./zero-jev-contract.js";
import { zeroJevProfileSchema } from "./zero-jev-profile.js";
import { sourceSelectionOptions } from "./zero-source-selection.js";

const ids = ["frappe/erpnext", "inventree/InvenTree"];
const input = {
  goal: "Stock, repairs, quotes and local roles with SQLite",
  data: "source-selection-v1",
  mode: "select-source",
  candidateIds: ids,
  idempotencyKey: "fixture-plan",
  deadline: "2099-01-01T00:00:00Z",
};
describe("source-only Jev planning boundary", () => {
  it("supplies pinned reviewed modules, setup and gaps instead of host-provided descriptions", () => {
    const options = sourceSelectionOptions(ids, ids);
    expect(options).toHaveLength(2);
    for (const option of options) {
      expect(option.sourceRevision).toMatch(/^[a-f0-9]{40}$/);
      const facts = JSON.parse(option.capability);
      expect(facts.modules.length).toBeGreaterThan(0);
      expect(facts.gaps.length).toBeGreaterThan(0);
      expect(facts.setup.length).toBeGreaterThan(0);
      expect(
        facts.reviewedFiles.every((file: { sha256: string }) =>
          /^[a-f0-9]{64}$/.test(file.sha256),
        ),
      ).toBe(true);
      expect(facts.evidence).toContain("not runtime-tested");
      expect(option.capability.length).toBeLessThanOrEqual(6000);
    }
    expect(options[0]!.capability).toContain("not standalone SQLite");
  });
  it.each(
    [[], [ids[0]!, ids[0]!], ["unknown/unknown"]].map((shortlist) => ({
      shortlist,
    })),
  )("rejects invalid or unknown shortlist $shortlist", ({ shortlist }) => {
    expect(() => sourceSelectionOptions(shortlist, ids)).toThrow();
  });
  it("requires an operator allowlist independently of available catalog data", () => {
    expect(() => sourceSelectionOptions(ids, [ids[0]!])).toThrow(
      "source_selection_not_authorized",
    );
    expect(() => sourceSelectionOptions(ids, [])).toThrow(
      "source_selection_not_authorized",
    );
  });
  it("accepts only canonical IDs and the fixed planning marker, never project file bytes", () => {
    expect(zeroJevExecuteInputSchema.safeParse(input).success).toBe(true);
    for (const patch of [
      { candidateIds: [] },
      { candidateIds: [ids[0], ids[0]] },
      { candidateIds: ["https://example.invalid/repo"] },
      { candidateIds: undefined },
      { data: "PRIVATE_PROJECT_DATA" },
      { mode: "prepare-component" },
      { payerAccountId: "foreign" },
    ])
      expect(
        zeroJevExecuteInputSchema.safeParse({ ...input, ...patch }).success,
      ).toBe(false);
  });
  it("can grant source recommendations without granting tool execution", () => {
    const profile = {
      revision: "fixture",
      credentialId: "fixture",
      model: "fixture/jev",
      payerAccountId: "fixture-payer",
      lane: "routing",
      reserveUsdMicros: "10000",
      reserveTokens: "10000",
      timeoutMs: 1000,
      expiresAt: input.deadline,
      enabled: true,
      allowTaskDataToOpenRouter: true,
      tools: [],
      sourceRepositories: ids,
    };
    expect(zeroJevProfileSchema.safeParse(profile).success).toBe(true);
    expect(
      zeroJevProfileSchema.safeParse({
        ...profile,
        sourceRepositories: undefined,
      }).success,
    ).toBe(false);
  });
});
