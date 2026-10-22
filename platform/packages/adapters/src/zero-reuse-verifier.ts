import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ZeroPreparedReuseModule } from "./zero-reuse-module.js";
import { zeroCsvHash, validateZeroCsv } from "./zero-csv-profile.js";
import { captureZeroDockerProcess } from "./zero-docker-process.js";
import type { ProjectSnapshotLimits } from "./zero-project-snapshot.js";
import { createProjectSnapshotter } from "./zero-project-snapshot.js";
import { readZeroZip } from "./zero-zip-reference.js";

export interface ZeroReuseVerifierConfig {
  projectRoot: string;
  stagingRoot: string;
  dockerExecutable: string;
  imageId: string;
  entrypoints: { csv?: string; zip?: string };
  /** Operator-declared directory relative to the host workspace, exposed without absolute paths. */
  projectRelativeRoot?: string;
  limits: ProjectSnapshotLimits;
}
export const ZERO_REUSE_CSV_CASES = [
  "sku,name\nA,one\n",
  'sku,name\r\n"A,B","x""y"\r\n',
  'sku,name\nŽ,"line\nnext"\n',
  "\ufeffsku,name\nA,一\n",
];
export const ZERO_REUSE_INVALID_CSV = [
  "a,b\n1",
  'a,b\n"unfinished,x',
  'a,b\n"x"tail,y',
  'a,b\nhe"llo,y',
  "a,b\r1,2",
];
export const ZERO_REUSE_ZIP_CASES: Record<string, string>[] = [
  { "items.csv": "sku,name\nA,一\n", "manifest.json": '{"version":1}' },
  { "empty.txt": "", "notes.txt": "line\n" + "repeat ".repeat(40) },
];

/** Actual vendor-function trace, not a claim of adversarial same-VM isolation. */
export const ZERO_REUSE_HARNESS = String.raw`
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
let raw=''; for await (const chunk of process.stdin) raw+=chunk;
const { root, entrypoint, toolId, inputs, invalid, nonce }=JSON.parse(raw);
const stringify=JSON.stringify.bind(JSON), clone=structuredClone, output=process.stdout.write.bind(process.stdout);
const records=[], append=Array.prototype.push.bind(records), key='__zero_'+nonce;
const d3=toolId==='module.csv.d3', zip=toolId==='module.zip.fflate';
const target=pathToFileURL(path.join(root,d3?'vendor/d3-dsv/src/csv.js':zip?'vendor/fflate/fflate.cjs':'vendor/papaparse/papaparse.cjs')).href;
globalThis[key]=(input,result)=>append({input:clone(input),result:clone(result)});
const hooks=registerHooks({load(url,context,next){const loaded=next(url,context); if(url!==target)return loaded;
 const source=typeof loaded.source==='string'?loaded.source:Buffer.from(loaded.source).toString('utf8');
 const prefix='const __record=globalThis['+stringify(key)+']; delete globalThis['+stringify(key)+'];\n';
 if(d3){const declaration='export var csvParseRows = csv.parseRows;'; if(source.split(declaration).length!==2)throw Error('instrumentation');return {...loaded,source:prefix+source.replace(declaration,'export var csvParseRows=function(input){ const result=csv.parseRows(input);__record(input,result); return result; };')};}
 const name=zip?'zipSync':'parse';
 return {...loaded,source:prefix+source+'\nconst __original=module.exports.'+name+'; module.exports.'+name+'=function(...args){const result=__original.apply(this,args);__record(args[0],'+(zip?'result':'result.data')+');return result;};\n'};
}});
try { await import(target); const app=await import(pathToFileURL(path.join(root,entrypoint)).href);const fn=app[zip?'createZip':'parseCsv']; if(typeof fn!=='function')throw Error('entrypoint');
 const cases=[];for(const input of inputs){const before=records.length;const actual=clone(await fn(input));cases.push({actual:zip?Buffer.from(actual).toString('base64'):actual,calls:records.slice(before).map(call=>zip?{input:Object.fromEntries(Object.entries(call.input).map(([name,bytes])=>[name,Buffer.from(bytes).toString('base64')])),result:Buffer.from(call.result).toString('base64')}:call)});}
 const rejections=[];for(const input of invalid){try{await fn(input);rejections.push(false);}catch{rejections.push(true);}}
 output(stringify({nonce,nodeVersion:process.versions.node,cases,rejections}));
}catch{output(stringify({nonce,error:'application_failed'}));}finally{hooks.deregister();}
`;

