import { createHash } from "node:crypto";
import { lstat, mkdir, opendir, readFile, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type {
  AdapterContext,
  ArtifactStore,
  BrowserSnapshotNode,
  ComputerRef,
} from "@rakazo/adapter-kit";
import type { BrowserContext, BrowserServer, ElementHandle, Page } from "playwright-core";
import { chromium } from "playwright-core";
import { z } from "zod";
import {
  browserActFromTool,
  browserNavigateFromTool,
  browserSnapshotFromTool,
} from "./browser-tools.js";
import { ComputerBrowserProvider } from "./computer-browser.js";
import {
  ZERO_BROWSER_FIXTURE_ORIGIN,
  ZERO_BROWSER_FIXTURES,
  ZERO_BROWSER_RESEARCH_PROFILE,
  ZERO_BROWSER_RESEARCH_TASKS,
} from "./zero-browser-research-profile.js";

export const ZERO_BROWSER_RESEARCH_LIMITS = Object.freeze({
  pages: 1,
  navigations: 3,
  requests: 16,
  resources: 16,
  resourceBytes: 16_384,
  resourceTotalBytes: 131_072,
  responseTotalBytes: 262_144,
  actions: 4,
  elements: 32,
  textBytes: 4096,
  sourceBytes: 32_768,
  screenshotBytes: 1_048_576,
  traceBytes: 1_048_576,
  wallMs: 12_000,
  actionMs: 2000,
  cleanupMs: 2000,
  stagingSlots: 4,
});
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const inputSchema = z
  .object({ taskId: z.enum(ZERO_BROWSER_RESEARCH_TASKS.map((task) => task.id)) })
  .strict();
const csp =
  "default-src 'none'; script-src 'nonce-zero-fixture-v1'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

/** Operator-only configuration. Neither executable paths, fixture bodies nor identity are tool inputs. */
export interface ZeroBrowserResearchConfig {
  executablePath: string;
  /** Dedicated, existing mode-0700 staging directory for this trusted scope. */
  stagingRoot: string;
  authorize: (context: AdapterContext) => Promise<void>;
  /** Trusted fixture override for failure controls; never accepted by the request schema. */
  fixtures?: Readonly<Record<string, string>>;
}
export type ZeroBrowserResearchReceipt = {
  profile: typeof ZERO_BROWSER_RESEARCH_PROFILE;
  taskId: string;
  outcome: "pass" | "fail" | "blocked" | "cancelled" | "unknown";
  reason: string;
  assertion?: { expected: string; actual: string; passed: boolean };
  sourceSetSha256: string;
  taskSha256: string;
  pages: { url: string; title: string; sourceSha256: string }[];
  sources: { url: string; sha256: string; bytes: number }[];
  events: { kind: string; value: string }[];
  actualUse: { provider: "computer"; navigate: number; snapshot: number; act: number };
  runtime: {
    playwright: "1.63.0";
    chromium: string | null;
    cleanup: "not_started" | "closed" | "force_killed" | "unknown";
  };
  screenshotArtifact?: { storageKey: string; sha256: string; bytes: number; mimeType: "image/png" };
  traceArtifact?: {
    storageKey: string;
    sha256: string;
    bytes: number;
    mimeType: "application/zip";
  };
  limits: typeof ZERO_BROWSER_RESEARCH_LIMITS;
  paidModelCalls: 0;
  limitations: readonly string[];
};
function rejected(reason: string): never {
  throw new Error(reason);
}

export function isZeroBrowserFixtureUrl(
  value: string,
  fixtures: Readonly<Record<string, string>> = ZERO_BROWSER_FIXTURES,
) {
  try {
    const url = new URL(value);
    return (
      url.origin === ZERO_BROWSER_FIXTURE_ORIGIN &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      value === `${ZERO_BROWSER_FIXTURE_ORIGIN}${url.pathname}` &&
      Object.hasOwn(fixtures, url.pathname)
    );
  } catch {
    return false;
  }
}

async function reserve(config: ZeroBrowserResearchConfig) {
  if (
    process.platform !== "linux" ||
    typeof process.getuid !== "function" ||
    process.getuid() === 0 ||
    !path.isAbsolute(config.executablePath) ||
    !path.isAbsolute(config.stagingRoot) ||
    config.stagingRoot === "/" ||
    config.stagingRoot === "/mnt" ||
    config.stagingRoot.startsWith("/mnt/") ||
    (await realpath(config.stagingRoot)) !== config.stagingRoot
  )
    rejected("browser_operator_config_rejected");
  const root = await lstat(config.stagingRoot);
  if (
    !root.isDirectory() ||
    root.isSymbolicLink() ||
    root.uid !== process.getuid() ||
    (root.mode & 0o777) !== 0o700
  )
    rejected("browser_operator_config_rejected");
  for await (const entry of await opendir(config.stagingRoot)) {
    if (!/^slot-[0-3]$/u.test(entry.name) || !entry.isDirectory())
      rejected("browser_staging_operator_cleanup_required");
  }
  for (let slot = 0; slot < ZERO_BROWSER_RESEARCH_LIMITS.stagingSlots; slot++) {
    const directory = path.join(config.stagingRoot, `slot-${slot}`);
    try {
      await mkdir(directory, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    const identity = await lstat(directory);
    return {
      directory,
      release: async () => {
        const current = await lstat(directory);
        if (
          !current.isDirectory() ||
          current.isSymbolicLink() ||
          current.dev !== identity.dev ||
          current.ino !== identity.ino
        )
          rejected("browser_staging_operator_cleanup_required");
        await rm(directory, { recursive: true });
      },
    };
  }
  rejected("browser_staging_operator_cleanup_required");
}

/**
 * One finite synthetic research run using the existing BrowserProvider/tool boundary.
 * This is a trusted-fixture development profile, not a hostile-browser OS sandbox.
 */
export async function runZeroBrowserResearch(
  config: ZeroBrowserResearchConfig,
  input: unknown,
  context: AdapterContext,
  artifacts: ArtifactStore,
): Promise<ZeroBrowserResearchReceipt> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) rejected("browser_request_rejected");
  const { taskId } = parsed.data;
  if (createRequire(import.meta.url)("playwright-core/package.json").version !== "1.63.0")
    rejected("browser_operator_config_rejected");
  const task = ZERO_BROWSER_RESEARCH_TASKS.find((candidate) => candidate.id === taskId)!;
  const fixtures: Readonly<Record<string, string>> = Object.freeze({
    ...(config.fixtures ?? ZERO_BROWSER_FIXTURES),
  });
  const entries = Object.entries(fixtures);
  if (
    entries.length === 0 ||
    entries.length > ZERO_BROWSER_RESEARCH_LIMITS.resources ||
    entries.some(
      ([key, value]) =>
        !/^\/[a-z0-9-]{1,64}$/u.test(key) ||
        typeof value !== "string" ||
        Buffer.byteLength(value) > ZERO_BROWSER_RESEARCH_LIMITS.resourceBytes,
    ) ||
    entries.reduce((sum, [, value]) => sum + Buffer.byteLength(value), 0) >
      ZERO_BROWSER_RESEARCH_LIMITS.resourceTotalBytes
  )
    rejected("browser_fixture_limit_exceeded");
  const receipt: ZeroBrowserResearchReceipt = {
    profile: ZERO_BROWSER_RESEARCH_PROFILE,
    taskId,
    outcome: "unknown",
    reason: "browser_not_started",
    sourceSetSha256: digest(
      JSON.stringify(entries.map(([url, html]) => [url, digest(html)]).sort()),
    ),
    taskSha256: digest(JSON.stringify(task)),
    pages: [],
    sources: [],
    events: [],
    actualUse: { provider: "computer", navigate: 0, snapshot: 0, act: 0 },
    runtime: { playwright: "1.63.0", chromium: null, cleanup: "not_started" },
    limits: ZERO_BROWSER_RESEARCH_LIMITS,
    paidModelCalls: 0,
    limitations: [
      "Fixed synthetic development tasks; no independent holdout or general research-quality claim",
      "Screenshot records browser appearance; deterministic DOM assertions establish the selected facts",
      "Exact fixture routing and Chromium context restrictions are not hostile-code OS isolation",
      "Browser process memory and disk are not enforced by a kernel quota; trusted fixture inputs and outputs are bounded",
      "Crash staging slots require operator cleanup; durable ArtifactStore lifetime retention is a separate gate",
    ],
  };
  const signal = AbortSignal.any([
    context.signal,
    AbortSignal.timeout(ZERO_BROWSER_RESEARCH_LIMITS.wallMs),
  ]);
  const scoped = { ...context, signal };
  let server: BrowserServer | undefined;
  let browserContext: BrowserContext | undefined;
  let page: Page | undefined;
  let staging: Awaited<ReturnType<typeof reserve>> | undefined;
  let violation: string | undefined;
  let grantDenied = false;
  let requests = 0;
  let responseBytes = 0;
  let navigations = 0;
  let closing: Promise<void> | undefined;
  const stored: string[] = [];
  const refs = new Map<string, ElementHandle>();
  const event = (kind: string, value: string) => {
    if (receipt.events.length >= 64) rejected("browser_event_limit_exceeded");
    receipt.events.push({ kind, value });
  };
  const rejectPolicy = (reason: string) => {
    violation ??= reason;
  };
  const active = () => {
    signal.throwIfAborted();
    if (violation) rejected(violation);
  };
  const authorized = async () => {
    active();
    try {
      await config.authorize(scoped);
    } catch {
      grantDenied = true;
      rejected("browser_scope_rejected");
    }
    active();
  };
  const cleanupBrowser = () => {
    if (closing) return closing;
    if (!server) return Promise.resolve();
    const owned = server;
    server = undefined;
    closing = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          owned
            .close()
            .then(() => {
              receipt.runtime.cleanup = "closed";
            })
            .catch(async () => {
              await owned.kill();
              receipt.runtime.cleanup = "force_killed";
            }),
          new Promise<void>((resolve, reject) => {
            timer = setTimeout(() => {
              void owned.kill().then(() => {
                receipt.runtime.cleanup = "force_killed";
                resolve();
              }, reject);
            }, ZERO_BROWSER_RESEARCH_LIMITS.cleanupMs);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    })();
    return closing;
  };
  const abort = () => {
    void cleanupBrowser().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  const png = async () => {
    active();
    const bytes = await page!.screenshot({
      type: "png",
      fullPage: false,
      timeout: ZERO_BROWSER_RESEARCH_LIMITS.actionMs,
    });
    if (bytes.length > ZERO_BROWSER_RESEARCH_LIMITS.screenshotBytes)
      rejected("browser_screenshot_limit_exceeded");
    return bytes;
  };
  try {
    await authorized();
    staging = await reserve(config);
    await authorized();
    server = await chromium.launchServer({
      executablePath: config.executablePath,
      headless: true,
      timeout: ZERO_BROWSER_RESEARCH_LIMITS.actionMs * 2,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      tracesDir: staging.directory,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", LANG: "C.UTF-8" },
      args: [
        "--disable-background-networking",
        "--disable-component-update",
        "--no-first-run",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        "--host-resolver-rules=MAP * ~NOTFOUND",
      ],
    });
    active();
    const browser = await chromium.connect(server.wsEndpoint(), {
      timeout: ZERO_BROWSER_RESEARCH_LIMITS.actionMs,
    });
    receipt.runtime.chromium = browser.version();
    browserContext = await browser.newContext({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 1,
      acceptDownloads: false,
      serviceWorkers: "block",
      permissions: [],
      locale: "en-US",
      timezoneId: "UTC",
    });
    browserContext.setDefaultTimeout(ZERO_BROWSER_RESEARCH_LIMITS.actionMs);
    browserContext.setDefaultNavigationTimeout(ZERO_BROWSER_RESEARCH_LIMITS.actionMs);
    await browserContext.routeWebSocket("**/*", (socket) => {
      rejectPolicy("browser_websocket_denied");
      socket.close();
    });
    await browserContext.route("**/*", async (route) => {
      try {
        const request = route.request();
        if (++requests > ZERO_BROWSER_RESEARCH_LIMITS.requests)
          rejected("browser_request_limit_exceeded");
        if (request.method() !== "GET" || !isZeroBrowserFixtureUrl(request.url(), fixtures))
          rejected("browser_network_denied");
        const url = new URL(request.url());
        const body = fixtures[url.pathname]!;
        responseBytes += Buffer.byteLength(body);
        if (responseBytes > ZERO_BROWSER_RESEARCH_LIMITS.responseTotalBytes)
          rejected("browser_response_limit_exceeded");
        receipt.sources.push({
          url: request.url(),
          sha256: digest(body),
          bytes: Buffer.byteLength(body),
        });
        event("resource", request.url());
        await route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body,
          headers: {
            "Content-Security-Policy": csp,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      } catch (error) {
        rejectPolicy(
          error instanceof Error && /^browser_[a-z_]+$/u.test(error.message)
            ? error.message
            : "browser_network_denied",
        );
        await route.abort().catch(() => undefined);
      }
    });
    await browserContext.tracing.start({ screenshots: false, snapshots: true, sources: false });
    page = await browserContext.newPage();
    browserContext.on("page", (extra) => {
      if (extra !== page) {
        rejectPolicy("browser_popup_denied");
        void extra.close();
      }
    });
    page.on("download", (download) => {
      rejectPolicy("browser_download_denied");
      void download.cancel();
    });
    page.on("dialog", (dialog) => {
      rejectPolicy("browser_dialog_denied");
      void dialog.dismiss();
    });
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        message.text().startsWith("Not allowed to load local resource:")
      )
        rejectPolicy("browser_navigation_denied");
    });
    page.on("framenavigated", (frame) => {
      if (
        frame !== page!.mainFrame() ||
        ++navigations > ZERO_BROWSER_RESEARCH_LIMITS.navigations ||
        !isZeroBrowserFixtureUrl(frame.url(), fixtures)
      )
        rejectPolicy("browser_navigation_denied");
    });
    const snapshot = async () => {
      active();
      refs.clear();
      const elements: BrowserSnapshotNode[] = [];
      const handles = await page!.locator("a[href],button,input,select,textarea").elementHandles();
      if (handles.length > ZERO_BROWSER_RESEARCH_LIMITS.elements)
        rejected("browser_element_limit_exceeded");
      for (const [index, handle] of handles.entries()) {
        const node = await handle.evaluate((element) => {
          const input = element as HTMLInputElement;
          return {
            tag: input.tagName.toLowerCase(),
            name:
              input.getAttribute("aria-label") ||
              (input.labels?.length
                ? [...input.labels].map((label) => label.textContent).join(" ")
                : element.textContent || ""),
            value: "value" in element ? String(input.value) : undefined,
          };
        });
        const ref = `e${index + 1}`;
        refs.set(ref, handle);
        elements.push({
          ref,
          role: node.tag === "a" ? "link" : node.tag === "button" ? "button" : "textbox",
          name: node.name.trim().slice(0, 128),
          value: node.value?.slice(0, 128),
          tag: node.tag,
        });
      }
      return {
        ok: true,
        url: page!.url(),
        title: await page!.title(),
        elements,
        tree: elements
          .map((node) => `${node.role} ${JSON.stringify(node.name)} [${node.ref}]`)
          .join("\n"),
      };
    };
    const rememberDocument = async () => {
      const source = await page!.content();
      if (Buffer.byteLength(source) > ZERO_BROWSER_RESEARCH_LIMITS.sourceBytes)
        rejected("browser_source_limit_exceeded");
      const document = {
        url: page!.url(),
        title: await page!.title(),
        sourceSha256: digest(source),
      };
      const previous = receipt.pages.at(-1);
      if (previous?.url !== document.url || previous.sourceSha256 !== document.sourceSha256)
        receipt.pages.push(document);
    };
    const provider = new ComputerBrowserProvider({
      liveDriver: async (_computer, request) => {
        await authorized();
        if (request.command === "navigate") {
          receipt.actualUse.navigate++;
          if (!isZeroBrowserFixtureUrl(request.url, fixtures))
            rejected("browser_navigation_denied");
          await page!.goto(request.url, { waitUntil: "load" });
          active();
          event("navigate", page!.url());
          await rememberDocument();
          return { ok: true, url: page!.url(), title: await page!.title() };
        }
        if (request.command === "snapshot") {
          receipt.actualUse.snapshot++;
          return snapshot();
        }
        receipt.actualUse.act++;
        if (request.actions.length > ZERO_BROWSER_RESEARCH_LIMITS.actions)
          rejected("browser_action_limit_exceeded");
        let completed = 0;
        for (const action of request.actions) {
          active();
          const handle = refs.get(action.ref);
          if (!handle) rejected("browser_stale_ref_rejected");
          if (action.kind === "click") {
            const href = await handle.getAttribute("href");
            if (href && !isZeroBrowserFixtureUrl(new URL(href, page!.url()).href, fixtures))
              rejected("browser_navigation_denied");
            if ((await handle.getAttribute("download")) !== null)
              rejected("browser_download_denied");
            await handle.click();
          } else {
            if (
              action.text.length > 128 ||
              (action.origin && action.origin !== new URL(page!.url()).origin)
            )
              rejected("browser_action_rejected");
            await handle.fill(
              action.kind === "type" ? (await handle.inputValue()) + action.text : action.text,
            );
          }
          active();
          completed++;
          event("act", action.kind);
        }
        await rememberDocument();
        return { ...(await snapshot()), completed, uncertain: false };
      },
    });
    const computer: ComputerRef = {
      id: "zero-browser-fixture",
      botId: "zero-browser-fixture",
      kind: "desktop",
      providerRef: "owned-headless-context",
    };
    const navigated = await browserNavigateFromTool(provider, computer, scoped, {
      url: ZERO_BROWSER_FIXTURE_ORIGIN + task.path,
    });
    active();
    if (navigated.error || navigated.fallback) rejected("browser_navigation_failed");
    for (const action of task.actions) {
      const observed = await browserSnapshotFromTool(provider, computer, scoped, {});
      active();
      const node =
        "elements" in observed
          ? observed.elements?.find((candidate) => candidate.name === action.name)
          : undefined;
      if (!node) rejected("browser_expected_element_missing");
      const result = await browserActFromTool(provider, computer, scoped, {
        actions: [
          { kind: action.kind, ref: node.ref, ...("text" in action ? { text: action.text } : {}) },
        ],
      });
      active();
      if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true)
        rejected(
          result &&
            typeof result === "object" &&
            "error" in result &&
            typeof result.error === "string" &&
            /^browser_[a-z_]+$/u.test(result.error)
            ? result.error
            : "browser_action_failed",
        );
    }
    await authorized();
    await rememberDocument();
    let actual: string;
    if (task.observation === "sum") {
      const values = await page.locator("tbody tr td:last-child").allTextContents();
      if (values.length > 16 || values.some((value) => !/^\d{1,6}$/u.test(value)))
        rejected("browser_observation_rejected");
      actual = String(values.reduce((sum, value) => sum + Number(value), 0));
    } else if (task.observation === "minimum") {
      const values = await page.locator("li[data-price]").evaluateAll((nodes) =>
        nodes.map((node) => ({
          name: node.getAttribute("data-name"),
          price: node.getAttribute("data-price"),
        })),
      );
      if (
        !values.length ||
        values.length > 16 ||
        values.some(
          (value) =>
            !value.name || value.name.length > 128 || !/^\d{1,6}$/u.test(value.price ?? ""),
        )
      )
        rejected("browser_observation_rejected");
      values.sort((a, b) => Number(a.price) - Number(b.price));
      actual = `${values[0]!.name}:${values[0]!.price}`;
    } else if (task.observation === "metadata") {
      const value = JSON.parse((await page.locator("#metadata").textContent()) ?? "");
      if (
        typeof value.name !== "string" ||
        value.name.length > 128 ||
        !Number.isFinite(value.variableMeasured)
      )
        rejected("browser_observation_rejected");
      actual = `${value.name}:${value.variableMeasured}`;
    } else {
      await page.locator("#fact").waitFor({ state: "visible" });
      actual = await page.locator("#fact").innerText();
    }
    if (Buffer.byteLength(actual) > ZERO_BROWSER_RESEARCH_LIMITS.textBytes)
      rejected("browser_observation_limit_exceeded");
    receipt.assertion = { expected: task.expected, actual, passed: actual === task.expected };
    const screenshot = await png();
    const tracePath = path.join(staging.directory, "trace.zip");
    await browserContext.tracing.stop({ path: tracePath });
    const info = await lstat(tracePath);
    if (!info.isFile() || info.size > ZERO_BROWSER_RESEARCH_LIMITS.traceBytes)
      rejected("browser_trace_limit_exceeded");
    const trace = await readFile(tracePath);
    await authorized();
    const picture = await artifacts.put(
      { name: "browser-screenshot.png", mimeType: "image/png", bytes: screenshot },
      scoped,
    );
    stored.push(picture.id);
    await authorized();
    const recording = await artifacts.put(
      { name: "browser-trace.zip", mimeType: "application/zip", bytes: trace },
      scoped,
    );
    stored.push(recording.id);
    await authorized();
    receipt.screenshotArtifact = {
      storageKey: picture.id,
      sha256: digest(screenshot),
      bytes: screenshot.length,
      mimeType: "image/png",
    };
    receipt.traceArtifact = {
      storageKey: recording.id,
      sha256: digest(trace),
      bytes: trace.length,
      mimeType: "application/zip",
    };
    receipt.outcome = receipt.assertion.passed ? "pass" : "fail";
    receipt.reason = receipt.assertion.passed
      ? "fixed_dom_assertion_passed"
      : "fixed_dom_assertion_failed";
  } catch (error) {
    await Promise.all(stored.map((id) => artifacts.remove(id, scoped).catch(() => undefined)));
    receipt.outcome = context.signal.aborted ? "cancelled" : signal.aborted ? "unknown" : "blocked";
    receipt.reason = context.signal.aborted
      ? "principal_cancelled"
      : signal.aborted
        ? "browser_wall_limit_exceeded"
        : (violation ??
          (error instanceof Error && /^browser_[a-z_]+$/u.test(error.message)
            ? error.message
            : "browser_boundary_rejected"));
  } finally {
    signal.removeEventListener("abort", abort);
    try {
      await cleanupBrowser();
    } catch {
      receipt.runtime.cleanup = "unknown";
      receipt.outcome = "unknown";
      receipt.reason = "browser_cleanup_unconfirmed";
      await Promise.all(stored.map((id) => artifacts.remove(id, scoped).catch(() => undefined)));
      delete receipt.screenshotArtifact;
      delete receipt.traceArtifact;
    }
    await staging?.release();
  }
  if (receipt.outcome === "pass" || receipt.outcome === "fail") {
    try {
      await authorized();
    } catch {
      await Promise.all(stored.map((id) => artifacts.remove(id, scoped).catch(() => undefined)));
      delete receipt.screenshotArtifact;
      delete receipt.traceArtifact;
      receipt.outcome = context.signal.aborted
        ? "cancelled"
        : signal.aborted
          ? "unknown"
          : "blocked";
      receipt.reason = context.signal.aborted
        ? "principal_cancelled"
        : signal.aborted
          ? "browser_wall_limit_exceeded"
          : "browser_scope_rejected";
    }
  }
  if (grantDenied) {
    delete receipt.assertion;
    receipt.pages = [];
    receipt.sources = [];
    receipt.events = [];
  }
  return receipt;
}
