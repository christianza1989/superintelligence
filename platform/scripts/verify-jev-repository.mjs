/** Explicit, one-shot live source-advice check. Default mode is offline discovery only. */
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parseEnv } from "node:util";
import { readBodyCapped, withAbort } from "../packages/adapters/src/web-ssrf.ts";
import { selectRepositoryWithJev } from "../packages/adapters/src/zero-repository-selector.ts";
import { repositorySearchFromTool } from "../packages/adapters/src/zero-repository-tools.ts";
import { createBudgetAllocation, reserveBudgetInvocation } from "../packages/db/src/zero-budget.ts";

const root = new URL("../../", import.meta.url);
const live = process.argv.length === 3 && process.argv[2] === "--live";
if (process.argv.length !== 2 && !live)
  throw new Error("Use no argument, or --live for the one-shot check.");
const discovery = repositorySearchFromTool({ query: "agent platform" });
const report = {
  checkedAtUtc: new Date().toISOString(),
  stage: "bounded_source_advice_not_full_mvp",
  liveRequested: live,
  candidateCount: discovery.candidates?.length ?? 0,
  modelDispatchAttempts: 0,
  invoiceCost: "unavailable",
  status: "offline_discovery_only",
};

const redactions = [];

async function readConnection() {
  const configFile = new URL(".local/connections/fast-decision.json", root);
  const info = await lstat(configFile);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 16_384 || (info.mode & 0o077) !== 0)
    throw new Error("The private connection must be a regular file with owner-only permissions.");
  const connection = JSON.parse(await readFile(configFile, "utf8"));
  if (
    connection.provider !== "openrouter-systemone" ||
    connection.model !== "typesafe/jev-1.13" ||
    connection.enabled !== true ||
    !Array.isArray(connection.roles) ||
    !connection.roles.includes("repo_selection") ||
    typeof connection.apiKey !== "string" ||
    !connection.apiKey.trim() ||
    connection.apiKey.length > 512
  )
    throw new Error("The explicit repo-selection connection is not configured.");

  redactions.push(connection.apiKey);
  return connection;
}