export function checkZeroReuseHarness(
  module: ZeroPreparedReuseModule,
  value: unknown,
  nonce: string,
) {
  const result = value as {
    nonce: string;
    error?: string;
    nodeVersion: string;
    cases: { actual: unknown; calls: { input: unknown; result: unknown }[] }[];
    rejections: boolean[];
  };
  const csv = module.capability === "csv";
  const inputs = csv ? ZERO_REUSE_CSV_CASES : ZERO_REUSE_ZIP_CASES;
  if (
    !result ||
    result.nonce !== nonce ||
    result.error ||
    !/^24\.|^(?:2[6-9]|[3-9]\d)\./.test(result.nodeVersion) ||
    !Array.isArray(result.cases) ||
    result.cases.length !== inputs.length ||
    !Array.isArray(result.rejections) ||
    result.rejections.length !== (csv ? ZERO_REUSE_INVALID_CSV.length : 3) ||
    result.rejections.some((x) => x !== true)
  )
    return false;
  return result.cases.every((value, index) => {
    if (
      !value ||
      !Array.isArray(value.calls) ||
      !value.calls.length ||
      value.calls.length > 8
    )
      return false;
    const input = inputs[index]!;
    if (csv) {
      const text = String(input).replace(/^\ufeff/u, "");
      const expected = JSON.stringify(validateZeroCsv(text));
      return (
        JSON.stringify(value.actual) === expected &&
        value.calls.every((call) => {
          let rows = call.result;
          // Papa emits a final empty record for a terminating newline; the adapter removes it.
          if (
            module.toolId === "module.csv.papaparse" &&
            text.endsWith("\n") &&
            Array.isArray(rows) &&
            JSON.stringify(rows.at(-1)) === '[""]'
          )
            rows = rows.slice(0, -1);
          return call.input === text && JSON.stringify(rows) === expected;
        })
      );
    }
    if (
      typeof value.actual !== "string" ||
      value.calls.some((call) => {
        if (
          call.result !== value.actual ||
          !call.input ||
          typeof call.input !== "object"
        )
          return true;
        const supplied = call.input as Record<string, string>,
          expected = input as Record<string, string>;
        return (
          JSON.stringify(Object.keys(supplied).sort()) !==
            JSON.stringify(Object.keys(expected).sort()) ||
          Object.entries(expected).some(
            ([name, text]) =>
              typeof supplied[name] !== "string" ||
              supplied[name] !== Buffer.from(text).toString("base64"),
          )
        );
      })
    )
      return false;
    try {
      const bytes = Buffer.from(value.actual, "base64");
      if (bytes.toString("base64") !== value.actual) return false;
      const files = readZeroZip(bytes),
        expected = input as Record<string, string>;
      return (
        JSON.stringify(Object.keys(files).sort()) ===
          JSON.stringify(Object.keys(expected).sort()) &&
        Object.entries(expected).every(([name, text]) =>
          files[name]!.equals(Buffer.from(text)),
        )
      );
    } catch {
      return false;
    }
  });
}

