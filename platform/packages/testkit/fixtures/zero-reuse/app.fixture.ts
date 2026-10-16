// Reuse the official Hono quickstart pattern; framework attribution is retained by the runner.
import { Hono } from "hono";

export function createApp() {
  const app = new Hono();
  const tasks = new Map<number, { id: number; title: string; done: boolean }>();
  let nextId = 1;
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get("/tasks", (c) => {
    return c.json([...tasks.values()]);
  });
  app.post("/tasks", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (typeof body?.title !== "string" || !body.title.trim() || body.title.trim().length > 80)
      return c.json({ error: "title_required" }, 400);
    const task = { id: nextId++, title: body.title.trim(), done: false };
    tasks.set(task.id, task);
    return c.json(task, 201);
  });
  app.patch("/tasks/:id/complete", (c) => {
    const task = tasks.get(Number(c.req.param("id")));
    if (!task) return c.json({ error: "not_found" }, 404);
    task.done = true;
    return c.json(task);
  });
  return app;
}
