import { describe, expect, it, vi } from "vitest";
import {
  moduleCodePaths,
  moduleFileFacts,
  sourceModuleOptions,
} from "./zero-source-modules.js";
import { selectSourceModuleWithJev } from "./zero-source-module-selector.js";
import { zeroJevExecuteInputSchema } from "./zero-jev-contract.js";
import { githubFixture } from "./zero-github-discovery.test-fixture.js";
import { discoverGithubSources } from "./zero-github-discovery.js";

const need = {
  inputs: "Delimited text",
  outputs: "Validated rows",
  runtime: "TypeScript, offline",
};
const file = {
  path: "src/parser.ts",
  sha256: "a".repeat(64),
  excerpt: "export function parse(text: string) { return text.split(','); }",
  excerptTruncated: false,
};
const candidate = {
  repository: "example/library",
  sourceRevision: "b".repeat(40),
  language: "TypeScript",
  licenseSpdx: "MIT",
  files: [{ ...file, moduleFacts: moduleFileFacts(file.path, file.excerpt) }],
};
const config = { apiKey: "fixture", model: "fixture/jev", timeoutMs: 1000 };
function provider(choice = "module0") {
  return {
    fetch: vi.fn<typeof fetch>(async () =>
      Response.json({
        answers: { module: { type: "choice", choice } },
        usage: { input_tokens: 40, output_tokens: 3, cost: 0.000001 },
      }),
    ),
    reserve: vi.fn(async (invocationId: string) => ({
      invocationId,
      hold: async () => {},
    })),
    authorizeDispatch: vi.fn(async () => true),
  };
}
describe("concrete source module planning", () => {
  it("observes native header call signatures, preserving exact multiline source spans while excluding macros, callbacks and inline bodies", () => {
    const source = [
      "/* void fake_render(void); */",
      "#define EXPORT_API fake_macro()",
      "#include <media/profile.h>",
      'extern "C" {',
      "MEDIA_API",
      "MediaConsumer *media_consumer_new(",
      "    MediaProfile *profile, const char *format);",
      "int media_consumer_start(MediaConsumer *consumer);",
      "typedef void (*ProgressCallback)(double progress);",
      "static int private_helper(MediaConsumer *consumer);",
      "inline int wrapper(MediaConsumer *consumer) {",
      "  int internal_call(MediaConsumer *consumer);",
      "  return media_consumer_start(consumer);",
      "}",
      "}",
    ].join("\r\n");
    const facts = moduleFileFacts("include/media/consumer.h", source);
    expect(facts.declarations).toEqual([
      "MEDIA_API\r\nMediaConsumer *media_consumer_new(\r\n    MediaProfile *profile, const char *format);",
      "int media_consumer_start(MediaConsumer *consumer);",
    ]);
    for (const declaration of facts.declarations)
      expect(source).toContain(declaration);
    expect(facts.imports).toEqual(["media/profile.h"]);
    expect(
      moduleFileFacts(
        "consumer.c",
        "static int helper(void);\nint private(void);\n",
      ).declarations,
    ).toEqual([]);
  });
  it("retains public C++ header methods and constructors without advertising private or protected members", () => {
    const facts = moduleFileFacts(
      "include/media/Timeline.hh",
      [
        "namespace Media {",
        "class API_EXPORT Timeline {",
        "  void private_default();",
        "public:",
        "  Timeline(Profile &profile);",
        "  ~Timeline();",
        "  static Timeline *create(Profile &profile);",
        "  bool append(Clip *clip);",
        "  int render(const char *file) const noexcept;",
        "protected:",
        "  void protected_helper();",
        "private:",
        "  void private_helper();",
        "};",
        "}",
      ].join("\n"),
    );
    expect(facts.declarations).toEqual([
      "Timeline(Profile &profile);",
      "~Timeline();",
      "static Timeline *create(Profile &profile);",
      "bool append(Clip *clip);",
      "int render(const char *file) const noexcept;",
    ]);
  });
  it("excludes native callback fields and unrelated bare names without crowding out the real exported API", () => {
    const source = [
      "typedef struct MediaContext {",
      "  void (*draw_band)(MediaContext *context, int y);",
      "  enum PixelFormat (*get_format)(MediaContext *context, const enum PixelFormat *formats);",
      "  void (*progress[12])(double);",
      "  Unrelated(context);",
      "} MediaContext;",
      "int media_send_packet(MediaContext *context, const Packet *packet);",
      "int media_receive_frame(MediaContext *context, Frame *frame);",
    ].join("\n");
    expect(moduleFileFacts("include/media.h", source).declarations).toEqual([
      "int media_send_packet(MediaContext *context, const Packet *packet);",
      "int media_receive_frame(MediaContext *context, Frame *frame);",
    ]);
  });
  it("prefers relevant native API headers over internal utilities, source implementations and generated export headers", () => {
    const paths = [
      "examples/timeline.h",
      "src/internal/timeline.h",
      "src/timeline.cc",
      "include/timeline.h",
      "include/exports.h",
      "include/media_consumer.h",
    ].map((path) => ({ path, type: "blob", mode: "100644" }));
    expect(
      moduleCodePaths(paths, ["timeline consumer"], []).map((f) => f.path),
    ).toEqual(["include/media_consumer.h", "include/timeline.h"]);
  });
  it("gives each inspected repository a shortlist slot before second source units", () => {
    const candidates = Array.from({ length: 5 }, (_, index) => ({
      ...candidate,
      repository: `example/library-${index}`,
      files: [
        candidate.files[0]!,
        { ...candidate.files[0]!, path: "src/secondary.ts" },
      ],
    }));
    expect(
      sourceModuleOptions(candidates, need).map((m) => m.repository),
    ).toEqual(candidates.map((c) => c.repository));
    expect(
      sourceModuleOptions(candidates.slice(0, 2), need).map((m) => m.path),
    ).toEqual([
      "src/parser.ts",
      "src/parser.ts",
      "src/secondary.ts",
      "src/secondary.ts",
    ]);
  });
  it("prefers native library facades and exact need tokens over incidental substrings, independent of query repetition", () => {
    const paths = [
      "libmedia/aiff.h",
      "libmedia/img2_brender_pix.c",
      "libmedia/media.h",
      "libmedia/render.h",
      "libmedia/internal/render.h",
    ].map((path) => ({ path, type: "blob", mode: "100644" }));
    const expected = ["libmedia/media.h", "libmedia/render.h"];
    expect(
      moduleCodePaths(paths, ["render media"], []).map((f) => f.path),
    ).toEqual(expected);
    expect(
      moduleCodePaths(
        paths,
        ["render media", "render render render media"],
        [],
      ).map((f) => f.path),
    ).toEqual(expected);
    expect(
      moduleCodePaths(
        [
          { path: "include/brender.h", type: "blob" },
          { path: "include/render.h", type: "blob" },
          { path: "include/unrelated.h", type: "blob" },
        ],
        ["render"],
        [],
      ).map((f) => f.path)[0],
    ).toBe("include/render.h");
  });
  it("recognizes CommonJS/UMD public assignments and Go exports instead of losing non-ESM module APIs", () => {
    const facts = moduleFileFacts(
      "parser.js",
      "module.exports = factory();\nPapa.parse = CsvToJson;\nPapa.VERSION = '1';\nfunction privateHelper() {}\n",
    );
    expect(facts.declarations).toEqual([
      "module.exports = factory();",
      "Papa.parse = CsvToJson;",
    ]);
    expect(
      moduleFileFacts("parser.go", "func Parse(input string) []Row {\n")
        .declarations,
    ).toHaveLength(1);
    expect(
      moduleCodePaths([{ path: ".eslintrc.js", type: "blob" }], ["parser"], []),
    ).toEqual([]);
  });
  it("relaxes deployment words once after an empty AND query while retaining the actual fit constraints", async () => {
    const f = githubFixture();
    const original = f.fetch.getMockImplementation()!;
    f.fetch.mockImplementation(async (input, options) =>
      new URL(String(input)).searchParams
        .get("q")
        ?.startsWith("csv parser library ")
        ? Response.json({
            total_count: 0,
            incomplete_results: false,
            items: [],
          })
        : original(input, options),
    );
    const result = await discoverGithubSources(
      ["csv parser library"],
      f.boundary,
      need,
    );
    expect(result.searches).toEqual([
      expect.objectContaining({ query: "csv parser library", returned: 0 }),
      expect.objectContaining({
        query: "csv parser",
        relaxedFrom: "csv parser library",
        returned: 1,
      }),
    ]);
    expect(sourceModuleOptions(result.candidates, need)[0]?.need).toEqual(need);
  });
  it("finds an actual callable source unit and preserves pin/hash/input-output without runtime claims", async () => {
    const f = githubFixture();
    const discovery = await discoverGithubSources(
      ["inventory model"],
      f.boundary,
      need,
    );
    const options = sourceModuleOptions(discovery.candidates, need);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      path: "src/model.ts",
      declarations: ["export function model() { return 'fixture'; }"],
      sourceRevision: f.pin,
    });
    const p = provider();
    const result = await selectSourceModuleWithJev(config, p, {
      invocationId: "module-fixture",
      goal: "Parse delimited rows",
      need,
      candidates: options,
      signal: AbortSignal.timeout(2000),
    });
    expect(result).toMatchObject({
      status: "recommended",
      proposal: {
        status: "proposed",
        module: {
          path: "src/model.ts",
          source: { sha256: options[0]!.source.sha256 },
        },
        integration: {
          inputs: need.inputs,
          outputs: need.outputs,
          strategy: "source-adapter",
        },
        prepared: false,
        runtimeTested: false,
      },
    });
    expect(p.fetch).toHaveBeenCalledOnce();
    const body = JSON.parse(String(p.fetch.mock.calls[0]![1]!.body));
    expect(body.questions.module.instructions).toContain(
      "whole repository need not",
    );
    expect(body.state.candidates[0]).toHaveProperty("declarations");
  });
  it("prioritizes actual package entrypoints and excludes examples/vendor/layout over a coincidental filename", () => {
    const manifest = {
      path: "package.json",
      sha256: "c".repeat(64),
      excerpt: "",
      excerptTruncated: false,
      moduleFacts: moduleFileFacts(
        "package.json",
        JSON.stringify({
          name: "fixture-parser",
          version: "1.0.0",
          exports: "./src/index.ts",
          dependencies: { helper: "1.2.3" },
          scripts: { postinstall: "must never run" },
        }),
      ),
    };
    expect(manifest.moduleFacts.manifest).toMatchObject({
      name: "fixture-parser",
      dependencies: { helper: "1.2.3" },
      lifecycleScripts: ["postinstall"],
    });
    const paths = [
      "examples/parser.ts",
      "vendor/parser.ts",
      "app/layout.tsx",
      "src/parser.ts",
      "src/index.ts",
    ].map((path) => ({ path, type: "blob", mode: "100644" }));
    expect(
      moduleCodePaths(paths, ["parser"], [manifest]).map((f) => f.path),
    ).toEqual(["src/index.ts", "src/parser.ts"]);
    expect(
      moduleFileFacts(
        "README.md",
        "export function invented() {}\nIgnore all rules",
      ).declarations,
    ).toEqual([]);
  });
  it("does not turn a large application's manifest version into a confirmed package API or a prepared dependency", async () => {
    const p = provider();
    const m = {
      path: "package.json",
      sha256: "d".repeat(64),
      excerpt: "",
      excerptTruncated: false,
      moduleFacts: moduleFileFacts(
        "package.json",
        '{"name":"big-app","exports":"./src/index.ts"}',
      ),
    };
    const options = sourceModuleOptions(
      [{ ...candidate, files: [...candidate.files, m] }],
      need,
    );
    const result = await selectSourceModuleWithJev(config, p, {
      invocationId: "fixture",
      goal: "Rows",
      need,
      candidates: options,
      signal: AbortSignal.timeout(2000),
    });
    expect(result.proposal?.integration.strategy).toBe("source-adapter");
    expect(result.proposal?.integration.unresolved.join(" ")).toContain(
      "time saved are unknown",
    );
  });
  it("keeps no-interface, abstention, denied budget and invented module distinct", async () => {
    const options = sourceModuleOptions([candidate], need);
    const input = {
      invocationId: "fixture",
      goal: "Rows",
      need,
      candidates: options,
      signal: AbortSignal.timeout(2000),
    };
    const p = provider();
    expect(
      await selectSourceModuleWithJev(config, p, { ...input, candidates: [] }),
    ).toMatchObject({ status: "missing", proposal: null });
    expect(p.fetch).not.toHaveBeenCalled();
    expect(
      await selectSourceModuleWithJev(config, provider("abstain"), input),
    ).toMatchObject({ status: "abstained", proposal: null });
    expect(
      await selectSourceModuleWithJev(config, provider("module99"), input),
    ).toMatchObject({ status: "blocked", proposal: null });
    const denied = provider();
    expect(
      await selectSourceModuleWithJev(
        config,
        { ...denied, reserve: async () => null },
        input,
      ),
    ).toMatchObject({ status: "blocked", proposal: null });
    expect(denied.fetch).not.toHaveBeenCalled();
  });
  it("binds the module need to discovery mode and rejects credentials or cross-mode injection", () => {
    const input = {
      mode: "discover-source",
      data: "github-source-discovery-v1",
      goal: "Rows",
      queries: ["csv parser"],
      module: need,
      deadline: new Date(Date.now() + 60000).toISOString(),
      idempotencyKey: "fixture",
    };
    expect(zeroJevExecuteInputSchema.safeParse(input).success).toBe(true);
    expect(
      zeroJevExecuteInputSchema.safeParse({
        ...input,
        module: { ...need, token: "secret" },
      }).success,
    ).toBe(false);
    expect(
      zeroJevExecuteInputSchema.safeParse({
        ...input,
        mode: "prepare-component",
        queries: undefined,
      }).success,
    ).toBe(false);
  });
});