async function check() {
  if (!live) return;
  const connection = await readConnection();
  const sameConnection = async () => (await readConnection()).apiKey === connection.apiKey;
  const requireAdapters = createRequire(
    new URL("../packages/adapters/package.json", import.meta.url),
  );
  const { EnvHttpProxyAgent } = requireAdapters("undici");
  // Honor the environment proxy and its access policy. Never bypass it or disable TLS checks.
  const dispatcher = new EnvHttpProxyAgent();
  const proxyFetch = (url, options) => fetch(url, { ...options, dispatcher });
  try {
    const signal = AbortSignal.timeout(15_000);
    let response;
    try {
      response = await proxyFetch("https://openrouter.ai/api/v1/key", {
        headers: { authorization: `Bearer ${connection.apiKey}` },
        redirect: "error",
        signal,
      });
      if (!response.ok) {
        report.status = "connection_rejected_before_model_dispatch";
        report.httpStatus = response.status;
        void response.body?.cancel().catch(() => undefined);
        return;
      }
      const keyInfo = JSON.parse(
        new TextDecoder().decode(await readBodyCapped(response, 16_384, signal)),
      );
      if (!keyInfo.data || typeof keyInfo.data !== "object")
        throw new Error("Invalid connection reply");
      // Discard identifying key/account metadata. A successful GET is not a model entitlement check.
    } catch {
      report.status = "network_or_connection_unavailable_before_model_dispatch";
      return;
    }

    const local = parseEnv(await readFile(new URL("platform/.env", root), "utf8"));
    const dbUrl = new URL(local.DATABASE_URL);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(dbUrl.hostname))
      throw new Error("This check requires the existing authenticated loopback database.");
    const { Pool } = requireAdapters("pg");
    const pool = new Pool({
      connectionString: dbUrl.toString(),
      max: 1,
      connectionTimeoutMillis: 5_000,
      query_timeout: 15_000,
      statement_timeout: 15_000,
    });
    try {
      const accountId = "local-openrouter-fast-decision-smoke-v1";
      const lane = "repo-selection";
      const invocationId = "jev-repo-live-smoke-v1";
      const limits = { calls: 1, usdMicros: 100_000n, tokens: 16_000n };
      try {
        await createBudgetAllocation(pool, {
          accountId,
          total: limits,
          lanes: { [lane]: limits },
        });
      } catch (error) {
        if (error?.code !== "23505") throw error;
      }
      const existing = await pool.query(
        'SELECT "callLimit", "usdLimitMicros", "tokenLimit" FROM zero_budget_accounts WHERE id = $1',
        [accountId],
      );
      const account = existing.rows[0];
      if (
        account?.callLimit !== 1 ||
        String(account.usdLimitMicros) !== "100000" ||
        String(account.tokenLimit) !== "16000"
      )
        throw new Error("The fixed smoke allocation differs from its expected policy.");
      const candidates = discovery.candidates;
      if (!candidates?.length) {
        report.status = "missing_source_candidates";
        return;
      }
      const options = candidates.map((c) => ({
        ...c,
        licenseSource: c.licenseSource ?? "Unknown",
      }));
      const started = performance.now();
      const result = await selectRepositoryWithJev(
        {
          apiKey: connection.apiKey,
          model: connection.model,
          timeoutMs: 15_000,
        },
        {
          fetch: (url, options) => {
            report.modelDispatchAttempts++;
            return proxyFetch(url, options);
          },
          reserve: (id) =>
            reserveBudgetInvocation(pool, {
              accountId,
              lane,
              invocationId: id,
              usdMicros: limits.usdMicros,
              tokens: limits.tokens,
            }),
          authorizeDispatch: async (id, generation) =>
            id === invocationId && generation === 1 && (await sameConnection()),
          stillEligible: async (repository, revision, generation) => {
            if (generation !== 1 || !(await sameConnection())) return false;
            const current = JSON.parse(
              await readFile(
                new URL("platform/packages/core/src/zero-catalog-data.json", root),
                "utf8",
              ),
            );
            return (
              options.some((c) => c.repository === repository && c.sourceRevision === revision) &&
              current.records.some(
                (c) =>
                  c.repository === repository &&
                  c.sourceRevision === revision &&
                  c.sourceAvailable &&
                  !c.archived,
              )
            );
          },
        },
        {
          invocationId,
          generation: 1,
          goal: "Recommend an existing persistent agent workspace foundation for a React UI, HTTP API, PostgreSQL and background-worker product. Prefer one coherent reusable base; this is source investigation only, not permission to install or a claim of runtime quality.",
          candidates: options,
        },
      );
      report.elapsedMs = Math.round(performance.now() - started);
      report.status = result.status;
      report.result = result;
      report.budget = {
        lifetimeDispatchLimit: 1,
        automaticRetry: false,
        conservativeUsdReservation: "0.10",
        conservativeTokenReservation: 16_000,
        actualProviderInvoiceCeilingProven: false,
        scope: "One local smoke connection; not cross-key provider-account billing enforcement",
      };
    } finally {
      await pool.end();
    }
  } finally {
    const closing = dispatcher.close();
    void closing.catch(() => undefined);
    try {
      await withAbort(closing, AbortSignal.timeout(1_000));
    } catch {
      void dispatcher.destroy().catch(() => undefined);
    }
  }
}

try {
  await check();
} catch {
  report.status = "blocked_local_configuration_or_budget";
}
await mkdir(new URL(".artifacts/jev/", root), { recursive: true });
let safeReport = JSON.stringify(report, null, 2);
for (const secret of redactions) safeReport = safeReport.replaceAll(secret, "[REDACTED]");
await writeFile(new URL(".artifacts/jev/repository-check.json", root), `${safeReport}\n`, {
  mode: 0o600,
});
console.log(safeReport);
if (live && report.status !== "recommended" && report.status !== "abstained") process.exitCode = 1;
