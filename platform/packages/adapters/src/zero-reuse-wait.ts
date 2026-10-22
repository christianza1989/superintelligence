import { setTimeout as delay } from "node:timers/promises";
import type { ZeroJevApplicationClient } from "./zero-jev-application-client.js";
import { readZeroReuseReceipt } from "./zero-reuse-receipt.js";

function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    if (signal.aborted) {
      void pending.catch(() => undefined);
      aborted();
      return;
    }
    signal.addEventListener("abort", aborted, { once: true });
    pending
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", aborted));
  });
}

/** A bounded request wait on the existing job, not a scheduler or another execution. */
export async function waitForZeroReuseDecision(
  client: ZeroJevApplicationClient,
  jobId: string,
  waitMs: number,
  signal?: AbortSignal,
) {
  const end = Date.now() + waitMs;
  let backoff = 1000;
  for (;;) {
    if (signal?.aborted) throw signal.reason;
    const job = signal
      ? await abortable(client.get(jobId), signal)
      : await client.get(jobId);
    if ("sha256" in job)
      return {
        job,
        decision: await readZeroReuseReceipt(client, jobId, "decision"),
      };
    const remaining = end - Date.now();
    if (remaining <= 0) return { job, retryAfterMs: 4000 };
    await delay(Math.min(backoff, remaining), undefined, { signal });
    backoff = Math.min(4000, backoff * 2);
  }
}
