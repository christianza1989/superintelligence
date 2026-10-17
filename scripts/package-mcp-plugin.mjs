import { createHash, randomUUID } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "plugins/repositoryzero");
const manifest = JSON.parse(
  await readFile(join(source, "plugin.json"), "utf8"),
);
const require = createRequire(join(root, "platform/package.json"));
// tsx is a direct pinned workspace build dependency; use its pinned bundler,
// with no runtime package installation or version resolution from the network.
const bundler = createRequire(require.resolve("tsx")).resolve("esbuild");
const { build } = await import(bundler);
const output = join(
  root,
  ".artifacts/plugins",
  `repositoryzero-${manifest.version}-${randomUUID()}`,
);
await mkdir(join(output, "server"), { recursive: true });
for (const name of [
  "plugin.json",
  "mcp.json",
  ".mcp.json",
  ".codex-plugin",
  ".claude-plugin",
  "skills",
]) {
  await cp(join(source, name), join(output, name), {
    recursive: true,
    errorOnExist: true,
  });
}
for (const name of ["LICENSE", "NOTICE"])
  await cp(join(root, name), join(output, name));
await cp(join(source, "server/index.mjs"), join(output, "server/index.mjs"));
const builds = [];
for (const [name, entry] of [
  ["discovery", "zero-mcp-stdio.ts"],
  ["execution", "zero-mcp-execution-stdio.ts"],
]) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [`platform/packages/adapters/src/${entry}`],
    outfile: join(output, `server/${name}.mjs`),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    metafile: true,
    sourcemap: false,
    legalComments: "inline",
    logLevel: "warning",
    define: { ZERO_OPERATOR_BUNDLED: "true" },
    banner: {
      js: 'import { createRequire as zeroCreateRequire } from "node:module"; const require = zeroCreateRequire(import.meta.url);',
    },
  });
  const inputs = Object.keys(result.metafile.inputs);
  // These are transport clients, not a bundled application/worker/installer.
  const denied =
    /(?:platform\/packages\/db\/|node_modules\/(?:koffi|pg|graphile-worker|@prisma\/client)\/|\/(?:file-handle-path|desktop-sandbox-win32-path|zero-project-policy|zero-component-jobs|zero-(?:pdf|browser)-(?:runtime|docker|service)|zero-csv-(?:worker|preparation|project-verifier)|zero-jev-worker)\.[tj]s$)/;
  if (inputs.some((input) => denied.test(input)))
    throw new Error("Forbidden application or native runtime in plugin bundle");
  if (
    name === "discovery" &&
    inputs.some((input) =>
      /zero-(?:operator-file|application-transport|(?:csv|component)-application-client)/.test(
        input,
      ),
    )
  )
    throw new Error("Discovery bundle includes execution configuration");
  for (const item of Object.values(result.metafile.outputs))
    if (
      item.imports.some(
        (dependency) =>
          dependency.external && !dependency.path.startsWith("node:"),
      )
    )
      throw new Error("Plugin runtime has an external package dependency");
  builds.push({ name, inputs });
}
const packages = new Map();
for (const input of new Set(builds.flatMap(({ inputs }) => inputs))) {
  if (!input.includes("node_modules/")) continue;
  let directory = dirname(resolve(root, input));
  while (directory !== dirname(directory)) {
    try {
      const data = JSON.parse(
        await readFile(join(directory, "package.json"), "utf8"),
      );
      if (typeof data.name === "string" && typeof data.version === "string") {
        packages.set(`${data.name}@${data.version}`, { directory, data });
        break;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    directory = dirname(directory);
  }
}
const notices = [];
for (const [id, { directory, data }] of [...packages].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  const files = [];
  for (const name of await readdir(directory)) {
    if (!/^(licen[cs]e|copying|notice)(\.|$)/i.test(name)) continue;
    if (!(await stat(join(directory, name))).isFile()) continue;
    const relative = `third-party/${id.replace(/[^a-zA-Z0-9._-]/g, "_")}/${name}`;
    await mkdir(dirname(join(output, relative)), { recursive: true });
    await cp(join(directory, name), join(output, relative));
    files.push(relative);
  }
  if (!files.length)
    throw new Error(`Missing bundled dependency license: ${id}`);
  notices.push({
    package: data.name,
    version: data.version,
    license: data.license ?? "unknown",
    files,
  });
}
await writeFile(
  join(output, "THIRD-PARTY-NOTICES.json"),
  `${JSON.stringify(notices, null, 2)}\n`,
);
await writeFile(
  join(output, "package.json"),
  `${JSON.stringify({ name: "repositoryzero-mcp-preview", version: manifest.version, private: true, type: "module", engines: { node: ">=24" } }, null, 2)}\n`,
);
const server = await readFile(join(output, "server/index.mjs"));
const bundles = [];
for (const name of ["index", "discovery", "execution"]) {
  const file = `server/${name}.mjs`;
  const bytes = await readFile(join(output, file));
  bundles.push({
    file,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.byteLength,
  });
}
await writeFile(
  join(output, "BUILD.json"),
  `${JSON.stringify(
    {
      version: manifest.version,
      profile: "discovery-default-with-optional-linux-execution",
      defaultProfile: "discovery-only",
      execution: {
        activation: "nonempty ZERO_MCP_BINDING_FILE",
        platform: "linux",
        backend: "external existing Zero API/Graphile",
        privateBinding:
          "outside Git and package; current UID; exact0600; single link",
      },
      bundles,
      runtime: "Node >=24; no node_modules required",
      serverSha256: createHash("sha256").update(server).digest("hex"),
      serverBytes: server.byteLength,
      dependencies: notices.map(({ package: name, version }) => ({
        name,
        version,
      })),
    },
    null,
    2,
  )}\n`,
);
await mkdir(join(output, ".agents/plugins"), { recursive: true });
await writeFile(
  join(output, ".agents/plugins/marketplace.json"),
  `${JSON.stringify(
    {
      name: "repositoryzero-local-preview",
      interface: { displayName: "RepositoryZero local preview" },
      plugins: [
        {
          name: "repositoryzero",
          source: { source: "local", path: "./" },
          policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
          category: "Productivity",
        },
      ],
    },
    null,
    2,
  )}\n`,
);
// Unique output directories preserve failed builds and previous local packages.
console.log(output);