export async function verifyZeroReuseModule(
  config: ZeroReuseVerifierConfig,
  module: ZeroPreparedReuseModule,
  scopeId: string,
  signal: AbortSignal,
  beforeDispatch: () => Promise<void>,
) {
  if (
    process.platform !== "linux" ||
    !process.getuid?.() ||
    !/^sha256:[a-f0-9]{64}$/.test(config.imageId) ||
    !path.isAbsolute(config.dockerExecutable) ||
    /[,\r\n]/.test(
      config.projectRoot + config.stagingRoot + config.dockerExecutable,
    ) ||
    config.limits.maxTotalBytes > 524288 ||
    config.limits.maxFiles > 16
  )
    throw Error("invalid_reuse_verifier");
  const entrypoint = config.entrypoints[module.capability];
  if (!entrypoint || module.files.some((file) => file.path === entrypoint))
    throw Error("reuse_entrypoint_unavailable");
  const files = [...module.files.map((file) => file.path), entrypoint];
  const snapshotter = await createProjectSnapshotter({
    ...config,
    scopeId,
    allowedFiles: files,
  });
  const snapshot = await snapshotter.snapshot({ scopeId, files });
  const base = {
    profile: "zero-reuse-modules-v1",
    snapshot: { sha256: snapshot.sha256, manifest: snapshot.manifest },
    moduleProfile: module.profileId,
    imageId: config.imageId,
    harnessSha256: zeroCsvHash(ZERO_REUSE_HARNESS),
    limitations: [
      "Component snapshot conformance and vendor invocation trace; no whole-application or hostile-user guarantee",
      "Later host edits require a new check",
    ],
  };
  if (
    module.files.some(
      (file) =>
        snapshot.manifest.files.find((entry) => entry.path === file.path)
          ?.sha256 !== file.sha256,
    )
  )
    return { ...base, outcome: "fail", reason: "source_mismatch" };
  for (const file of snapshot.manifest.files)
    if (
      zeroCsvHash(
        await readFile(path.join(snapshot.directory, "files", file.path)),
      ) !== file.sha256
    )
      throw Error("reuse_snapshot_changed");
  await beforeDispatch();
  signal.throwIfAborted();
  const control = await mkdtemp(
    path.join(config.stagingRoot, "zero-reuse-control-"),
  );
  const container = `zero-reuse-${randomUUID()}`,
    nonce = randomUUID();
  try {
    const runner = path.join(control, "runner.mjs");
    await writeFile(runner, ZERO_REUSE_HARNESS, { mode: 0o400, flag: "wx" });
    const payload = {
      root: "/project",
      entrypoint,
      toolId: module.toolId,
      nonce,
      inputs:
        module.capability === "csv"
          ? ZERO_REUSE_CSV_CASES
          : ZERO_REUSE_ZIP_CASES,
      invalid:
        module.capability === "csv"
          ? ZERO_REUSE_INVALID_CSV
          : [{ "../bad": "x" }, { "huge.txt": "x".repeat(131073) }, {}],
    };
    const run = await captureZeroDockerProcess(
      config.dockerExecutable,
      [
        "--host",
        "unix:///var/run/docker.sock",
        "run",
        "--pull=never",
        "--rm",
        "--name",
        container,
        "--network=none",
        "--ipc=none",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        `--user=${process.getuid()}:${process.getgid!()}`,
        "--memory=128m",
        "--memory-swap=128m",
        "--cpus=1",
        "--pids-limit=32",
        "--ulimit=nofile=64:64",
        "--ulimit=cpu=5:5",
        "--log-driver=none",
        "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=8388608",
        "--workdir=/project",
        "--mount",
        `type=bind,source=${path.join(snapshot.directory, "files")},target=/project,readonly`,
        "--mount",
        `type=bind,source=${runner},target=/zero-runner.mjs,readonly`,
        "--entrypoint=/usr/local/bin/node",
        "-i",
        config.imageId,
        "--max-old-space-size=64",
        "/zero-runner.mjs",
      ],
      control,
      JSON.stringify(payload),
      signal,
      10000,
      65536,
    );
    let passed = false;
    try {
      passed =
        !run.reason &&
        run.code === 0 &&
        checkZeroReuseHarness(module, JSON.parse(run.stdout), nonce);
    } catch {
      /* Invalid candidate output is a failed check. */
    }
    return {
      ...base,
      outcome: passed ? "pass" : "fail",
      reason: passed
        ? "conformance_and_actual_use"
        : (run.reason ?? "component_conformance_or_actual_use_failed"),
      execution: { code: run.code, outputSha256: zeroCsvHash(run.stdout) },
      cases:
        module.capability === "csv"
          ? ZERO_REUSE_CSV_CASES.length + ZERO_REUSE_INVALID_CSV.length
          : ZERO_REUSE_ZIP_CASES.length + 3,
    };
  } finally {
    await captureZeroDockerProcess(
      config.dockerExecutable,
      ["--host", "unix:///var/run/docker.sock", "rm", "--force", container],
      control,
      "",
      AbortSignal.timeout(3000),
      3000,
      65536,
    );
    await rm(control, { recursive: true, force: true });
  }
}
