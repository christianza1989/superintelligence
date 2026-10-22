import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Actual packaged STDIO/client HTTP fixture conformance; no worker or native host claim. */
export async function testExecutionPackage(
  directory,
  { Client, StdioClientTransport },
) {
  const root = await mkdtemp(join(tmpdir(), "zero-plugin-execution-proof-"));
  const pkg = join(root, "package"),
    cwd = join(root, "empty");
  const bindingFile = join(root, "operator.json");
  const secret = "fixture-session-private-marker-123456789";
  const marker = "fixture-private-path-and-identity";
  let calls = 0,
    authorized = true,
    expectedToken = secret;
  const jobId = "62c7d20a-7f58-4f09-8754-a306fd388b26";
  const server = createServer(async (request, response) => {
    calls++;
    assert.equal(request.headers.authorization, `Bearer ${expectedToken}`);
    assert.equal(request.headers["x-rakazo-space-id"], "fixture-space");
    const route = /^\/api\/zero\/(csv|pdf|browser|research|jev)\/scopes\/fixture-scope\//.exec(request.url);
    assert.ok(route);
    const family = route[1];
    response.setHeader("content-type", "application/json");
    if (!authorized) {
      response
        .writeHead(401)
        .end(JSON.stringify({ error: "authentication_required" }));
      return;
    }
    if (request.url.endsWith("/status")) {
      if (family === "jev") {
        response.end(JSON.stringify({ profile: "jev-tool-selector-v1", backend: "available", execution: "jev-tool-selection", paidModelCalls: 0, profileRevision: "fixture-module-v1", model: "fixture-jev", tools: ["module.csv.d3", "module.csv.papaparse", "module.zip.fflate"], limits: { inputBytes: 16384, goalChars: 2000, artifactBytes: 98304, outstandingJobsPerScope: 4, deadlineMs: 120000, runtimeMs: 30000 } }));
        return;
      }
      if (family !== "csv") {
        const pdf = family === "pdf";
        const research = family === "research";
        response.end(JSON.stringify({
          profile: pdf ? "pdfplumber-0.11.10-born-digital-lines-v1" : research ? "zero-url-research-v1" : "zero-browser-static-v1",
          backend: "available", paidModelCalls: 0,
          execution: pdf ? "pdf-extraction" : research ? "safe-http-fetch+inert-snapshot" : "browser-static-extraction",
          limits: research ? { sourceBytes: 16384, fetchMs: 8000, runtimeMs: 30000, artifactBytes: 2097152, tasks: 10, outstandingJobsPerScope: 4, redirects: 0, paidModelCalls: 0 } : { inputBytes: pdf ? 1048576 : 16384, runtimeMs: pdf ? 30000 : 20000,
            artifactBytes: pdf ? 1064960 : 2097152, outstandingJobsPerScope: 4 },
        }));
        return;
      }
      response.end(
        JSON.stringify({
          profile: "d3-dsv-3.0.1/strict-table-v1",
          backend: "available",
          paidModelCalls: 0,
          execution: "csv-preparation-and-verification",
          verification: "zero-csv-project-v1",
          limits: {
            inputBytes: 16384,
            rows: 512,
            columns: 64,
            cellChars: 4096,
            artifactBytes: 98304,
            runtimeMs: 5000,
            outstandingJobsPerScope: 4,
          },
        }),
      );
    } else if (family === "jev" && request.url.endsWith("/execute")) {
      let raw = ""; for await (const chunk of request) raw += chunk;
      const input = JSON.parse(raw);
      if (input.mode === "select-source") {
        assert.equal(input.data, "source-selection-v1");
        assert.deepEqual(input.candidateIds, ["inventree/InvenTree"]);
      } else assert.equal(input.mode, "prepare-component");
      response.writeHead(202).end(JSON.stringify({ jobId, callId: jobId, requestDigest: "a".repeat(64) }));
    } else if (request.url.endsWith("/prepare") || (family !== "csv" && request.url.endsWith("/extract"))) {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      if (family === "csv") assert.equal(input.csv, "a\n1");
      else if (family === "research") assert.equal(input.taskId, "approved-fixture");
      else assert.equal(input.fileId, "approved-fixture");
      response
        .writeHead(202)
        .end(JSON.stringify({ jobId, requestDigest: "a".repeat(64) }));
    } else if (family === "pdf" && /\/tables\/0\/csv\?offset=0&limit=8192$/.test(request.url)) {
      const csv = Buffer.from("name,value\nA,12");
      const sha256 = "a".repeat(64);
      response.end(JSON.stringify({
        metadata: {
          profile: "pdfplumber-0.11.10-born-digital-lines-v1",
          sourceSha256: sha256,
          receipt: { artifactId: "receipt", revision: 2, sha256 },
          csv: { sha256: createHash("sha256").update(csv).digest("hex"), bytes: csv.length, encoding: "utf-8", delimiter: ",", lineTerminator: "\n" },
          table: { index: 0, count: 1, rows: 2, columns: 2, provenance: [{ page_no: 1, bbox: { l: 1, t: 1, r: 10, b: 10, coord_origin: "TOPLEFT" } }] },
        },
        totalBytes: csv.length, offset: 0, nextOffset: null,
        encoding: "base64", contentBase64: csv.toString("base64"),
      }));
    } else {
      response.writeHead(404).end(JSON.stringify({ error: "invalid_request" }));
    }
  });
  const cleanResult = (value) => {
    const text = JSON.stringify(value);
    for (const privateValue of [
      secret,
      expectedToken,
      marker,
      bindingFile,
      root,
    ])
      assert.ok(
        !text.includes(privateValue),
        "Private binding data crossed the MCP boundary",
      );
  };
  const clients = new Set();
  const open = async (file) => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(pkg, "server/index.mjs")],
      cwd,
      stderr: "pipe",
      env: {
        ...(file ? { ZERO_MCP_BINDING_FILE: file } : {}),
        ZERO_OPERATOR_BUNDLED: "false",
      },
    });
    let stderr = "";
    transport.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const client = new Client({
      name: "zero-packaged-execution-fixture",
      version: "1",
    });
    clients.add(client);
    await client.connect(transport);
    return {
      client,
      async close() {
        await client.close();
        clients.delete(client);
        assert.equal(stderr, "");
      },
    };
  };
  let binding;
  const writeBinding = async (value = binding, file = bindingFile) => {
    await writeFile(file, JSON.stringify(value), { mode: 0o600 });
    await chmod(file, 0o600);
  };
  const status = async (client, backend) => {
    const output = await client.callTool({
      name: "zero_status",
      arguments: { nonce: "bundle-fixture" },
    });
    cleanResult(output);
    assert.equal(output.structuredContent.nonce, "bundle-fixture");
    assert.equal(output.structuredContent.backend, backend);
    return output.structuredContent;
  };
  const blockedFile = async (file) => {
    const before = calls,
      run = await open(file);
    try {
      await status(run.client, "blocked");
      const result = await run.client.callTool({
        name: "zero_prepare",
        arguments: {
          profile: "d3-dsv-3.0.1/strict-table-v1",
          csv: "a\n1",
          idempotencyKey: "fixture-invalid",
          deadline: new Date(Date.now() + 30000).toISOString(),
        },
      });
      assert.equal(result.isError, true);
      cleanResult(result);
      assert.equal(calls, before);
    } finally {
      await run.close();
    }
  };
  try {
    await cp(directory, pkg, { recursive: true, errorOnExist: true });
    await mkdir(cwd);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    binding = {
      apiUrl: `http://127.0.0.1:${server.address().port}`,
      spaceId: "fixture-space",
      scopeId: "fixture-scope",
      sessionToken: secret,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
    await writeBinding();
    let run = await open(bindingFile);
    try {
      const tools = (await run.client.listTools()).tools
        .map((t) => t.name)
        .sort();
      assert.deepEqual(
        tools,
        [
          "zero_artifact",
          "zero_browser_artifact",
          "zero_browser_cancel",
          "zero_browser_extract",
          "zero_browser_job",
          "zero_cancel",
          "zero_freshness",
          "zero_inspect",
          "zero_job",
          "zero_pdf_artifact",
          "zero_pdf_cancel",
          "zero_pdf_extract",
          "zero_pdf_job",
          "zero_pdf_csv",
          "zero_prepare",
          "zero_research_extract",
          "zero_research_job",
          "zero_research_artifact",
          "zero_research_cancel",
          "zero_reuse",
          "zero_reuse_job",
          "zero_reuse_artifact",
          "zero_reuse_verify",
          "zero_search",
          "zero_select",
          "zero_status",
          "zero_verify",
        ].sort(),
      );
      const available = await status(run.client, "available");
      assert.equal(available.profile, "scoped-component-jobs");
      assert.deepEqual(available.components, { csv: "available", pdf: "available", browser: "available", research: "available", reuse: "available" });
      const selectedSource = await run.client.callTool({ name: "zero_select", arguments: { goal: "Offline inventory foundation", candidateIds: ["inventree/InvenTree"], idempotencyKey: "fixture-plan", deadline: new Date(Date.now() + 30000).toISOString() } });
      cleanResult(selectedSource);
      assert.equal(selectedSource.structuredContent.callId, jobId);
      const preparedModule = await run.client.callTool({ name: "zero_reuse", arguments: { goal: "Strict CSV parser", idempotencyKey: "fixture-reuse", deadline: new Date(Date.now() + 30000).toISOString() } });
      cleanResult(preparedModule);
      assert.equal(preparedModule.structuredContent.callId, jobId);
      for (const family of ["pdf", "browser", "research"]) {
        const extracted = await run.client.callTool({ name: `zero_${family}_extract`, arguments: {
          ...(family === "research" ? { taskId: "approved-fixture" } : { fileId: "approved-fixture" }), idempotencyKey: `fixture-${family}`,
          deadline: new Date(Date.now() + 30000).toISOString(),
        } });
        assert.deepEqual(extracted.structuredContent, { jobId, requestDigest: "a".repeat(64) });
        cleanResult(extracted);
      }
      const csv = await run.client.callTool({ name: "zero_pdf_csv", arguments: { jobId, tableIndex: 0 } });
      assert.equal(csv.isError, undefined);
      assert.equal(Buffer.from(csv.structuredContent.contentBase64, "base64").toString(), "name,value\nA,12");
      cleanResult(csv);
      const receipt = await run.client.callTool({
        name: "zero_prepare",
        arguments: {
          profile: "d3-dsv-3.0.1/strict-table-v1",
          csv: "a\n1",
          idempotencyKey: "fixture-first",
          deadline: new Date(Date.now() + 30000).toISOString(),
        },
      });
      assert.deepEqual(receipt.structuredContent, {
        jobId,
        requestDigest: "a".repeat(64),
      });
      cleanResult(receipt);
      const before = calls;
      await writeBinding({ ...binding, expiresAt: "2000-01-01T00:00:00Z" });
      await status(run.client, "blocked");
      assert.equal(calls, before);
      await writeBinding();
      await status(run.client, "available");
      await chmod(bindingFile, 0o640);
      const beforeMode = calls;
      await status(run.client, "blocked");
      assert.equal(calls, beforeMode);
      await chmod(bindingFile, 0o600);
      const replacement = join(root, "replacement.json");
      await writeBinding(binding, replacement);
      await rename(replacement, bindingFile);
      await status(run.client, "available");
      await rm(bindingFile);
      const beforeDelete = calls;
      await status(run.client, "blocked");
      assert.equal(calls, beforeDelete);
      await writeBinding();
      authorized = false;
      await status(run.client, "blocked");
      authorized = true;
      expectedToken = secret + "-rotated";
      binding = { ...binding, sessionToken: expectedToken };
      await writeBinding();
      await status(run.client, "available");
    } finally {
      await run.close();
    }
    run = await open(bindingFile);
    try {
      await status(run.client, "available");
    } finally {
      await run.close();
    }
    // Copied package has no .git. Build-time protection still denies exported credentials.
    const exported = join(pkg, "operator.json");
    await writeBinding(binding, exported);
    await blockedFile(exported);
    await rm(exported);
    await writeFile(bindingFile, JSON.stringify({ private: marker }), {
      mode: 0o600,
    });
    await blockedFile(bindingFile);
    await writeFile(bindingFile, " ".repeat(8193));
    await blockedFile(bindingFile);
    await writeBinding();
    const linked = join(root, "link.json");
    await symlink(bindingFile, linked);
    await blockedFile(linked);
    await rm(linked);
    const hard = join(root, "hard.json");
    await link(bindingFile, hard);
    await blockedFile(bindingFile);
    await rm(hard);
    const git = join(root, "git");
    await mkdir(git);
    await writeFile(join(git, ".git"), "gitdir: fixture");
    const inGit = join(git, "binding.json");
    await writeBinding(binding, inGit);
    await blockedFile(inGit);
    await blockedFile(join(root, "missing-private-marker.json"));
    await blockedFile("relative/private-marker.json");
    run = await open();
    try {
      assert.deepEqual(
        (await run.client.listTools()).tools.map((t) => t.name).sort(),
        ["zero_inspect", "zero_search", "zero_status"],
      );
      await status(run.client, "unavailable");
    } finally {
      await run.close();
    }
  } finally {
    for (const client of clients) await client.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    // Only this function's mkdtemp-owned proof tree is removed.
    await rm(root, { recursive: true, force: true });
  }
  console.log(
    "PASS: optional Linux packaged STDIO/client HTTP fixture, private/exported binding rejection, reread/restart/revocation and discovery disable; no worker/native-host lifecycle qualification.",
  );
}
