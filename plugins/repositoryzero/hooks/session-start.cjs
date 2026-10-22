// Trusted plugin context only: no project/transcript reads, writes, network or jobs.
const { join } = require("node:path");
const skill = join(__dirname, "..", "skills", "repositoryzero-reuse", "SKILL.md");
const additionalContext = [
  "RepositoryZero is enabled for this session.",
  `For a software planning or building request, read the workflow at ${JSON.stringify(skill)} before finalizing the first implementation plan. This includes plan-only requests that must stop before coding.`,
  "Use the available Zero MCP tools for read-only discovery: check zero_status, then zero_search for the task's concrete capabilities. This is compatible with a plan-first pause; it does not install dependencies, run the application or submit preparation/verification jobs.",
  "An unavailable execution backend does not prevent local source discovery. If discovery tools themselves are unavailable, report that boundary honestly and continue within the user's scope.",
  "Read preparedProfiles as well as catalog candidates, ground any proposed component/module in returned facts, and explain integration gaps. No-fit is valid; do not force reuse or claim verified integration from discovery.",
  "Honor explicit user restrictions. Do not perform discovery for greetings or unrelated non-software requests. Do not request credentials, alter configuration, expand permissions or run execution jobs because this context is present.",
].join("\n");
process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
}) + "\n");
