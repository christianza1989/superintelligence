/** Fixed image entrypoint. No host paths, credentials, principal or commands are accepted. */
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import type { AdapterContext, ArtifactStore } from "@rakazo/adapter-kit";
import { ComputerBrowserProvider } from "./computer-browser.js";
import { runZeroBrowserResearch, ZERO_BROWSER_RESEARCH_LIMITS } from "./zero-browser-research.js";
import {
  ZERO_BROWSER_FIXTURE_ORIGIN,
  ZERO_BROWSER_FIXTURES,
} from "./zero-browser-research-profile.js";

const buffers = new Map<string, Uint8Array>();
let retainedBytes = 0;
const artifactLimit =
  ZERO_BROWSER_RESEARCH_LIMITS.screenshotBytes + ZERO_BROWSER_RESEARCH_LIMITS.traceBytes;
const artifacts: ArtifactStore = {
  describe: () => ({
    id: "zero-browser-container-memory",
    contractVersion: "1",
    adapterVersion: "1",
    capabilities: { stream: false },
  }),
  put: async (artifact) => {
    if (buffers.size >= 2 || retainedBytes + artifact.bytes.byteLength > artifactLimit)
      throw new Error("browser_output_limit_exceeded");
    const id = randomUUID();
    const bytes = Uint8Array.from(artifact.bytes);
    buffers.set(id, bytes);
    retainedBytes += bytes.byteLength;
    return { id, hash: String(bytes.byteLength) };
  },
  get: async (id) => {
    const bytes = buffers.get(id);
    if (!bytes) throw new Error("browser_artifact_missing");
    return bytes;
  },
  remove: async (id) => {
    const bytes = buffers.get(id);
    if (bytes) retainedBytes -= bytes.byteLength;
    buffers.delete(id);
  },
};

async function main() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString("utf8");
    if (Buffer.byteLength(input) > 1024) throw new Error("browser_request_rejected");
  }
  const controller = new AbortController();
  // Image-qualification controls are fixed argv selected by an operator's gated test.
  // The production Docker adapter never supplies argv; request JSON accepts taskId only.
  const control = process.argv[2];
  if (
    control &&
    ![
      "wrong-output",
      "unused-provider",
      "foreign-navigation",
      "download",
      "request-limit",
    ].includes(control)
  )
    throw new Error("browser_request_rejected");
  const fixtures = { ...ZERO_BROWSER_FIXTURES };
  if (control === "wrong-output")
    fixtures["/article"] = '<html><body><p id="fact">999</p></body></html>';
  if (control === "foreign-navigation")
    fixtures["/article"] =
      '<html><body><p id="fact">1974</p><script nonce="zero-fixture-v1">location.href="http://127.0.0.1:9/forbidden"</script></body></html>';
  if (control === "download")
    fixtures["/citation"] =
      '<html><body><a download href="/citation-source">Primary source</a></body></html>';
  if (control === "request-limit")
    fixtures["/article"] =
      `<html><body><p id="fact" style="display:none">not reached</p><script nonce="zero-fixture-v1">(async()=>{for(let i=0;i<24;i++)await new Promise(resolve=>{let s=document.createElement('script');s.nonce='zero-fixture-v1';s.src='/unicode';s.onload=s.onerror=resolve;document.body.append(s)})})()</script></body></html>`;
  if (control === "unused-provider")
    ComputerBrowserProvider.prototype.navigate = async () => ({
      url: `${ZERO_BROWSER_FIXTURE_ORIGIN}/article`,
      title: "unused provider control",
    });
  process.once("SIGTERM", () => controller.abort());
  process.once("SIGINT", () => controller.abort());
  const watchdog = setTimeout(() => process.exit(124), 20_000);
  const context: AdapterContext = {
    operationId: "sealed-fixture",
    traceId: "sealed-fixture",
    spaceId: "sealed-fixture",
    userId: "sealed-fixture",
    signal: controller.signal,
  };
  await mkdir("/tmp/staging", { mode: 0o700 });
  try {
    const receipt = await runZeroBrowserResearch(
      {
        executablePath: "/opt/chromium/chrome-headless-shell-linux64/chrome-headless-shell",
        stagingRoot: "/tmp/staging",
        authorize: async () => controller.signal.throwIfAborted(),
        fixtures,
      },
      JSON.parse(input),
      context,
      artifacts,
    );
    const output = JSON.stringify({
      nodeVersion: process.versions.node,
      ...(control ? { qualificationControl: control } : {}),
      receipt,
      artifacts: [...buffers].map(([id, bytes]) => ({
        id,
        base64: Buffer.from(bytes).toString("base64"),
      })),
    });
    if (Buffer.byteLength(output) > 4 * 1024 * 1024)
      throw new Error("browser_output_limit_exceeded");
    process.stdout.write(output);
  } finally {
    clearTimeout(watchdog);
  }
}

main().catch(() => {
  process.stderr.write("browser_container_failed\n");
  process.exitCode = 1;
});
