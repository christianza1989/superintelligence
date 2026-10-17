#!/usr/bin/env node
/** Explicit cold preparation only. The resulting profile executes without install/network. */
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  cp,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireAdapter = createRequire(path.join(platform, "packages/adapters/package.json"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function shaFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
const MiB = 1024 * 1024;
const plan = Object.freeze({
  profile: "zero-browser-shell-image-v1",
  platform: "linux/amd64",
  base: "python@sha256:8a00ecb83ed9d0864dfd102a1bdb2067fda907ceb30bb86d09da9ee558b19590",
  nodeSource: "node@sha256:ec857ea6bb60cb3d0fa4d97495590c5fe7d51be8572c307b55957eeb06569cf7",
  nodeVersion: "24.22.0",
  nodeCompressedBytes: 81_007_152,
  playwright: "1.63.0",
  browserVersion: "153.0.8010.12",
  browserRevision: "1243",
  browserUrl:
    "https://cdn.playwright.dev/builds/cft/153.0.8010.12/linux64/chrome-headless-shell-linux64.zip",
  browserArchiveBytes: 119_809_080,
  browserArchiveSha256: "a9da028861a0cf789ff25c2fed45f5f1aaf969ed9247835b6a7821a4f7af9d1d",
  caps: { downloads: 400 * MiB, extractedBrowser: 400 * MiB, image: 900 * MiB, debs: 100 * MiB },
  runtime: {
    cpus: 2,
    memoryBytes: 512 * MiB,
    pids: 128,
    tmpfsBytes: 128 * MiB,
    wallMs: 15_000,
    outputBytes: 4 * MiB,
  },
  sources: [
    "https://playwright.dev/docs/browsers",
    "https://playwright.dev/docs/docker",
    "https://raw.githubusercontent.com/microsoft/playwright/v1.63.0/packages/playwright-core/src/server/registry/nativeDeps.ts",
  ],
});
// Chromium dependencies from pinned nativeDeps.ts, plus one reviewed font family.
// No Xvfb, Firefox, WebKit, headed Chromium, FFmpeg or system browser is installed.
const packages = [
  "fonts-liberation",
  "libfontconfig1",
  "libfreetype6",
  "libasound2",
  "libatk-bridge2.0-0",
  "libatk1.0-0",
  "libatspi2.0-0",
  "libcairo2",
  "libcups2",
  "libdbus-1-3",
  "libdrm2",
  "libgbm1",
  "libglib2.0-0",
  "libnspr4",
  "libnss3",
  "libpango-1.0-0",
  "libx11-6",
  "libxcb1",
  "libxcomposite1",
  "libxdamage1",
  "libxext6",
  "libxfixes3",
  "libxkbcommon0",
  "libxrandr2",
  "libatomic1",
  "libstdc++6",
  "libgcc-s1",
];

async function bundledNotices(inputs, output) {
  const seen = new Set();
  const result = [];
  for (const input of Object.keys(inputs)) {
    let directory = path.dirname(path.resolve(platform, input));
    while (directory.startsWith(`${platform}/`)) {
      let metadata;
      try {
        metadata = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
      } catch {
        directory = path.dirname(directory);
        continue;
      }
      if (seen.has(directory)) break;
      seen.add(directory);
      if (seen.size > 128) throw new Error("bundled_notice_cap");
      const slug = `${metadata.name}-${metadata.version}`.replace(/[^a-z0-9._-]/giu, "_");
      const target = path.join(output, slug);
      const files = [];
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !/^(licen[cs]e|notice|copying)(?:[-_.].*)?$/iu.test(entry.name))
          continue;
        if ((await lstat(path.join(directory, entry.name))).size > MiB)
          throw new Error("notice_file_cap");
        await mkdir(target, { recursive: true });
        await cp(path.join(directory, entry.name), path.join(target, entry.name));
        files.push(entry.name);
      }
      result.push({
        name: metadata.name,
        version: metadata.version,
        license: metadata.license ?? null,
        files,
      });
      break;
    }
  }
  return result;
}

