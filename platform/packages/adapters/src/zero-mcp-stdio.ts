import { connectZeroMcpStdio } from "./zero-mcp-process.js";
import { createZeroMcpServer } from "./zero-mcp-server.js";

await connectZeroMcpStdio(createZeroMcpServer());
