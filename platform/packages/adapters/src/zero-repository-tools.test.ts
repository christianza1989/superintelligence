import { describe, expect, it } from "vitest";
import { repositorySearchFromTool, repositorySearchTool } from "./zero-repository-tools.js";

describe("agent reuse discovery", () => {
  it("exposes an explicitly read-only source search and never upgrades candidates", () => {
    expect(repositorySearchTool.readOnly).toBe(true);
    const result = repositorySearchFromTool({ query: "elie222/rakazo" });
    expect(result.status).toBe("source_candidates");
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
});
