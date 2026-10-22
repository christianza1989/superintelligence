import { describe, expect, it } from "vitest";
import { repositorySnapshot, searchRepositories } from "./zero-catalog.js";
import { discoverSourceProfiles, getSourceProfile, sourceProfiles } from "./zero-source-profiles.js";

describe("reviewed source-slice recall", () => {
  it("finds actual code areas inside a broader application need and retains the gaps", () => {
    const matches = discoverSourceProfiles("Local repair shop inventory, customer quotations, roles and technician labor");
    const erp = matches.find((match) => match.profile.repository === "frappe/erpnext")!;
    expect(erp.matchedModules.map((module) => module.id)).toEqual(expect.arrayContaining(["stock-entry", "asset-repair", "quotation"]));
    expect(erp.unmatchedTerms).toEqual(expect.arrayContaining(["technician", "labor"]));
    expect(erp.profile.gaps.length).toBeGreaterThan(0);
    expect(erp.profile).toMatchObject({ prepared: false, runtimeTested: false, licenseApproved: false });
  });

  it("recalls bilingual concrete capabilities without depending on an application name", () => {
    const matches = discoverSourceProfiles("Remonto ir sandeliu atsargos, dalys, klientu samatos");
    expect(matches.some((match) => match.profile.repository === "frappe/erpnext")).toBe(true);
    expect(matches.some((match) => match.profile.repository === "inventree/InvenTree")).toBe(true);
    expect(discoverSourceProfiles("RepairDesk")).toEqual([]);
    expect(discoverSourceProfiles("a web application with local data")).toEqual([]);
  });

  it.each(["runtime-tested inventory", "inventory with approved license", "inventory for Windows", "inventory for macOS"])(
    "does not convert source slices into unknown hard qualifications: %s", (query) => {
      expect(discoverSourceProfiles(query)).toEqual([]);
    },
  );

  it("preserves the historical snapshot, strict no-fit and explicit category filters", () => {
    const before = JSON.stringify(repositorySnapshot);
    expect(searchRepositories({ query: "image editor without accounts" })).toEqual([]);
    expect(discoverSourceProfiles("inventory", "audio")).toEqual([]);
    expect(discoverSourceProfiles("quasar-unknown-83742")).toEqual([]);
    expect(discoverSourceProfiles("x".repeat(2049))).toEqual([]);
    expect(getSourceProfile("../../etc/passwd")).toBeUndefined();
    expect(JSON.stringify(repositorySnapshot)).toBe(before);
    expect(repositorySnapshot.records).toHaveLength(796);
  });

  it("carries exact reviewed file pins and a license file without inventing runtime readiness", () => {
    expect(sourceProfiles).toHaveLength(3);
    expect(sourceProfiles.reduce((count, profile) => count + profile.sourceFiles.length, 0)).toBe(13);
    for (const profile of sourceProfiles) {
      expect(profile.sourceRevision).toMatch(/^[a-f0-9]{40}$/u);
      expect(profile.sourceFiles.some((file) => /license/i.test(file.path))).toBe(true);
      for (const module of profile.modules)
        expect(profile.sourceFiles.some((file) => file.path === module.path)).toBe(true);
      for (const file of profile.sourceFiles) {
        expect(file.sha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(file.gitBlobSha).toMatch(/^[a-f0-9]{40}$/u);
        expect(file.source).toContain(`/blob/${profile.sourceRevision}/`);
      }
      expect(profile.prepared || profile.runtimeTested || profile.licenseApproved).toBe(false);
    }
  });
});
