// Deliberate negative control: API works, but process restart loses the tasks.
process.env.FIXTURE_MEMORY_ONLY = "1";
await import("./server.mjs");