async function command(executable, args, { timeoutMs = 120_000, log, input } = {}) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks = [];
    let bytes = 0;
    let reason;
    const timer = setTimeout(() => {
      reason = "preparation_timeout";
      child.kill("SIGKILL");
    }, timeoutMs);
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) {
          reason = "preparation_output_cap";
          child.kill("SIGKILL");
        } else chunks.push(Buffer.from(chunk));
      });
    child.stdin.on("error", () => {});
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, reason, text: Buffer.concat(chunks).toString("utf8") });
    });
    child.stdin.end(input);
  });
  if (log) await writeFile(log, result.text, { flag: "wx", mode: 0o600 });
  if (result.code !== 0 || result.reason) {
    const error = new Error(result.reason ?? "preparation_command_failed");
    error.diagnostics = result.text;
    throw error;
  }
  return result.text;
}
async function inventory(directory, limit) {
  const files = [];
  let bytes = 0;
  async function walk(current, prefix = "") {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full, `${relative}/`);
      else if (entry.isFile()) {
        const info = await lstat(full);
        bytes += info.size;
        if (bytes > limit || files.length >= 4096) throw new Error("preparation_file_cap");
        files.push({ path: relative, bytes: info.size, sha256: await shaFile(full) });
      } else if (!entry.isSymbolicLink()) throw new Error("preparation_special_file_rejected");
    }
  }
  await walk(directory);
  return { bytes, files: files.sort((a, b) => a.path.localeCompare(b.path)) };
}
async function image(ref) {
  const [value] = JSON.parse(await command("docker", ["image", "inspect", ref]));
  if (!Number.isSafeInteger(value.Size) || value.Size <= 0) throw new Error("invalid_image_size");
  return { id: value.Id, bytes: value.Size, layers: value.RootFS.Layers };
}

