import { mkdtemp, readFile, rm } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createZeroCsvApplicationWorkspace } from "./zero-csv-application.js";
import { prepareZeroCsvComponent, zeroCsvHash } from "./zero-csv-profile.js";
import type { ZeroCsvApplicationVerifierConfig } from "./zero-csv-application-verifier.js";
import { verifyZeroCsvApplication } from "./zero-csv-application-verifier.js";
const capture = vi.hoisted(() => vi.fn());
vi.mock("./zero-docker-process.js", () => ({ captureZeroDockerProcess: capture }));
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  capture.mockReset();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp("/tmp/zero-expense-verifier-");
  roots.push(root);
  const csv = "category,amount\nTravel,1.00\n";
  const attribution = {
    license: await readFile(new URL("../../../../LICENSE", import.meta.url), "utf8"),
    notice: await readFile(new URL("../../../../NOTICE", import.meta.url), "utf8"),
  };
  const workspace = createZeroCsvApplicationWorkspace(
    csv,
    await prepareZeroCsvComponent(),
    attribution,
  );
  const config: ZeroCsvApplicationVerifierConfig = {
    dockerExecutable: "/usr/bin/docker",
    dockerConfigDirectory: root,
    imageId: "sha256:" + "a".repeat(64),
    buildInputLockSha256: "b".repeat(64),
    attribution,
  };
  const originalImage = config.imageId,
    originalLock = config.buildInputLockSha256;
  capture.mockImplementation(
    async (_executable: string, args: string[], _config: string, stdin: string) => {
      if (args[0] === "image") return { code: 0, stdout: originalImage + " " + originalLock };
      if (args[0] !== "run") return { code: 0, stdout: "" };
      const payload = JSON.parse(stdin);
      const png = Buffer.from("89504e470d0a1a0a", "hex");
      return {
        code: 0,
        stdout: JSON.stringify({
          nonce: payload.nonce,
          manifestSha256: payload.manifestSha256,
          inputSha256: payload.inputSha256,
          build: { kind: "native-esm-no-install", modules: 4, outcome: "pass" },
          checks: Array.from({ length: 20 }, (_, i) => ({
            name: "mock-unit-control-" + i,
            passed: true,
          })),
          screenshots: ["desktop", "mobile"].map((viewport) => ({
            viewport,
            mimeType: "image/png",
            bytes: png.length,
            sha256: zeroCsvHash(png),
            contentBase64: png.toString("base64"),
          })),
          actualUse: {
            scope: "fixed-source-module-import-boundary",
            entrypoint: "csvParseRows",
            calls: Array.from({ length: 4 }, () => ({
              inputSha256: "a".repeat(64),
              outputSha256: "b".repeat(64),
            })),
          },
          runtime: {
            node: "24.22.0",
            chromium: "153.0.8010.12",
            networkAttempts: 0,
            pageErrors: 0,
          },
          limitations: ["Mocked transport unit control; not execution evidence"],
        }),
      };
    },
  );
  return { config, csv, workspace, originalImage, originalLock };
}
describe.skipIf(process.platform !== "linux")("expense verifier dispatch boundaries", () => {
  it("inspects, dispatches and receipts the same captured image even when the caller mutates config at authorization", async () => {
    const f = await fixture();
    const originalDirectory = f.config.dockerConfigDirectory;
    f.config.beforeDispatch = async () => {
      f.config.imageId = "sha256:" + "c".repeat(64);
      f.config.buildInputLockSha256 = "d".repeat(64);
      f.config.dockerExecutable = "/not-approved/docker";
      f.config.dockerConfigDirectory = "/not-approved/config";
      f.config.attribution.license = "replaced";
      f.config.attribution.notice = "replaced";
    };
    const result = await verifyZeroCsvApplication(
      f.config,
      { csv: f.csv, workspace: f.workspace },
      new AbortController().signal,
    );
    expect(result.outcome).toBe("pass");
    if (result.outcome !== "pass") throw Error("Expected mocked verification");
    expect(result.imageId).toBe(f.originalImage);
    expect(result.buildInputLockSha256).toBe(f.originalLock);
    const inspect = capture.mock.calls.find(([, args]) => args[0] === "image")!;
    const run = capture.mock.calls.find(([, args]) => args[0] === "run")!;
    expect(inspect[1]).toContain(f.originalImage);
    expect(run[1]).toContain(f.originalImage);
    expect(run[1]).not.toContain(f.config.imageId);
    for (const call of capture.mock.calls) {
      expect(call[0]).toBe("/usr/bin/docker");
      expect(call[2]).toBe(originalDirectory);
    }
  });
  it.each(["cancel", "deadline"])(
    "bounds a never-resolving authorization callback on %s without Docker dispatch",
    async (kind) => {
      const f = await fixture();
      const controller = new AbortController(),
        deadline = new AbortController();
      if (kind === "deadline") vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
      let entered!: () => void;
      const callbackEntered = new Promise<void>((resolve) => {
        entered = resolve;
      });
      f.config.beforeDispatch = () => {
        entered();
        return new Promise<void>(() => undefined);
      };
      const pending = verifyZeroCsvApplication(
        f.config,
        { csv: f.csv, workspace: f.workspace },
        controller.signal,
      );
      await callbackEntered;
      if (kind === "cancel") controller.abort();
      else deadline.abort(new DOMException("Deadline elapsed", "TimeoutError"));
      const result = await pending;
      expect(result).toMatchObject({
        outcome: kind === "cancel" ? "cancelled" : "fail",
        cleanup: "not_started",
      });
      expect(capture.mock.calls.some(([, args]) => args[0] === "run")).toBe(false);
    },
  );
});
