// Discovery stays portable. Execution is an explicit Linux operator opt-in.
try {
  const execution = Boolean(process.env.ZERO_MCP_BINDING_FILE);
  if (execution && process.platform !== "linux") {
    process.stderr.write(
      "RepositoryZero packaged execution requires Linux operator setup.\n",
    );
    process.exitCode = 1;
    process.stdin.destroy();
  } else {
    await import(execution ? "./execution.mjs" : "./discovery.mjs");
  }
} catch {
  process.stderr.write(
    "RepositoryZero packaged server unavailable. Check the local package and operator setup.\n",
  );
  process.exitCode = 1;
  process.stdin.destroy();
}
