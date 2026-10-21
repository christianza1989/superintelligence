import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  ZERO_CSV_APPLICATION_PROFILE,
  ZERO_CSV_APPLICATION_RECIPE,
  zeroCsvApplicationSubmitSchema,
} from "./zero-csv-application-contract.js";
import { createZeroCsvApplicationWorkspace } from "./zero-csv-application.js";
import { prepareZeroCsvComponent, zeroCsvHash } from "./zero-csv-profile.js";
import { verifyZeroCsvApplication } from "./zero-csv-application-verifier.js";

const seed = "category,amount\r\nTravel,12.50\r\nFood,7.25\r\nTravel,3.00\r\n";
const attribution = async () => ({
  license: await readFile(new URL("../../../../LICENSE", import.meta.url), "utf8"),
  notice: await readFile(new URL("../../../../NOTICE", import.meta.url), "utf8"),
});
async function fixture(csv = seed) {
  const component = await prepareZeroCsvComponent();
  const notices = await attribution();
  return {
    component,
    notices,
    workspace: createZeroCsvApplicationWorkspace(csv, component, notices),
  };
}
describe("fixed expense application recipe", () => {
  it("retains original pinned source, notices and a complete hash-bound native ESM application", async () => {
    const { component, notices, workspace } = await fixture();
    expect(workspace.manifest.profile).toBe(ZERO_CSV_APPLICATION_PROFILE);
    expect(workspace.manifest.inputSha256).toBe(zeroCsvHash(seed));
    expect(workspace.manifestSha256).toBe(zeroCsvHash(JSON.stringify(workspace.manifest)));
    expect(workspace.files).toHaveLength(10);
    expect(workspace.manifest.files.map((file) => file.path)).toEqual(
      workspace.files.map((file) => file.path),
    );
    for (const file of workspace.files) {
      expect(workspace.manifest.files.find((entry) => entry.path === file.path)).toEqual({
        path: file.path,
        bytes: Buffer.byteLength(file.content),
        sha256: zeroCsvHash(file.content),
      });
    }
    for (const original of component.files) {
      expect(
        workspace.files.find((file) => file.path === "vendor/d3-dsv/" + original.path)?.content,
      ).toBe(original.content);
    }
    expect(workspace.files.find((file) => file.path === "LICENSE")?.content).toBe(notices.license);
    expect(workspace.files.find((file) => file.path === "NOTICE")?.content).toContain(
      notices.notice,
    );
    expect(workspace.preview.sandbox).toBe("allow-scripts");
    expect(workspace.preview.origin).toBe("opaque");
    expect(workspace.preview.contentSecurityPolicy).not.toMatch(
      /unsafe-inline|unsafe-eval|https:|http:/u,
    );
    expect(workspace.preview.contentSecurityPolicy).toContain("connect-src 'none'");
  });
  it("escapes a seed containing HTML terminators without changing source input provenance", async () => {
    const csv = 'category,amount,note\nSafe,1.00,"</script><img src=x onerror=alert(1)>"\n';
    const { workspace } = await fixture(csv);
    const html = workspace.files.find((file) => file.path === "index.html")!.content;
    expect(html).not.toContain("</script><img");
    expect(html).toContain("\\u003c/script>");
    expect(workspace.manifest.inputSha256).toBe(zeroCsvHash(csv));
    expect(html.match(/<script type="module">/gu)).toHaveLength(1);
  });
  it("refuses replaced vendor bytes even if a caller recalculates their hash", async () => {
    const { component, notices } = await fixture();
    const changed = structuredClone(component);
    const file = changed.files.find((entry) => entry.path === "src/csv.js")!;
    file.content = "export const csvParseRows = () => [];";
    file.sha256 = zeroCsvHash(file.content);
    expect(() => createZeroCsvApplicationWorkspace(seed, changed, notices)).toThrow(
      "application_source_rejected",
    );
  });
  it("refuses an extra source file or arbitrary component source URL", async () => {
    const { component, notices } = await fixture();
    expect(() =>
      createZeroCsvApplicationWorkspace(
        seed,
        {
          ...component,
          files: [...component.files, { path: "../outside", content: "", sha256: zeroCsvHash("") }],
        },
        notices,
      ),
    ).toThrow("application_source_rejected");
    expect(() =>
      createZeroCsvApplicationWorkspace(
        seed,
        { ...component, source: "https://unapproved.invalid/" },
        notices,
      ),
    ).toThrow("application_source_rejected");
  });
  it.each([
    "name,value\nA,1\n",
    "category,amount,category\nA,1,A\n",
    "category,amount\n",
    "category,amount\nA,1\0\n",
  ])("refuses unsupported seed shape before a workspace is produced", async (csv) => {
    const component = await prepareZeroCsvComponent();
    const notices = await attribution();
    expect(() => createZeroCsvApplicationWorkspace(csv, component, notices)).toThrow();
  });
  it("keeps source-only output distinct from any build or browser verification receipt", async () => {
    const { workspace } = await fixture();
    expect(workspace).not.toHaveProperty("verification");
    expect(workspace).not.toHaveProperty("outcome");
  });
  it("accepts only artifact-bound recipe submissions, with no paths, commands or alternate profile", () => {
    const input = {
      recipe: ZERO_CSV_APPLICATION_RECIPE,
      inputArtifactId: "owned-input",
      expectedInputSha256: "a".repeat(64),
      idempotencyKey: "once",
      deadline: "2030-01-01T00:00:00Z",
    };
    expect(zeroCsvApplicationSubmitSchema.parse(input)).toEqual(input);
    expect(
      zeroCsvApplicationSubmitSchema.safeParse({ ...input, projectRoot: "/outside" }).success,
    ).toBe(false);
    expect(
      zeroCsvApplicationSubmitSchema.safeParse({ ...input, recipe: "general-installer" }).success,
    ).toBe(false);
    expect(
      zeroCsvApplicationSubmitSchema.safeParse({ ...input, command: "anything" }).success,
    ).toBe(false);
  });
  it("redacts pre-dispatch local filesystem failures", async () => {
    const { workspace, notices } = await fixture();
    const result = await verifyZeroCsvApplication(
      {
        dockerExecutable: "/usr/bin/docker",
        dockerConfigDirectory: "/missing-private-application-config",
        imageId: "sha256:" + "a".repeat(64),
        buildInputLockSha256: "b".repeat(64),
        attribution: notices,
      },
      { csv: seed, workspace },
      new AbortController().signal,
    );
    expect(result).toMatchObject({ outcome: "fail", cleanup: "not_started", paidModelCalls: 0 });
    expect(JSON.stringify(result)).not.toContain("missing-private");
  });
});
