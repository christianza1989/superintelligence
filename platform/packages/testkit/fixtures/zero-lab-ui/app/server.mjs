/** Reuse the existing independent API fixture, copied explicitly by the test harness. */
import { createServer, request as requestApi } from "node:http";
import { readFile } from "node:fs/promises";
const port = Number(process.env.PORT);
process.env.PORT = String(port + 1);
await import("./api.fixture.mjs");
process.env.PORT = String(port);
createServer(async (request, response) => {
  if (request.url.startsWith("/api/")) {
    const proxy = requestApi({ hostname: "127.0.0.1", port: port + 1, path: request.url, method: request.method, headers: request.headers }, upstream => {
      response.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(response);
    });
    proxy.on("error", () => { response.writeHead(502); response.end(); }); request.pipe(proxy); return;
  }
  const file = request.url === "/" ? "index.html" : request.url === "/client.js" ? "client.js" : null;
  if (!file) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { "content-type": file.endsWith("js") ? "application/javascript" : "text/html" });
  response.end(await readFile(new URL(file, import.meta.url)));
}).listen(port, "127.0.0.1");
