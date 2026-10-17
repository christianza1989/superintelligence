import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createZeroMcpServer } from "./zero-mcp-server.js";

const server = createZeroMcpServer();
const transport = new StdioServerTransport(undefined, undefined, { maxBufferSize: 65_536 });
let closing = false;

async function stop(code: number) {
  if (closing) return;
  closing = true;
  process.exitCode = code;
  await server.close();
  process.stdin.destroy();
}

// No project data, arguments, environment or credential values in diagnostics.
const transportError = () => {
  if (closing) return;
  process.stderr.write("RepositoryZero MCP transport error.\n");
  void stop(1);
};
server.server.onerror = transportError;
process.stdout.on("error", transportError);
process.stderr.on("error", () => {
  void stop(1);
});
process.once("SIGINT", () => {
  void stop(130);
});
process.once("SIGTERM", () => {
  void stop(143);
});
process.stdin.once("end", () => {
  void stop(0);
});

try {
  await server.connect(transport);
} catch {
  process.stderr.write("RepositoryZero MCP initialization failed.\n");
  await stop(1);
}
