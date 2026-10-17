import { spawn } from "node:child_process";

/** Trusted internal Docker CLI transport. Callers own fixed flags and named-container cleanup. */
export async function captureZeroDockerProcess(
  executable: string,
  args: string[],
  configDir: string,
  input: string,
  signal: AbortSignal,
  timeoutMs: number,
  outputBytes: number,
): Promise<{ code: number | null; stdout: string; reason?: string }> {
  if (signal.aborted) return { code: null, stdout: "", reason: "aborted" };
  return new Promise((resolve) => {
    const output: Buffer[] = [];
    let bytes = 0;
    let reason: string | undefined;
    let settled = false;
    const child = spawn(executable, args, {
      env: { PATH: "/usr/bin:/bin", DOCKER_CONFIG: configDir },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      resolve({
        code,
        stdout: Buffer.concat(output).toString("utf8"),
        ...(reason ? { reason } : {}),
      });
    };
    const stop = (why: string) => {
      reason ??= why;
      child.kill("SIGKILL");
    };
    const abort = () => stop("aborted");
    const timer = setTimeout(() => stop("execution_timeout"), timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    child.on("error", () => {
      reason ??= "runtime_unavailable";
      finish(null);
    });
    for (const [stream, keep] of [
      [child.stdout, true],
      [child.stderr, false],
    ] as const) {
      stream.on("data", (chunk: Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > outputBytes) return stop("output_limit_exceeded");
        if (keep) output.push(Buffer.from(chunk));
      });
      stream.on("error", () => stop("runtime_unavailable"));
    }
    child.stdin.on("error", () => undefined);
    child.once("close", (code) => finish(code));
    child.stdin.end(input);
    if (signal.aborted) abort();
  });
}
