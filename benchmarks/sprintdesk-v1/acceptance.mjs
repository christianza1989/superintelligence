/** Independent black-box contract checks, kept outside the generated application's workspace. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

const origin = new URL(process.env.BENCHMARK_ORIGIN ?? "http://127.0.0.1:38641");
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))
  throw new Error("The benchmark only targets a loopback application.");
const prefix = "acceptance-" + randomUUID();
async function request(path, method = "GET", body) {
  const response = await fetch(new URL(path, origin), {
    method, redirect: "error", signal: AbortSignal.timeout(5_000),
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test("SprintDesk independent task contract", async (t) => {
  const owned = new Set();
  t.after(async () => {
    await Promise.allSettled([...owned].map((id) => request(`/api/tasks/${encodeURIComponent(id)}`, "DELETE")));
  });
  await t.test("health is a functional JSON response", async () => {
    const r = await request("/api/health"); assert.equal(r.status, 200); assert.equal(r.body.ok, true);
  });
  let primary;
  await t.test("creation trims title and supplies the documented defaults", async () => {
    const r = await request("/api/tasks", "POST", { title: `  ${prefix} first  ` });
    if (typeof r.body?.id === "string") owned.add(r.body.id);
    assert.equal(r.status, 201); assert.equal(typeof r.body.id, "string"); assert.ok(r.body.id.length);
    assert.equal(r.body.title, `${prefix} first`); assert.equal(r.body.description, "");
    assert.equal(r.body.status, "todo"); assert.equal(r.body.priority, "medium"); assert.equal(r.body.dueDate, null);
    primary = r.body.id;
  });
  await t.test("invalid inputs return400 and never create matching rows", async () => {
    const invalid = [
      { title: " " }, { title: "x".repeat(201) }, { title: 42 },
      { title: `${prefix} invalid`, status: "cancelled" },
      { title: `${prefix} invalid`, priority: "urgent" },
      { title: `${prefix} invalid`, dueDate: "2026-02-30" },
      { title: `${prefix} invalid`, dueDate: "tomorrow" },
      { title: `${prefix} invalid`, description: false },
      { title: `${prefix} invalid`, description: "x".repeat(2001) },
    ];
    for (const body of invalid) assert.equal((await request("/api/tasks", "POST", body)).status, 400);
    const malformed = await fetch(new URL("/api/tasks", origin), { method: "POST", headers: { "content-type": "application/json" }, body: '{"title":', signal: AbortSignal.timeout(5_000) });
    assert.equal(malformed.status, 400); await malformed.body?.cancel();
    const listed = await request(`/api/tasks?q=${encodeURIComponent(prefix + " invalid")}`);
    assert.equal(listed.status, 200); assert.deepEqual(listed.body.tasks, []);
  });
  await t.test("patch updates selected fields, preserves omitted fields and rejects invalid changes atomically", async () => {
    assert.ok(primary, "creation must succeed first");
    const changed = await request(`/api/tasks/${encodeURIComponent(primary)}`, "PATCH", { status: "doing", priority: "high", dueDate: "2028-02-29", description: "Quarterly report" });
    assert.equal(changed.status, 200); assert.equal(changed.body.title, `${prefix} first`);
    assert.equal(changed.body.status, "doing"); assert.equal(changed.body.dueDate, "2028-02-29");
    assert.equal((await request(`/api/tasks/${encodeURIComponent(primary)}`, "PATCH", { status: "done", title: " " })).status, 400);
    const listed = await request(`/api/tasks?q=${encodeURIComponent(prefix)}`);
    assert.equal(listed.body.tasks.find((x) => x.id === primary)?.status, "doing");
  });
  await t.test("case-insensitive title/description search combines with both filters", async () => {
    assert.ok(primary);
    const second = await request("/api/tasks", "POST", { title: `${prefix} second`, priority: "low", status: "done" });
    if (typeof second.body?.id === "string") owned.add(second.body.id);
    assert.equal(second.status, 201); assert.notEqual(second.body.id, primary);
    const r = await request("/api/tasks?q=QUARTERLY&status=doing&priority=high");
    assert.equal(r.status, 200); assert.ok(r.body.tasks.some((x) => x.id === primary));
    assert.ok(r.body.tasks.every((x) => x.status === "doing" && x.priority === "high"));
    assert.deepEqual((await request(`/api/tasks?q=${encodeURIComponent(prefix)}&status=doing&priority=low`)).body.tasks, []);
    assert.equal((await request("/api/tasks?status=wrong")).status, 400);
    assert.equal((await request("/api/tasks?priority=wrong")).status, 400);
  });
  await t.test("export includes the created tasks independently of filters", async () => {
    const r = await request("/api/export"); assert.equal(r.status, 200); assert.ok(Array.isArray(r.body.tasks));
    for (const id of owned) assert.ok(r.body.tasks.some((x) => x.id === id));
  });
  await t.test("unknown objects return404; deletion removes the task", async () => {
    assert.equal((await request(`/api/tasks/${prefix}-missing`, "PATCH", { status: "done" })).status, 404);
    assert.equal((await request(`/api/tasks/${prefix}-missing`, "DELETE")).status, 404);
    assert.ok(primary); assert.equal((await request(`/api/tasks/${encodeURIComponent(primary)}`, "DELETE")).status, 204);
    owned.delete(primary);
    const r = await request(`/api/tasks?q=${encodeURIComponent(prefix)}`);
    assert.ok(!r.body.tasks.some((x) => x.id === primary));
  });
});
