import { runPdfCpuSpike } from "./zero-pdf-cpu-spike.mjs";

if (process.argv.length !== 3 || process.argv[2] !== "--run") {
  process.stdout.write(
    `${JSON.stringify({ state: "blocked", code: "EXPLICIT_SPIKE_REQUIRED", defaultDownloads: 0 })}\n`,
  );
  process.exit(2);
}
try {
  const result = await runPdfCpuSpike("pdfplumber");
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.state !== "completed") process.exitCode = result.state === "blocked" ? 2 : 1;
} catch {
  process.stdout.write(`${JSON.stringify({ state: "failed", code: "PDF_SPIKE_FAILED" })}\n`);
  process.exitCode = 1;
}
