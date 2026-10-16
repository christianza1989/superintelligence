/** Owned synthetic API fixture, not a generated app or complete SprintDesk UI. */
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";

const database = new DatabaseSync(process.env.FIXTURE_MEMORY_ONLY === "1" ? ":memory:" : process.env.DB_PATH);
database.exec("CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, priority TEXT NOT NULL, dueDate TEXT)");
const statuses = ["todo", "doing", "done"], priorities = ["low", "medium", "high"];
const own = (value, field) => Object.prototype.hasOwnProperty.call(value, field);
function validate(body, partial) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("invalid_input");
  const output = partial ? {} : { description: "", status: "todo", priority: "medium", dueDate: null };
  if (!partial || own(body, "title")) {
    if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 200) throw Error("invalid_title");
    output.title = body.title.trim();
  }
  if (own(body, "description")) {
    if (typeof body.description !== "string" || body.description.length > 2000) throw Error("invalid_description");
    output.description = body.description;
  }
  for (const [field, values] of [["status", statuses], ["priority", priorities]]) {
    if (own(body, field)) {
      if (!values.includes(body[field])) throw Error("invalid_enum");
      output[field] = body[field];
    }
  }
  if (own(body, "dueDate")) {
    const date = body.dueDate;
    if (date !== null && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw Error("invalid_date");
    output.dueDate = date;
  }
  return output;
}
async function body(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 65536) throw Error("body_bound");
  }
  return JSON.parse(text);
}
const server = createServer(async (request, response) => {
  const json = (status, value) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(value === undefined ? undefined : JSON.stringify(value));
  };
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/api/health" && request.method === "GET") return json(200, { ok: true });
    if (url.pathname === "/api/export" && request.method === "GET") return json(200, { tasks: database.prepare("SELECT * FROM tasks ORDER BY rowid").all() });
    if (url.pathname === "/api/tasks" && request.method === "POST") {
      const task = { id: randomUUID(), ...validate(await body(request), false) };
      database.prepare("INSERT INTO tasks(id,title,description,status,priority,dueDate) VALUES(?,?,?,?,?,?)")
        .run(task.id, task.title, task.description, task.status, task.priority, task.dueDate);
      return json(201, task);
    }
    if (url.pathname === "/api/tasks" && request.method === "GET") {
      for (const [key, values] of [["status", statuses], ["priority", priorities]])
        if (url.searchParams.has(key) && !values.includes(url.searchParams.get(key))) return json(400, { error: "invalid_filter" });
      const query = (url.searchParams.get("q") ?? "").toLowerCase();
      const tasks = database.prepare("SELECT * FROM tasks ORDER BY rowid").all().filter(task =>
        (!query || task.title.toLowerCase().includes(query) || task.description.toLowerCase().includes(query)) &&
        (!url.searchParams.has("status") || task.status === url.searchParams.get("status")) &&
        (!url.searchParams.has("priority") || task.priority === url.searchParams.get("priority")));
      return json(200, { tasks });
    }
    const match = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (match && ["PATCH", "DELETE"].includes(request.method)) {
      const id = decodeURIComponent(match[1]);
      const current = database.prepare("SELECT * FROM tasks WHERE id=?").get(id);
      if (!current) return json(404, { error: "not_found" });
      if (request.method === "DELETE") { database.prepare("DELETE FROM tasks WHERE id=?").run(id); return json(204); }
      const next = { ...current, ...validate(await body(request), true) };
      database.prepare("UPDATE tasks SET title=?,description=?,status=?,priority=?,dueDate=? WHERE id=?")
        .run(next.title, next.description, next.status, next.priority, next.dueDate, id);
      return json(200, next);
    }
    return json(404, { error: "not_found" });
  } catch { return json(400, { error: "invalid_input" }); }
});
server.listen(Number(process.env.PORT), "127.0.0.1");
process.on("SIGTERM", () => server.close(() => { database.close(); process.exit(0); }));
