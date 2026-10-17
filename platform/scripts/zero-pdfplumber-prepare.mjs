import { preparePdfCpuProfile } from "./zero-pdf-cpu-prepare.mjs";

if (process.argv.length !== 3 || process.argv[2] !== "--prepare") {
  process.stdout.write(
    `${JSON.stringify({ state: "blocked", code: "EXPLICIT_PREPARATION_REQUIRED", defaultDownloads: 0 })}\n`,
  );
  process.exit(2);
}
try {
  const result = await preparePdfCpuProfile("pdfplumber");
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.state !== "prepared") process.exitCode = 1;
} catch {
  process.stdout.write(`${JSON.stringify({ state: "failed", code: "PDF_PREPARATION_FAILED" })}\n`);
  process.exitCode = 1;
}
