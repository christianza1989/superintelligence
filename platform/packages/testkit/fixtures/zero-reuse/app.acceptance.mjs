import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import test from "node:test";

const { createApp } = await import(process.env.REUSE_APP_PATH ?? "/work/dist/app.mjs");
const add = (app, title) =>
  app.request("/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });

test("health returns an actual successful application response", async () => {
  const response = await createApp().request("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});
test("created task is present in the subsequent list", async () => {
  const app = createApp();
  const response = await add(app, "  Compare existing foundations  ");
  assert.equal(response.status, 201);
  const task = await response.json();
  assert.equal(task.title, "Compare existing foundations");
  assert.equal(task.done, false);
  const list = await (await app.request("/tasks")).json();
  assert.deepEqual(list, [task]);
});
test("invalid inputs do not create tasks", async () => {
  const app = createApp();
  for (const title of ["", "   ", 123, "x".repeat(81)]) {
    assert.equal((await add(app, title)).status, 400);
  }
  assert.deepEqual(await (await app.request("/tasks")).json(), []);
});
test("completion persists in the subsequent list", async () => {
  const app = createApp();
  const created = await (await add(app, "Run independent checks")).json();
  const completed = await app.request(`/tasks/${created.id}/complete`, { method: "PATCH" });
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).done, true);
  const list = await (await app.request("/tasks")).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].done, true);
});
test("unknown task does not report a successful mutation", async () => {
  assert.equal((await createApp().request("/tasks/999/complete", { method: "PATCH" })).status, 404);
});
test("fixture process has no model credentials or writable input mount", () => {
  assert.equal(process.getuid(), 1000);
  for (const name of [
    "OPENROUTER_API_KEY",
    "MODEL_API_KEY",
    "ANTHROPIC_API_KEY",
    "TYPESAFE_API_KEY",
  ])
    assert.equal(Boolean(process.env[name]), false, `${name} must be absent`);
  assert.equal(existsSync("/input/.env"), false);
  assert.equal(existsSync("/var/run/docker.sock"), false);
  assert.throws(() => writeFileSync("/input/write-canary", "must fail"), /EROFS|EACCES/);
});
