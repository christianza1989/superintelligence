import { constants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { Hono } from "hono";

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};
const reserved = /^\/(?:api|rpc|health|ready|ws|internal|novnc|\.well-known)(?:\/|$)/i;
const spa =
  /^(?:\/|\/(?:discover|sign-in|sign-up|forgot-password|reset-password|onboarding|desktop-settings)|\/(?:sso|mcp\/oauth)\/callback|\/integrations\/setup|\/app(?:\/(?:[^/.]+|g\/[^/.]+|artifacts\/[^/.]+|library\/start))?)$/;
const within = (root: string, file: string) => file.startsWith(root + path.sep);

/** Trusted, immutable build directory. No user request or environment chooses this root. */
export async function mountBuiltWeb(app: Hono, webRoot: string): Promise<void> {
  const root = await realpath(webRoot);
  const files = new Map<string, { file: string; dev: number; ino: number; size: number }>();
  let total = 0,
    count = 0;
  async function inventory(folder: string): Promise<void> {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      if (item.name.startsWith(".")) continue;
      const file = path.join(folder, item.name);
      const info = await lstat(file);
      if (info.isSymbolicLink()) throw new Error("Built web contains a symbolic link");
      if (info.isDirectory()) {
        await inventory(file);
        continue;
      }
      if (!info.isFile()) throw new Error("Unsupported built web entry");
      total += info.size;
      if (info.size > 32_000_000 || total > 128_000_000 || ++count > 10_000)
        throw new Error("Built web exceeds file or byte bound");
      const url = `/${path.relative(root, file).split(path.sep).join("/")}`;
      if (mime[path.extname(file)])
        files.set(url, { file, dev: info.dev, ino: info.ino, size: info.size });
    }
  }
  await inventory(root);
  if (!files.has("/index.html")) throw new Error("Built web index is missing");
  app.use("*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
    // WHATWG URL parsing erases dot segments; validate the raw path first.
    const raw = c.req.url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "").split(/[?#]/, 1)[0] ?? "";
    if (raw.length > 4096) return next();
    let pathname: string;
    try {
      pathname = decodeURIComponent(raw);
    } catch {
      return next();
    }
    if (
      pathname.length > 2048 ||
      !pathname.startsWith("/") ||
      /[%\\]/.test(pathname) ||
      [...pathname].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
      pathname.split("/").some((segment) => segment.startsWith(".")) ||
      reserved.test(pathname)
    )
      return next();
    let selected = pathname;
    if (!files.has(selected)) {
      if (
        !spa.test(pathname) ||
        !c.req
          .header("accept")
          ?.split(",")
          .some(
            (part) =>
              /^text\/html(?:\s*;|\s*$)/i.test(part.trim()) &&
              !/;\s*q=0(?:\.0*)?(?:\s*;|\s*$)/i.test(part),
          )
      )
        return next();
      selected = "/index.html";
    }
    const entry = files.get(selected)!;
    let handle: FileHandle | undefined;
    try {
      const canonical = await realpath(entry.file);
      if (!within(root, canonical)) return next();
      handle = await open(
        canonical,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      const info = await handle.stat();
      if (
        !info.isFile() ||
        info.dev !== entry.dev ||
        info.ino !== entry.ino ||
        info.size !== entry.size
      )
        return next();
      const headers = {
        "content-type": mime[path.extname(selected)]!,
        "content-length": String(info.size),
        "x-content-type-options": "nosniff",
        "cache-control": /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(selected)
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      };
      return new Response(
        c.req.method === "HEAD" ? null : new Uint8Array(await handle.readFile()),
        { headers },
      );
    } catch (error) {
      if (
        ["ENOENT", "ENOTDIR", "ELOOP", "EACCES"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        return next();
      throw error;
    } finally {
      await handle?.close();
    }
  });
}