async function prepare() {
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: Explicit standalone preparation gate, never a cached Turbo task.
  if (process.env.ZERO_BROWSER_IMAGE_PREPARE !== "1" || process.platform !== "linux")
    throw new Error("explicit_linux_preparation_required");
  const local = path.join(platform, ".local");
  await mkdir(local, { recursive: true, mode: 0o700 });
  const root = await mkdtemp(path.join(local, "browser-image-"));
  console.log(JSON.stringify({ state: "preparing", evidenceDirectory: root }));
  await writeFile(path.join(root, "plan.json"), JSON.stringify(plan, null, 2), { flag: "wx" });
  const sourceTag = `zero-browser-shell:${randomUUID()}`;
  const prepName = `zero-browser-prepare-${randomUUID()}`;
  const context = path.join(root, "context");
  const debs = path.join(context, "debs");
  const app = path.join(context, "app");
  await mkdir(debs, { recursive: true });
  await mkdir(app);
  try {
    await command("docker", ["pull", "--platform=linux/amd64", plan.nodeSource], {
      log: path.join(root, "node-pull.log"),
    });
    const nodeSource = await image(plan.nodeSource);
    if (nodeSource.bytes > 350 * MiB) throw new Error("node_source_image_cap");
    const base = await image(plan.base);
    const archive = path.join(root, "shell.zip");
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: Explicit operator-selected captured preparation cache; never a runtime input.
    const archiveSource = process.env.ZERO_BROWSER_IMAGE_ARCHIVE;
    if (archiveSource) {
      const source = await realpath(archiveSource);
      if (
        !source.startsWith(`${local}/`) ||
        !(await lstat(source)).isFile() ||
        (await shaFile(source)) !== plan.browserArchiveSha256
      )
        throw new Error("browser_archive_cache_rejected");
      await link(source, archive);
    } else
      await command("curl", [
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--max-time",
        "120",
        "--max-filesize",
        String(plan.browserArchiveBytes),
        "--output",
        archive,
        plan.browserUrl,
      ]);
    const archiveInfo = await lstat(archive);
    if (archiveInfo.size !== plan.browserArchiveBytes)
      throw new Error("browser_archive_size_changed");
    const archiveSha256 = await shaFile(archive);
    if (archiveSha256 !== plan.browserArchiveSha256)
      throw new Error("browser_archive_hash_changed");
    // Extraction rejects traversal, links, special entries and oversized contents before writing.
    const extract = `import zipfile,pathlib,stat\nz=zipfile.ZipFile('/source/shell.zip')\nentries=z.infolist()\nassert len(entries)<=512\nassert sum(i.file_size for i in entries)<=${plan.caps.extractedBrowser}\nfor i in entries:\n p=pathlib.PurePosixPath(i.filename)\n assert not p.is_absolute() and '..' not in p.parts and p.parts[0]=='chrome-headless-shell-linux64'\n assert not stat.S_ISLNK(i.external_attr>>16)\n assert not (i.external_attr>>16) or stat.S_ISREG(i.external_attr>>16) or stat.S_ISDIR(i.external_attr>>16)\nz.extractall('/output')\nfor i in entries:\n p=pathlib.Path('/output')/i.filename\n if p.is_file(): p.chmod(0o755 if i.filename.endswith('/chrome-headless-shell') or i.filename.endswith('/chrome_crashpad_handler') else 0o644)\n`;
    const chromium = path.join(context, "chromium");
    await mkdir(chromium);
    await command("docker", [
      "run",
      "--rm",
      "--pull=never",
      "--network=none",
      "--read-only",
      "--memory=128m",
      "--cpus=1",
      "--pids-limit=32",
      `--user=${process.getuid()}:${process.getgid()}`,
      "--mount",
      `type=bind,source=${root},target=/source,readonly`,
      "--mount",
      `type=bind,source=${chromium},target=/output`,
      "--entrypoint=python",
      plan.base,
      "-c",
      extract,
    ]);
    const browser = await inventory(chromium, plan.caps.extractedBrowser);
    if (!browser.files.some((file) => /license|notice|credits/i.test(file.path)))
      throw new Error("chromium_notices_missing");
    const apt = `import subprocess,shlex,json,pathlib,os\noptions=['-o','Debug::NoLocking=1','-o','Dir::Cache::archives=/cache','-o','Dir::State::extended_states=/tmp/extended_states']\nsubprocess.run(['apt-get',*options,'update'],check=True)\nargs=['apt-get',*options,'-y','--download-only','--no-install-recommends','install',*${JSON.stringify(packages)}]\nraw=subprocess.check_output([*args,'--print-uris'],text=True)\nuris=[shlex.split(line) for line in raw.splitlines() if line.startswith("'")]\nassert 0<len(uris)<=128 and sum(int(row[2]) for row in uris)<=${plan.caps.debs}\npathlib.Path('/cache/apt-uris.json').write_text(json.dumps(uris))\ntry:\n subprocess.run(args,check=True)\nfinally:\n for p in pathlib.Path('/cache').rglob('*'):\n  if not p.is_symlink(): os.chown(p,${process.getuid()},${process.getgid()})\n`;
    await command(
      "docker",
      [
        "run",
        "--rm",
        "--pull=never",
        "--name",
        prepName,
        "--memory=512m",
        "--cpus=2",
        "--pids-limit=128",
        "--read-only",
        "--tmpfs=/var/lib/apt/lists:rw,nosuid,nodev,size=67108864",
        "--tmpfs=/tmp:rw,nosuid,nodev,size=16777216",
        "--mount",
        `type=bind,source=${debs},target=/cache`,
        "--entrypoint=python",
        plan.base,
        "-c",
        apt,
      ],
      { log: path.join(root, "apt-download.log") },
    );
    const archives = (await inventory(debs, plan.caps.debs)).files.filter((file) =>
      file.path.endsWith(".deb"),
    );
    if (!archives.length || archives.length > 128) throw new Error("apt_closure_rejected");
    const aptPackages = [];
    for (const file of archives) {
      const fields = (
        await command("dpkg-deb", [
          "--show",
          // biome-ignore lint/suspicious/noTemplateCurlyInString: dpkg-deb field syntax must be literal.
          "--showformat=${Package}\t${Version}\t${Architecture}",
          path.join(debs, file.path),
        ])
      ).split("\t");
      if (fields.length !== 3) throw new Error("apt_metadata_rejected");
      aptPackages.push({
        ...file,
        package: fields[0],
        version: fields[1],
        architecture: fields[2],
      });
    }
    const downloadsUpperBound =
      plan.nodeCompressedBytes +
      archiveInfo.size +
      archives.reduce((sum, file) => sum + file.bytes, 0) +
      64 * MiB;
    if (downloadsUpperBound > plan.caps.downloads) throw new Error("download_cap");
    const bundler = requireAdapter("esbuild");
    if (bundler.version !== "0.28.2") throw new Error("bundler_version_changed");
    const built = await bundler.build({
      absWorkingDir: platform,
      entryPoints: [path.join(platform, "packages/adapters/src/zero-browser-container-entry.ts")],
      outfile: path.join(app, "entrypoint.mjs"),
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      external: ["playwright-core", "jsdom"],
      metafile: true,
      legalComments: "external",
      banner: {
        js: "import { createRequire as zeroCreateRequire } from 'node:module'; const require = zeroCreateRequire(import.meta.url);",
      },
    });
    // Shared offline installed-package copier retains exact package assets and pnpm topology.
    const { copyRuntimePackageClosure } = await import("./lib/runtime-package-closure.mjs");
    const closure = await copyRuntimePackageClosure({
      workspaceRoot: platform,
      importers: [
        {
          file: path.join(platform, "packages/adapters/package.json"),
          packages: ["jsdom", "playwright-core"],
        },
      ],
      outputDirectory: path.join(app, "runtime"),
      maxBytes: 48 * MiB,
    });
    await symlink("runtime/node_modules", path.join(app, "node_modules"));
    await writeFile(
      path.join(root, "bundle-metafile.json"),
      JSON.stringify(built.metafile, null, 2),
    );
    const repository = path.dirname(platform);
    await mkdir(path.join(app, "notices"));
    for (const file of ["LICENSE", "NOTICE"])
      await cp(path.join(repository, file), path.join(app, "notices", `repository-${file}`));
    const bundleLicenses = await bundledNotices(built.metafile.inputs, path.join(app, "notices"));
    const inputLock = {
      ...plan,
      base,
      nodeSource,
      browserArchiveSha256: archiveSha256,
      browser,
      aptPackages,
      closure,
      bundleLicenses,
      application: await inventory(app, 64 * MiB),
      downloadsUpperBound,
    };
    const lockBytes = JSON.stringify(inputLock, null, 2);
    await writeFile(path.join(app, "build-input-lock.json"), lockBytes, { flag: "wx" });
    await writeFile(path.join(root, "build-input-lock.json"), lockBytes, { flag: "wx" });
    const notices = `import pathlib,hashlib,json,subprocess\nrows=[]\nfor row in subprocess.check_output(['dpkg-query','-W','-f=\${Package}\\t\${Version}\\n'],text=True).splitlines():\n name,version=row.split('\\t')\n p=pathlib.Path('/usr/share/doc')/name/'copyright'\n rows.append(dict(package=name,version=version,copyrightSha256=hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None))\npathlib.Path('/opt/zero-browser/system-notices.json').write_text(json.dumps(rows))\n`;
    await writeFile(path.join(context, "system-notices.py"), notices);
    await writeFile(
      path.join(context, "Dockerfile"),
      `FROM ${plan.base}\nRUN --mount=type=bind,source=debs,target=/prepared-debs,readonly dpkg -i /prepared-debs/*.deb\nCOPY --from=${plan.nodeSource} /usr/local/bin/node /usr/local/bin/node\nCOPY --from=${plan.nodeSource} /usr/local/LICENSE /usr/share/doc/zero-browser-node/LICENSE\nCOPY chromium /opt/chromium\nCOPY app /opt/zero-browser\nCOPY system-notices.py /tmp/system-notices.py\nRUN python /tmp/system-notices.py && rm /tmp/system-notices.py\nLABEL org.repositoryzero.browser.profile="${plan.profile}" org.repositoryzero.browser.input-lock-sha256="${sha(lockBytes)}"\nENV HOME=/tmp LANG=C.UTF-8\nWORKDIR /opt/zero-browser\nUSER 1000:1000\nENTRYPOINT ["/usr/local/bin/node","/opt/zero-browser/entrypoint.mjs"]\n`,
    );
    await command(
      "docker",
      ["build", "--network=none", "--pull=false", "--tag", sourceTag, context],
      { timeoutMs: 180_000, log: path.join(root, "build.log") },
    );
    const final = await image(sourceTag);
    if (final.bytes > plan.caps.image) throw new Error("browser_image_cap");
    const profile = {
      ...plan,
      image: final,
      buildInputLockSha256: sha(lockBytes),
      sourceImage: nodeSource,
      preparationApparentBytes:
        base.bytes +
        nodeSource.bytes +
        final.bytes +
        archiveInfo.size +
        browser.bytes +
        inputLock.application.bytes +
        archives.reduce((sum, file) => sum + file.bytes, 0),
      preparationPeak:
        "NOT_MEASURED: apparent image totals overlap shared layers and omit BuildKit cache/storage-driver overhead",
      retainedPreparation:
        "Source Node image, archive, extracted files, debs and failed evidence remain; not silently excluded from cold preparation inventory",
      qualification: "NOT_RUN",
    };
    await writeFile(path.join(root, "image-profile.json"), JSON.stringify(profile, null, 2), {
      flag: "wx",
    });
    console.log(
      JSON.stringify({
        state: "prepared_not_qualified",
        imageId: final.id,
        imageBytes: final.bytes,
        evidenceDirectory: root,
      }),
    );
  } catch (error) {
    await writeFile(
      path.join(root, "failure.json"),
      JSON.stringify({
        state: "FAIL",
        reason: error instanceof Error ? error.message : "preparation_failed",
        diagnostics: error instanceof Error ? (error.diagnostics ?? null) : null,
      }),
      { flag: "wx" },
    );
    throw error;
  } finally {
    await command("docker", ["rm", "--force", prepName], { timeoutMs: 5000 }).catch(() => {});
  }
}

const action = process.argv[2] ?? "plan";
if (process.argv.length > 3 || !["plan", "prepare"].includes(action))
  throw new Error("plan_or_prepare_required");
if (action === "plan") console.log(JSON.stringify(plan, null, 2));
else await prepare();
