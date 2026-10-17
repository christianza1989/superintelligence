import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Use the installed, lockfile-pinned loader directly. Package-manager banners
// must never be written to the MCP protocol stream.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (process.argv.length !== 2) {
  console.error("RepositoryZero discovery MCP takes no arguments. See docs/MCP-SETUP.md.");
  process.exitCode = 1;
} else {
  const require = createRequire(resolve(root, "platform/package.json"));
  try {
    const loader = require.resolve("tsx");
    const child = spawn(process.execPath, [
      "--import", loader,
      resolve(root, "platform/packages/adapters/src/zero-mcp-stdio.ts"),
    ], { cwd: root, stdio: "inherit" });
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    child.once("error", () => {
      console.error("RepositoryZero MCP could not start its local runtime.");
      process.exitCode = 1;
    });
    child.once("exit", (code, signal) => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
      process.exitCode = code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1);
    });
  } catch {
    console.error("RepositoryZero MCP dependencies are unavailable. Run npm run setup:mcp in the checkout first.");
    process.exitCode = 1;
  }
}
