import { describe, expect, it, vi } from "vitest";
import { captureZeroDockerProcess } from "./zero-docker-process.js";

const run = (source: string, signal = new AbortController().signal, timeout = 2000, cap = 4096) =>
  captureZeroDockerProcess(
    process.execPath,
    ["-e", source],
    "/synthetic-empty-config",
    "",
    signal,
    timeout,
    cap,
  );

describe("trusted bounded Docker child transport", () => {
  it("does not forward a host secret and excludes stderr from returned content", async () => {
    vi.stubEnv("ZERO_SYNTHETIC_PRIVATE_MARKER", "do-not-forward");
    try {
      const result = await run(
        "process.stderr.write('synthetic-diagnostic');process.stdout.write(JSON.stringify(Object.keys(process.env).sort()))",
      );
      expect(result).toEqual({ code: 0, stdout: '["DOCKER_CONFIG","PATH"]' });
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it.each(["stdout", "stderr"])(
    "kills a child that exceeds the combined cap through %s",
    async (stream) => {
      const result = await run(
        `process.${stream}.write('x'.repeat(8192));setInterval(()=>{},1000)`,
        undefined,
        2000,
        1024,
      );
      expect(result.reason).toBe("output_limit_exceeded");
      expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(1024);
    },
  );
  it("terminates a running child at its finite wall deadline", async () => {
    const result = await run(
      "process.stdout.write('ready');setInterval(()=>{},1000)",
      undefined,
      500,
    );
    expect(result).toMatchObject({ reason: "execution_timeout", stdout: "ready" });
  });
  it("terminates a running child when its caller cancels", async () => {
    const result = await run(
      "process.stdout.write('ready');setInterval(()=>{},1000)",
      AbortSignal.timeout(500),
    );
    expect(result).toMatchObject({ reason: "aborted", stdout: "ready" });
  });
  it("does not start an already-cancelled call", async () => {
    expect(await run("throw Error('must not run')", AbortSignal.abort())).toEqual({
      code: null,
      stdout: "",
      reason: "aborted",
    });
  });
  it("handles a child closing stdin before a buffered request is sent", async () => {
    const result = await captureZeroDockerProcess(
      process.execPath,
      ["-e", "process.stdin.destroy();process.exit(0)"],
      "/synthetic-empty-config",
      "x".repeat(131072),
      new AbortController().signal,
      2000,
      1024,
    );
    expect(result).toEqual({ code: 0, stdout: "" });
  });
  it("bounds executable startup errors without exposing their path", async () => {
    const result = await captureZeroDockerProcess(
      "/synthetic-private-missing-executable",
      [],
      "/synthetic-empty-config",
      "",
      new AbortController().signal,
      2000,
      1024,
    );
    expect(result).toEqual({ code: null, stdout: "", reason: "runtime_unavailable" });
  });
});
