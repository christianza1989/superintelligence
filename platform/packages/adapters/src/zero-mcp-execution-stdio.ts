import { ZeroApplicationTransportError } from "./zero-application-transport.js";
import { createZeroComponentApplicationClientFromFile } from "./zero-component-application-client.js";
import {
  createZeroCsvApplicationClientFromFile,
  ZeroCsvApplicationError,
} from "./zero-csv-application-client.js";
import { registerZeroComponentMcpTools } from "./zero-mcp-component-tools.js";
import { registerZeroCsvMcpTools } from "./zero-mcp-csv-tools.js";
import { registerZeroReuseMcpTools } from "./zero-mcp-reuse-tools.js";
import { createZeroJevApplicationClientFromFile } from "./zero-jev-application-client.js";
import { connectZeroMcpStdio } from "./zero-mcp-process.js";
import { createZeroMcpServer } from "./zero-mcp-server.js";

// Separate trusted composition root: discovery startup never imports project
// policy, application credentials, worker code or database packages.
try {
  const file = process.env.ZERO_MCP_BINDING_FILE;
  if (!file) throw new Error("binding_required");
  // Every operation rereads the private Zero session binding. Missing, changed,
  // expired or revoked configuration never becomes a cached successful grant.
  const client = createZeroCsvApplicationClientFromFile(file);
  const pdf = createZeroComponentApplicationClientFromFile("pdf", file);
  const browser = createZeroComponentApplicationClientFromFile("browser", file);
  const research = createZeroComponentApplicationClientFromFile(
    "research",
    file,
  );
  const reuse = createZeroJevApplicationClientFromFile(file);
  const extractionStatus = async (component: {
    status(): Promise<unknown>;
  }) => {
    try {
      await component.status();
      return "available" as const;
    } catch (error) {
      return error instanceof ZeroApplicationTransportError &&
        [
          "authentication_required",
          "project_scope_rejected",
          "binding_expired",
          "invalid_binding",
          "origin_rejected",
        ].includes(error.code)
        ? ("blocked" as const)
        : ("unavailable" as const);
    }
  };
  const server = createZeroMcpServer({
    sourcePlanningStatus: async () => {
      const status = await reuse.status();
      return { publicGithubResearch: status.allowPublicGithubDiscovery === true,
        reviewedSourceSelection: !!status.sourceRepositories?.length, paidSelectionAuthorized: true };
    },
    componentStatus: {
      pdf: () => extractionStatus(pdf),
      browser: () => extractionStatus(browser),
      research: () => extractionStatus(research),
      reuse: () => extractionStatus(reuse),
    },
    executionStatus: async () => {
      try {
        const status = await client.status();
        return { backend: "available", profile: status.execution };
      } catch (error) {
        return error instanceof ZeroCsvApplicationError &&
          [
            "authentication_required",
            "project_scope_rejected",
            "binding_expired",
            "invalid_binding",
            "origin_rejected",
          ].includes(error.code)
          ? "blocked"
          : "unavailable";
      }
    },
  });
  registerZeroCsvMcpTools(server, client);
  registerZeroReuseMcpTools(server, reuse);
  registerZeroComponentMcpTools(server, pdf);
  registerZeroComponentMcpTools(server, browser);
  registerZeroComponentMcpTools(server, research);
  await connectZeroMcpStdio(server);
} catch {
  process.stderr.write(
    "RepositoryZero execution binding unavailable. Check the private operator setup.\n",
  );
  process.exitCode = 1;
  process.stdin.destroy();
}
