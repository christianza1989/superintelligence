const form = document.querySelector("form"), message = document.querySelector('[role="status"]');
async function api(route, method = "GET", body) {
  const response = await fetch(route, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw Error("Request failed"); return response.json();
}
async function render() {
  const { tasks } = await api("/api/tasks");
  for (const column of document.querySelectorAll(".column > div")) column.replaceChildren();
  for (const task of tasks) {
    const card = document.createElement("article"); card.setAttribute("aria-label", task.title);
    const title = document.createElement("h3"); title.textContent = task.title;
    const label = document.createElement("label"); label.textContent = "Status";
    const status = document.createElement("select");
    for (const [value, text] of [["todo", "Todo"], ["doing", "In progress"], ["done", "Done"]]) {
      const option = document.createElement("option"); option.value = value; option.textContent = text; status.append(option);
    }
    status.value = task.status;
    status.addEventListener("change", async () => {
      await api("/api/tasks/" + encodeURIComponent(task.id), "PATCH", { status: status.value }); await render();
    });
    label.append(status); card.append(title, label);
    document.querySelector(`[data-status="${task.status}"] > div`).append(card);
  }
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  try { await api("/api/tasks", "POST", { title: form.elements.title.value }); form.reset(); message.textContent = "Task created"; await render(); }
  catch { message.textContent = "Could not create task"; }
});
await render();
