import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { build } = require("/input/deps/esbuild/lib/main.js");
await mkdir("/work/dist", { recursive: true });
const options = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  logLevel: "silent",
};
await build({ ...options, entryPoints: ["/input/app.fixture.ts"], outfile: "/work/dist/app.mjs" });
const source = await readFile("/input/app.fixture.ts", "utf8");
const original = "return c.json([...tasks.values()]);";
if (!source.includes(original)) throw new Error("Negative control source marker is missing");
await build({
  ...options,
  stdin: {
    contents: source.replace(original, "return c.json([]);"),
    resolveDir: "/input",
    loader: "ts",
  },
  outfile: "/work/dist/broken.mjs",
});
await writeFile(
  "/work/build.json",
  JSON.stringify({ status: "built", artifacts: ["app.mjs", "broken.mjs"] }),
);
