import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { mountBuiltWeb } from "./built-web.js";

const temporary: string[] = [];
afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "zero-built-web-"));
  temporary.push(dir);
  const web = path.join(dir, "web");
  await mkdir(path.join(web, "assets"), { recursive: true });
  await writeFile(path.join(web, "index.html"), "<!doctype html><div id=root>shared app</div>");
  await writeFile(path.join(web, "assets/index-Abcd1234.js"), "window.shared=true;");
  await writeFile(path.join(web, "assets/style-Abcd1234.css"), "body{}");
  await writeFile(path.join(web, "assets/geist-Abcd1234.woff2"), "font");
  await writeFile(path.join(web, "favicon.svg"), "<svg/>");
  await writeFile(path.join(web, "site.webmanifest"), "{}");
  await writeFile(path.join(web, ".env"), "PRIVATE");
  await writeFile(path.join(web, "source.ts"), "PRIVATE");
  return { dir, web };
}
const html = { headers: { accept: "text/html,application/xhtml+xml" } };

describe("opt-in shared built web", () => {
  it("serves same-origin build assets with safe MIME, caching and HEAD", async () => {
    const { web } = await fixture();
    const app = new Hono();
    await mountBuiltWeb(app, web);
    for (const [file, type] of [
      ["index-Abcd1234.js", "text/javascript; charset=utf-8"],
      ["style-Abcd1234.css", "text/css; charset=utf-8"],
      ["geist-Abcd1234.woff2", "font/woff2"],
    ]) {
      const response = await app.request(`/assets/${file}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(type);
      expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      const head = await app.request(`/assets/${file}`, { method: "HEAD" });
      expect(await head.text()).toBe("");
      expect(head.headers.get("content-length")).toBe(response.headers.get("content-length"));
    }
    expect((await app.request("/site.webmanifest")).headers.get("content-type")).toBe(
      "application/manifest+json; charset=utf-8",
    );
    const index = await app.request("/index.html");
    expect(index.headers.get("cache-control")).toBe("no-cache");
    expect((await app.request("/favicon.svg")).headers.get("content-type")).toBe("image/svg+xml");
  });

  it("falls back only for actual shared HTML routes and leaves missing assets as 404", async () => {
    const { web } = await fixture();
    const app = new Hono();
    await mountBuiltWeb(app, web);
    for (const route of [
      "/",
      "/discover",
      "/sign-in",
      "/reset-password",
      "/app",
      "/app/g/group-1",
      "/app/artifacts/artifact-1",
      "/app/library/start?repo=one",
      "/app/bot-1",
      "/sso/callback",
      "/mcp/oauth/callback",
      "/desktop-settings",
      "/integrations/setup",
    ]) {
      const response = await app.request(route, html);
      expect(response.status, route).toBe(200);
      expect(await response.text()).toContain("shared app");
      expect(response.headers.get("cache-control")).toBe("no-cache");
    }
    for (const route of [
      "/unknown",
      "/assets/missing.js",
      "/app/missing.js",
      "/missing.png",
      "/discover/missing",
      "/source.ts",
      `/app/${"a".repeat(2048)}`,
      `/app/${"%61".repeat(1400)}`,
      "/.env",
    ]) {
      expect((await app.request(route, html)).status, route).toBe(404);
    }
    for (const accept of ["", "*/*", "application/json", "text/html;q=0", "text/html;q=0.000"]) {
      expect((await app.request("/discover", { headers: { accept } })).status).toBe(404);
    }
    expect(
      (await app.request("/discover", { headers: { accept: "text/html;q=0.5" } })).status,
    ).toBe(200);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect((await app.request("/discover", { ...html, method })).status).toBe(404);
    }
  });

  it("preserves API/auth/RPC/health and reserved namespace responses without shadowing 404", async () => {
    const { web } = await fixture();
    for (const route of ["api", "rpc", "ws", "internal", "health", "ready", "novnc"]) {
      await mkdir(path.join(web, route), { recursive: true });
      await writeFile(path.join(web, route, "private.json"), "{}");
    }
    const app = new Hono();
    app.get("/api/auth/capabilities", (c) => c.json({ passwordAuth: true }));
    app.post("/rpc/probe", (c) => c.json({ ok: true }));
    app.get("/health", (c) => c.json({ ok: true }));
    app.get("/ready", (c) => c.json({ ok: false }, 503));
    app.get("/internal/hidden", (c) => c.notFound());
    await mountBuiltWeb(app, web);
    expect(await (await app.request("/api/auth/capabilities", html)).json()).toEqual({
      passwordAuth: true,
    });
    expect(await (await app.request("/rpc/probe", { method: "POST" })).json()).toEqual({
      ok: true,
    });
    expect((await app.request("/health", html)).headers.get("content-type")).toContain(
      "application/json",
    );
    expect((await app.request("/ready", html)).status).toBe(503);
    for (const route of [
      "/api",
      "/api/auth/unknown",
      "/rpc/unknown",
      "/ws",
      "/internal/hidden",
      "/internal/unknown",
      "/health/unknown",
      "/ready/unknown",
      "/novnc/unknown",
      ...["api", "rpc", "ws", "internal", "health", "ready", "novnc"].map(
        (name) => `/${name}/private.json`,
      ),
    ]) {
      expect((await app.request(route, html)).status, route).toBe(404);
    }
  });

  it("rejects encoded traversal, malformed escapes, dotfiles and backslash ambiguity", async () => {
    const { web } = await fixture();
    const app = new Hono();
    await mountBuiltWeb(app, web);
    for (const route of [
      "/%252e%252e/index.html",
      "/assets/%2e%2e%2findex.html",
      "/assets/..%5cindex.html",
      "/%2eenv",
      "/assets/%00index.html",
      "/%zz",
      "/%61pi/private.json",
      "/assets/%2F..%2Findex.html",
    ]) {
      expect((await app.request(route, html)).status, route).toBe(404);
    }
  });

  it("refuses initial symlinks and blocks a later parent-directory symlink swap", async () => {
    const { web, dir } = await fixture();
    const outside = path.join(dir, "private");
    await mkdir(outside);
    await writeFile(path.join(outside, "index-Abcd1234.js"), "PRIVATE");
    await symlink(outside, path.join(web, "linked"));
    await expect(mountBuiltWeb(new Hono(), web)).rejects.toThrow("symbolic link");
    await rm(path.join(web, "linked"));
    const app = new Hono();
    await mountBuiltWeb(app, web);
    await rename(path.join(web, "assets"), path.join(web, "original-assets"));
    await symlink(outside, path.join(web, "assets"));
    const response = await app.request("/assets/index-Abcd1234.js");
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("PRIVATE");
  });

  it("fails closed on missing build and does not activate without mounting", async () => {
    const { web } = await fixture();
    expect((await new Hono().request("/discover", html)).status).toBe(404);
    await rm(path.join(web, "index.html"));
    await expect(mountBuiltWeb(new Hono(), web)).rejects.toThrow("index is missing");
  });
});
