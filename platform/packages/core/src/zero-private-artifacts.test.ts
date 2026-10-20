import { describe, expect, it } from "vitest";
import { isZeroPrivateArtifact } from "./zero-private-artifacts.js";
describe("private job artifact namespace", () => {
  it.each([
    "zero-csv-request.json",
    "zero-csv-receipt.json",
    "zero-pdf-input.pdf",
    "zero-browser-input.html",
    "zero-pdf-request.json",
    "zero-pdf-receipt.json",
    "zero-browser-request.json",
    "zero-browser-receipt.json",
    "zero-jev-request.json",
    "zero-jev-receipt.json",
    "zero-research-request.json",
    "zero-research-receipt.json",
    "zero-research-source.html",
  ])("reserves exact internal name %s", (name) =>
    expect(isZeroPrivateArtifact({ name })).toBe(true),
  );
  it.each([
    "zero.csv.request:job",
    "zero.pdf.input:source",
    "zero.browser.receipt:job",
    "zero.jev.request:job",
    "zero.research.source:job",
  ])("reserves internal nonce even if the row is renamed: %s", (clientNonce) =>
    expect(isZeroPrivateArtifact({ name: "innocent.txt", clientNonce })).toBe(true),
  );
  it.each([
    { name: "reuse-plan-example.json", clientNonce: "library-plan-example" },
    { name: "zero-user-notes.json", clientNonce: "zero.library.user-plan" },
    { name: "ordinary.csv", clientNonce: "upload-123" },
    { name: "zero-csv-request.json.backup" },
    { name: "zero-jev-report.txt" },
  ])("preserves user and Library artifact namespace", (artifact) =>
    expect(isZeroPrivateArtifact(artifact)).toBe(false),
  );
  it("rejects case or whitespace aliases of reserved version-allocation names", () =>
    expect(isZeroPrivateArtifact({ name: " ZERO-CSV-RECEIPT.JSON " })).toBe(true));
});
