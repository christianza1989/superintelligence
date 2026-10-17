import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

const launcher = fileURLToPath(new URL("../../../../scripts/zero-mcp.mjs", import.meta.url));

describe("discovery MCP process", () => {
  it("initializes and calls tools through the real launcher without stdout noise", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [launcher],
      stderr: "pipe",
    });
    const errors: Error[] = [];
    let stderr = "";
    transport.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const client = new Client({ name: "zero-offline-process-check", version: "1.0.0" });
    client.onerror = (error) => {
      errors.push(error);
    };
    try {
      await client.connect(transport);
      expect(client.getServerVersion()?.name).toBe("repositoryzero");
      expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
        "zero_inspect",
        "zero_search",
        "zero_status",
      ]);
      const status = await client.callTool({
        name: "zero_status",
        arguments: { nonce: "process-check" },
      });
      expect(status.isError).not.toBe(true);
      expect(status.structuredContent).toMatchObject({
        profile: "discovery-only",
        backend: "unavailable",
        nonce: "process-check",
      });
      expect(status.structuredContent).toMatchObject({ protocolVersion: "2025-11-25" });
      const search = await client.callTool({
        name: "zero_search",
        arguments: { query: "playwright" },
      });
      expect(search.isError).not.toBe(true);
      expect(JSON.stringify(search)).toContain("microsoft/playwright");
      expect(errors).toEqual([]);
      expect(stderr).toBe("");
    } finally {
      await client.close();
    }
  });

  it("exits cleanly when the host closes stdin", async () => {
    const child = spawn(process.execPath, [launcher], { stdio: ["pipe", "pipe", "pipe"] });
    const exited = once(child, "exit", { signal: AbortSignal.timeout(10_000) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdin.end();
    try {
      expect(await exited).toEqual([0, null]);
      expect(stdout).toBe("");
      expect(stderr).toBe("");
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  });

  it("rejects launcher arguments without emitting protocol stdout", async () => {
    const child = spawn(process.execPath, [launcher, "--project=/"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const exited = once(child, "exit", { signal: AbortSignal.timeout(10_000) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdin.end();
    expect(await exited).toEqual([1, null]);
    expect(stdout).toBe("");
    expect(stderr).toContain("takes no arguments");
  });

  it("closes on malformed transport data with a bounded diagnostic", async () => {
    const child = spawn(process.execPath, [launcher], { stdio: ["pipe", "pipe", "pipe"] });
    const exited = once(child, "exit", { signal: AbortSignal.timeout(10_000) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdin.write("not-json\n".repeat(10));
    try {
      expect(await exited).toEqual([1, null]);
      expect(stdout).toBe("");
      expect(stderr).toBe("RepositoryZero MCP transport error.\n");
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  });

  it("handles a host closing stdout without a native stack or private paths", async () => {
    const child = spawn(process.execPath, [launcher], { stdio: ["pipe", "pipe", "pipe"] });
    const exited = once(child, "exit", { signal: AbortSignal.timeout(10_000) });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const initialized = once(child.stdout, "data", { signal: AbortSignal.timeout(10_000) });
    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "closed-output-check", version: "1.0.0" },
        },
      }) + "\n",
    );
    try {
      await initialized;
      child.stdout.destroy();
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "zero_status", arguments: {} },
        }) + "\n",
      );
      expect(await exited).toEqual([1, null]);
      expect(stderr).toBe("RepositoryZero MCP transport error.\n");
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  });
});
