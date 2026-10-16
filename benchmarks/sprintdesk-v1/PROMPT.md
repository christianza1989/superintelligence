# SprintDesk

Build a small, polished local project-management web application called SprintDesk.

Use Node.js 24. Provide `npm start` to serve the UI and API from one origin, bind to `127.0.0.1`, and honor `PORT` and `DB_PATH`. Persist tasks in SQLite so a process restart preserves data. Use a reproducible package manifest and lockfile if you add dependencies. Do not use paid external services or send project content to other services. Existing open-source components are welcome; preserve their licenses and explain what you reuse.

For this first benchmark, deliver a prebuilt runtime package that starts without npm install: Node.js 24 built-ins are available, including node:sqlite. Third-party code may be bundled with its license notices; the delivered package.json must not declare external dependencies, devDependencies, optionalDependencies or peerDependencies. Keep authoring/build metadata separate from the runnable package. Later benchmark profiles will support full dependency installation and builds.

The UI must work at desktop and mobile widths. Use a dark theme with lime accents. Include three task columns (Todo, In progress, Done), task creation, editing, deletion, a way to move a task between columns, priority and due-date controls, search, status/priority filtering, a summary, and JSON export. Use accessible labels and keyboard-operable controls; dragging cannot be the only way to move a task. Show validation errors and a useful empty state. No sign-in is needed for this local single-user app.

For the shared automated UI contract, use English accessible names: a visible textbox named `Title` or `Task title`, a button named `Add task` or `Create task`, and an `article` for each task whose accessible name is its title. Each task article must contain a native select named `Status`, with options `Todo`, `In progress`, and `Done` corresponding to API values `todo`, `doing`, and `done`. These controls must be reachable using Tab and work with ordinary keyboard input. Task creation and status changes must reach the same API and survive a page reload. Support desktop 1440×900 and mobile 390×844 without horizontal page overflow or JavaScript/console errors. This contract is identical for both benchmark lanes; other requested features still apply.

API contract (JSON responses):

- `GET /api/health` returns HTTP 200 and `{ "ok": true }`.
- `POST /api/tasks` takes `title`, optional `description`, `status` (`todo`, `doing`, `done`), `priority` (`low`, `medium`, `high`), and `dueDate` (null or a valid ISO calendar date `YYYY-MM-DD`). Defaults are empty description, `todo`, `medium`, and null. Return HTTP 201 and the task object. Each task has a stable string `id` and those six fields.
- `GET /api/tasks` returns `{ "tasks": [...] }`. Optional `q` matches title or description case-insensitively. Optional `status` and `priority` filters combine with search using AND. Invalid filter values return HTTP 400.
- `PATCH /api/tasks/:id` updates supplied task fields and returns the task. Omitted fields stay unchanged.
- `DELETE /api/tasks/:id` returns HTTP 204. Unknown IDs on PATCH/DELETE return HTTP 404.
- `GET /api/export` returns `{ "tasks": [...] }` containing all tasks regardless of UI filters.
- Blank titles, titles over 200 characters, descriptions over 2000 characters, invalid status/priority/date, invalid JSON, and wrong field types return HTTP 400 without mutating stored data. Trim the title. Reject malformed calendar dates such as February 30.

Finish with a README containing one-command startup, environment options, the main design/reuse choices, and any known limitations. Run relevant checks and report their actual results. You have a 15 minute time limit; prioritize a working, persistent app over extra features.
