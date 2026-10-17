/** Separate static-input image entry. Never imports the frozen fixture cohort. */

import type { AdapterContext } from "@rakazo/adapter-kit";
import { JSDOM } from "jsdom";
import { chromium } from "playwright-core";
import { z } from "zod";
import { ComputerBrowserProvider } from "./computer-browser.js";
import {
  ZERO_BROWSER_STATIC_LIMITS,
  ZERO_BROWSER_STATIC_PROFILE,
  ZERO_BROWSER_STATIC_URL,
  zeroBrowserExtractionSchema,
  zeroBrowserHash,
} from "./zero-browser-contract.js";

async function main() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString("utf8");
    if (Buffer.byteLength(input) > 100_000) throw new Error("input");
  }
  const parsed = z
    .object({ html: z.string(), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/u) })
    .strict()
    .parse(JSON.parse(input));
  if (
    Buffer.byteLength(parsed.html) > ZERO_BROWSER_STATIC_LIMITS.inputBytes ||
    zeroBrowserHash(parsed.html) !== parsed.sourceSha256
  )
    throw new Error("input");
  // Parse without scripts or resource loading. Resource-bearing markup is inert
  // before Chromium allocates a renderer for it; the sealed CSP still applies.
  const dom = new JSDOM(parsed.html, { url: ZERO_BROWSER_STATIC_URL });
  const rendering = {
    policy: "inert-static-v1",
    removedElements: 0,
    removedAttributes: 0,
    inertLinks: 0,
  };
  for (const element of dom.window.document.querySelectorAll(
    "script,link,img,source,track,iframe,frame,embed,base,meta[http-equiv]",
  )) {
    element.remove();
    rendering.removedElements++;
  }
  for (const element of dom.window.document.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      if (
        attribute.name.startsWith("on") ||
        [
          "src",
          "srcset",
          "poster",
          "data",
          "background",
          "ping",
          "action",
          "formaction",
          "manifest",
          "xlink:href",
        ].includes(attribute.name)
      ) {
        element.removeAttribute(attribute.name);
        rendering.removedAttributes++;
      }
    }
    const style = element.getAttribute("style");
    if (style && /url|@import|\\/iu.test(style)) throw new Error("unsupported_resource_style");
  }
  for (const style of dom.window.document.querySelectorAll("style"))
    if (/url|@import|\\/iu.test(style.textContent ?? ""))
      throw new Error("unsupported_resource_style");
  for (const anchor of dom.window.document.querySelectorAll("a[href]")) {
    anchor.setAttribute("data-zero-original-href", anchor.getAttribute("href") ?? "");
    anchor.setAttribute("href", "#");
    rendering.inertLinks++;
  }
  const rendered = dom.serialize();
  dom.window.close();
  const browser = await chromium.launch({
    executablePath: "/opt/chromium/chrome-headless-shell-linux64/chrome-headless-shell",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-extensions",
      "--disable-sync",
      "--no-first-run",
    ],
  });
  const context = await browser.newContext({
    javaScriptEnabled: false,
    serviceWorkers: "block",
    acceptDownloads: false,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  let navigated = false;
  await context.route("**/*", async (route) => {
    if (
      !navigated &&
      route.request().url() === ZERO_BROWSER_STATIC_URL &&
      route.request().isNavigationRequest() &&
      route.request().resourceType() === "document"
    ) {
      navigated = true;
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        headers: {
          "content-security-policy":
            "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'",
          "x-content-type-options": "nosniff",
          "cache-control": "no-store",
        },
        body: rendered,
      });
    } else await route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  let forbidden = false;
  context.on("page", (popup) => {
    if (popup !== page) {
      forbidden = true;
      void popup.close();
    }
  });
  page.on("download", (download) => {
    forbidden = true;
    void download.cancel();
  });
  let semantic:
    | {
        title: string;
        headings: Array<{ level: number; text: string }>;
        links: Array<{ text: string; href: string }>;
        visibleText: string;
      }
    | undefined;
  const provider = new ComputerBrowserProvider({
    liveDriver: async (_computer, command) => {
      if (command.command === "navigate" && command.url === ZERO_BROWSER_STATIC_URL) {
        await page.goto(ZERO_BROWSER_STATIC_URL, { waitUntil: "load", timeout: 10_000 });
        return { ok: true, url: page.url(), title: await page.title() };
      }
      if (command.command !== "snapshot") throw new Error("command");
      semantic = await page.evaluate(() => {
        const visible = (node: HTMLElement) =>
          !!(
            node.getClientRects().length &&
            getComputedStyle(node).visibility !== "hidden" &&
            getComputedStyle(node).display !== "none"
          );
        const headings = [...document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")]
          .filter(visible)
          .map((node) => ({ level: Number(node.tagName.slice(1)), text: node.innerText }));
        const links = [
          ...document.querySelectorAll<HTMLAnchorElement>("a[data-zero-original-href]"),
        ]
          .filter(visible)
          .map((node) => ({
            text: node.innerText,
            href: node.getAttribute("data-zero-original-href") ?? "",
          }));
        return {
          title: document.title,
          headings,
          links,
          visibleText: document.body?.innerText ?? "",
        };
      });
      return {
        ok: true,
        url: page.url(),
        title: semantic.title,
        tree: semantic.visibleText,
        elements: [],
      };
    },
  });
  const adapterContext: AdapterContext = {
    operationId: "sealed-static",
    traceId: "sealed-static",
    userId: "sealed-static",
    spaceId: "sealed-static",
    signal: AbortSignal.timeout(12_000),
  };
  const computer = {
    id: "sealed-static",
    botId: "sealed-static",
    providerRef: "sealed-static",
    kind: "docker" as const,
  };
  try {
    const navigation = await provider.navigate(
      computer,
      { url: ZERO_BROWSER_STATIC_URL },
      adapterContext,
    );
    const snapshot = await provider.snapshot(computer, {}, adapterContext);
    if (
      navigation.fallback ||
      snapshot.fallback ||
      !semantic ||
      forbidden ||
      page.url() !== ZERO_BROWSER_STATIC_URL
    )
      throw new Error("browser");
    const png = await page.screenshot({
      type: "png",
      fullPage: false,
      animations: "disabled",
      timeout: 3000,
    });
    const output = zeroBrowserExtractionSchema.parse({
      profile: ZERO_BROWSER_STATIC_PROFILE,
      sourceSha256: parsed.sourceSha256,
      renderedSha256: zeroBrowserHash(rendered),
      rendering,
      url: ZERO_BROWSER_STATIC_URL,
      ...semantic,
      screenshot: {
        mimeType: "image/png",
        encoding: "base64",
        sha256: zeroBrowserHash(png),
        bytes: png.length,
        contentBase64: png.toString("base64"),
      },
      actualUse: { provider: "computer", navigate: 1, snapshot: 1 },
      runtime: {
        nodeVersion: process.versions.node,
        playwright: "1.63.0",
        chromium: browser.version(),
      },
    });
    const serialized = JSON.stringify(output);
    if (Buffer.byteLength(serialized) > ZERO_BROWSER_STATIC_LIMITS.artifactBytes - 16_384)
      throw new Error("output");
    process.stdout.write(serialized);
  } finally {
    await context.close();
    await browser.close();
  }
}
const watchdog = setTimeout(() => process.exit(124), 14_000);
main()
  .catch(() => {
    process.stderr.write("browser_static_failed\n");
    process.exitCode = 1;
  })
  .finally(() => clearTimeout(watchdog));
