/** Fixed release entry: captured-response replay, not live TLS or interactive browsing. */
import type { AdapterContext } from "@rakazo/adapter-kit";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { chromium } from "playwright-core";
import { ComputerBrowserProvider } from "./computer-browser.js";
import {
  admitsUrlDocumentNavigation,
  urlDocumentHash,
  ZERO_URL_DOCUMENT_CSP,
  ZERO_URL_DOCUMENT_LIMITS,
  ZERO_URL_DOCUMENT_MODE,
  ZERO_URL_DOCUMENT_PROFILE,
  zeroUrlDocumentOutputSchema,
  zeroUrlDocumentPayloadSchema,
} from "./zero-url-document-contract.js";

export async function runCapturedUrlDocument(input: unknown): Promise<void> {
  const payload = zeroUrlDocumentPayloadSchema.parse(input);
  const bytes = Buffer.from(payload.contentBase64, "base64");
  let browser: Browser | undefined, context: BrowserContext | undefined, page: Page | undefined;
  let consumed = false,
    bad = false,
    documentRequests = 0,
    fulfilledDocuments = 0;
  let unexpectedRequests = 0,
    navigations = 0,
    navigateCalls = 0,
    snapshotCalls = 0;
  let semantic: { title: string; visibleText: string; quote: string } | undefined;
  let responseUrl = "",
    documentSha256 = "";
  const watchdog = setTimeout(() => process.exit(124), 14_000);
  let output: unknown;
  try {
    browser = await chromium.launch({
      executablePath: "/opt/chromium/chrome-headless-shell-linux64/chrome-headless-shell",
      headless: true,
      timeout: 4000,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-extensions",
        "--disable-sync",
        "--no-first-run",
        "--host-resolver-rules=MAP * ~NOTFOUND",
      ],
    });
    context = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: "block",
      acceptDownloads: false,
      permissions: [],
      viewport: { width: ZERO_URL_DOCUMENT_LIMITS.width, height: ZERO_URL_DOCUMENT_LIMITS.height },
      deviceScaleFactor: 1,
      locale: "en-US",
      timezoneId: "UTC",
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    context.setDefaultTimeout(2000);
    context.setDefaultNavigationTimeout(8000);
    await context.routeWebSocket("**/*", (socket) => {
      bad = true;
      socket.close();
    });
    await context.route("**/*", async (route) => {
      try {
        const request = route.request();
        const headers = request.headers();
        const admitted = admitsUrlDocumentNavigation(
          payload.source.url,
          {
            url: request.url(),
            method: request.method(),
            resourceType: request.resourceType(),
            navigation: request.isNavigationRequest(),
            topFrame: Boolean(page && request.frame() === page.mainFrame()),
            redirected: request.redirectedFrom() !== null,
            credentialHeaders: Boolean(
              headers.authorization || headers.cookie || headers["proxy-authorization"],
            ),
          },
          consumed,
        );
        if (!admitted) {
          bad = true;
          unexpectedRequests++;
          await route.abort("blockedbyclient");
          return;
        }
        consumed = true;
        documentRequests++;
        await route.fulfill({
          status: 200,
          body: bytes,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "content-security-policy": ZERO_URL_DOCUMENT_CSP,
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          },
        });
        fulfilledDocuments++;
      } catch {
        bad = true;
        await route.abort("blockedbyclient").catch(() => undefined);
      }
    });
    page = await context.newPage();
    context.on("page", (extra) => {
      if (extra !== page) {
        bad = true;
        void extra.close().catch(() => undefined);
      }
    });
    page.on("download", (download) => {
      bad = true;
      void download.cancel().catch(() => undefined);
    });
    page.on("dialog", (dialog) => {
      bad = true;
      void dialog.dismiss().catch(() => undefined);
    });
    page.on("framenavigated", (frame) => {
      if (frame !== page!.mainFrame() || frame.url() !== payload.source.url || ++navigations !== 1)
        bad = true;
    });
    const provider = new ComputerBrowserProvider({
      liveDriver: async (_computer, command) => {
        if (
          command.command === "navigate" &&
          command.url === payload.source.url &&
          navigateCalls++ === 0
        ) {
          const response = await page!.goto(command.url, { waitUntil: "load" });
          if (
            response?.status() !== 200 ||
            response.url() !== payload.source.url ||
            response.request().redirectedFrom() !== null ||
            (await response.headerValue("content-type")) !== "text/html; charset=utf-8" ||
            (await response.headerValue("content-security-policy")) !== ZERO_URL_DOCUMENT_CSP ||
            (await response.headerValue("x-content-type-options")) !== "nosniff" ||
            (await response.headerValue("cache-control")) !== "no-store" ||
            (await response.headerValue("set-cookie")) !== null ||
            (await response.headerValue("location")) !== null ||
            urlDocumentHash(await response.body()) !== payload.source.sha256
          )
            throw new Error("document_navigation_rejected");
          responseUrl = response.url();
          return { ok: true, url: page!.url(), title: await page!.title() };
        }
        if (
          command.command !== "snapshot" ||
          snapshotCalls++ !== 0 ||
          bad ||
          page!.url() !== payload.source.url
        )
          throw new Error("document_command_rejected");
        semantic = await page!.evaluate(() => {
          const visible = (node: HTMLElement) =>
            node.getClientRects().length > 0 &&
            getComputedStyle(node).visibility === "visible" &&
            getComputedStyle(node).display !== "none";
          const paragraph = [...document.querySelectorAll<HTMLParagraphElement>("p")].find(
            (node) => visible(node) && node.innerText.trim(),
          );
          return {
            title: document.title,
            visibleText: document.body?.innerText ?? "",
            quote: paragraph?.innerText.trim() ?? "",
          };
        });
        documentSha256 = urlDocumentHash(await page!.content());
        return {
          ok: true,
          url: page!.url(),
          title: semantic.title,
          tree: semantic.visibleText,
          elements: [],
        };
      },
    });
    const adapterContext: AdapterContext = {
      operationId: payload.nonce,
      traceId: payload.nonce,
      userId: "sealed-document",
      spaceId: "sealed-document",
      signal: AbortSignal.timeout(12_000),
    };
    const computer = {
      id: "sealed-document",
      botId: "sealed-document",
      providerRef: "sealed-document",
      kind: "docker" as const,
    };
    const navigation = await provider.navigate(
      computer,
      { url: payload.source.url },
      adapterContext,
    );
    const snapshot = await provider.snapshot(computer, {}, adapterContext);
    if (
      navigation.fallback ||
      navigation.error ||
      snapshot.fallback ||
      snapshot.error ||
      !semantic ||
      bad ||
      navigations !== 1 ||
      documentRequests !== 1 ||
      fulfilledDocuments !== 1 ||
      page.url() !== payload.source.url
    )
      throw new Error("document_evidence_rejected");
    const png = await page.screenshot({
      type: "png",
      fullPage: false,
      animations: "disabled",
      timeout: 2000,
    });
    if (bad || page.url() !== payload.source.url) throw new Error("document_evidence_rejected");
    output = zeroUrlDocumentOutputSchema.parse({
      profile: ZERO_URL_DOCUMENT_PROFILE,
      mode: ZERO_URL_DOCUMENT_MODE,
      nonce: payload.nonce,
      source: payload.source,
      navigation: {
        requestedUrl: payload.source.url,
        responseUrl,
        finalUrl: page.url(),
        status: 200,
        method: "GET",
        topFrame: true,
        fulfilledBodySha256: urlDocumentHash(bytes),
        fulfilledBodyBytes: bytes.length,
        contentType: "text/html; charset=utf-8",
        csp: ZERO_URL_DOCUMENT_CSP,
      },
      documentSha256,
      title: semantic.title,
      visibleText: semantic.visibleText,
      answer: {
        kind: "first-visible-paragraph",
        selector: "p",
        visibleIndex: 0,
        sourceUrl: payload.source.url,
        quote: semantic.quote,
      },
      screenshot: {
        mimeType: "image/png",
        encoding: "base64",
        bytes: png.length,
        sha256: urlDocumentHash(png),
        contentBase64: png.toString("base64"),
      },
      actualUse: {
        provider: "computer",
        navigate: navigateCalls,
        snapshot: snapshotCalls,
        documentRequests,
        fulfilledDocuments,
        unexpectedRequests,
        unexpectedNavigations: navigations - 1,
        externalEffects: 0,
      },
      runtime: {
        node: process.versions.node,
        playwright: "1.63.0",
        chromium: browser.version(),
        javaScriptEnabled: false,
        serviceWorkers: "block",
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
      },
    });
  } finally {
    try {
      await context?.close();
    } finally {
      try {
        await browser?.close();
      } finally {
        clearTimeout(watchdog);
      }
    }
  }
  const serialized = JSON.stringify(output);
  if (Buffer.byteLength(serialized) > ZERO_URL_DOCUMENT_LIMITS.outputBytes)
    throw new Error("document_output_limit");
  process.stdout.write(serialized);
}
