import { describe, expect, it } from "vitest";
import { preparedProfiles, searchRepositories } from "@rakazo/core/repositoryzero";
import { repositorySearchFromTool, repositorySearchTool } from "./zero-repository-tools.js";

describe("agent reuse discovery", () => {
  it("exposes an explicitly read-only source search and never upgrades candidates", () => {
    expect(repositorySearchTool.readOnly).toBe(true);
    const result = repositorySearchFromTool({ query: "elie222/rakazo" });
    expect(result.status).toBe("source_candidates");
    expect(result.preparedProfiles).toEqual([]);
    expect(result.candidates?.[0]).toMatchObject({
      repository: "elie222/rakazo",
      licenseApproved: false,
      runtimeTested: false,
    });
  });
  it("bounds the prompt result and returns missing or invalid without a network fallback", () => {
    expect(repositorySearchFromTool({ query: "agent" }).candidates?.length).toBeLessThanOrEqual(5);
    expect(repositorySearchFromTool({ query: "no-such-repository-8364781" }).status).toBe(
      "missing",
    );
    expect(repositorySearchFromTool({ query: "" })).toHaveProperty("error");
    expect(repositorySearchFromTool({ query: "x", category: "admin-access" })).toHaveProperty(
      "error",
    );
  });
  it("discovers the scoped preparer while preserving frozen source-only CSV no-fit", () => {
    const result = repositorySearchFromTool({ query: "CSV parser" });
    expect(result.status).toBe("prepared_profiles");
    expect(result.preparedProfiles).toEqual(preparedProfiles);
    expect(result.candidates).toEqual([]);
    expect(searchRepositories({ query: "CSV parser" })).toEqual([]);
    expect(result.preparedProfiles?.[0]?.conformance.holdout).toBe("NOT_RUN");
    expect(result.preparedProfiles?.[0]).not.toHaveProperty("candidateId");
    expect(result.preparedProfiles?.[0]).not.toHaveProperty("runtimeTested");
    expect(result.preparedProfiles?.[0]).not.toHaveProperty("licenseApproved");
    expect(result.evaluation).toMatch(/No installation or execution grant/u);
  });
  it.each(["CSV TSV", "CSV windows", "CSV OCR", "approved license CSV", "CSV unknown"])(
    "does not drop unsupported constraints to suggest the only preparer: %s", (query) => {
      expect(repositorySearchFromTool({ query })).toMatchObject({
        status: "missing", preparedProfiles: [], candidates: [],
      });
    },
  );
  it("keeps category filters binding for prepared matches", () => {
    expect(repositorySearchFromTool({ query: "CSV parser", category: "documents" })).toMatchObject({
      status: "missing", preparedProfiles: [], candidates: [],
    });
  });
});
