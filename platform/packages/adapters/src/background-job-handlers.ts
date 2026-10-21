import type {
  AgentHomeStore,
  AgentRuntime,
  ArtifactStore,
  BackgroundJobHandlers,
  JobPublisher,
  MessagingSurface,
  SandboxProvider,
  SecretStore,
} from "@rakazo/adapter-kit";
import { messagingDeliverJob } from "@rakazo/adapter-kit";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import type { CloudAgentConnection } from "./cloud-agent-factory.js";
import { pollCloudAgent } from "./cloud-agent-poll.js";
import { expireComputerControl } from "./computer-control.js";
import { scheduleComputerSleep, sleepComputerIfIdle } from "./computer-idle.js";
import { performComputerUpdate } from "./computer-update.js";
import type { createRunExecutor } from "./executor.js";
import { compactHistory } from "./history-compaction.js";
import type { MemoryProviderResolver } from "./memory-provider-factory.js";
import { deliverMessagingOutbound, mirrorMessagingOutbound } from "./messaging-delivery.js";
import { expireTaughtSkillTeaching } from "./teaching-session.js";
import type { ZeroBrowserResolve, ZeroPdfResolve } from "./zero-component-services.js";
import { runZeroBrowserExtraction, runZeroPdfExtraction } from "./zero-component-services.js";
import type { ZeroCsvAuthorize, ZeroCsvResolveVerifier } from "./zero-csv-preparation.js";
import { runZeroCsvPreparation, runZeroCsvVerification } from "./zero-csv-preparation.js";
import type { ZeroUrlResearchResolve, ZeroUrlResearchTestTransport } from "./zero-url-research.js";
import { runZeroUrlResearch } from "./zero-url-research.js";
import type { ZeroJevWorkerDependencies } from "./zero-jev-worker.js";
import { runZeroJevTool } from "./zero-jev-worker.js";

export function createBackgroundJobHandlers(deps: {
  artifacts?: ArtifactStore;
  zeroJev?: Pick<ZeroJevWorkerDependencies, "pool" | "resolve" | "fetch">;
  authorizeZeroCsv?: ZeroCsvAuthorize;
  resolveZeroCsvVerifier?: ZeroCsvResolveVerifier;
  authorizeZeroComponent?: ZeroCsvAuthorize;
  resolveZeroPdf?: ZeroPdfResolve;
  resolveZeroBrowser?: ZeroBrowserResolve;
  resolveZeroUrlResearch?: ZeroUrlResearchResolve;
  zeroUrlResearchTestTransport?: ZeroUrlResearchTestTransport;
  executor: ReturnType<typeof createRunExecutor>;
  prisma: PrismaClient;
  sandbox: SandboxProvider;
  home: AgentHomeStore;
  jobs: JobPublisher;
  events: ThreadEvents;
  workerId: string;
  runtime: AgentRuntime;
  secretStore: SecretStore;
  memoryProviders: MemoryProviderResolver;
  deploymentModelKey?: string;
  deploymentModelConfigured?: boolean;
  messaging?: MessagingSurface;
  cloudAgent?: CloudAgentConnection | null;
}): BackgroundJobHandlers {
  const deliverMessaging = async (runId?: string) => {
    if (!deps.messaging) return;
    await deliverMessagingOutbound(
      { prisma: deps.prisma, messaging: deps.messaging, events: deps.events, jobs: deps.jobs },
      { runId },
      {
        operationId: `messaging.deliver:${runId ?? "drain"}`,
        traceId: `messaging.deliver:${runId ?? "drain"}`,
        spaceId: "",
        userId: "",
        signal: new AbortController().signal,
      },
    );
  };

  return {
    "zero.research.extract": async ({ requestArtifactId }) => {
      if (!deps.artifacts) throw new Error("Component artifact store unavailable");
      await runZeroUrlResearch(
        {
          prisma: deps.prisma,
          artifacts: deps.artifacts,
          authorize: deps.authorizeZeroComponent,
          resolveUrlResearch: deps.resolveZeroUrlResearch,
          testOnlyTransport: deps.zeroUrlResearchTestTransport,
        },
        requestArtifactId,
      );
    },
    "zero.pdf.extract": async ({ requestArtifactId }) => {
      if (!deps.artifacts) throw new Error("Component artifact store unavailable");
      await runZeroPdfExtraction(
        {
          prisma: deps.prisma,
          artifacts: deps.artifacts,
          authorize: deps.authorizeZeroComponent,
          resolvePdf: deps.resolveZeroPdf,
        },
        requestArtifactId,
      );
    },
    "zero.browser.extract": async ({ requestArtifactId }) => {
      if (!deps.artifacts) throw new Error("Component artifact store unavailable");
      await runZeroBrowserExtraction(
        {
          prisma: deps.prisma,
          artifacts: deps.artifacts,
          authorize: deps.authorizeZeroComponent,
          resolveBrowser: deps.resolveZeroBrowser,
        },
        requestArtifactId,
      );
    },
    "zero.jev-tool.execute": async ({ requestArtifactId }) => {
      if (!deps.artifacts) throw new Error("Routing artifact store unavailable");
      await runZeroJevTool(
        { ...deps.zeroJev, prisma: deps.prisma, artifacts: deps.artifacts },
        requestArtifactId,
      );
    },
    "zero.csv.verify": async ({ requestArtifactId }) => {
      if (!deps.artifacts) throw new Error("CSV artifact store unavailable");
      await runZeroCsvVerification(
        {
          prisma: deps.prisma,
          artifacts: deps.artifacts,
          authorize: deps.authorizeZeroCsv,
          resolveVerifier: deps.resolveZeroCsvVerifier,
        },
        requestArtifactId,
      );
    },
    "zero.csv.prepare": async ({ requestArtifactId }) => {
      if (!deps.artifacts) throw new Error("CSV artifact store unavailable");
      await runZeroCsvPreparation(
        { prisma: deps.prisma, artifacts: deps.artifacts, authorize: deps.authorizeZeroCsv },
        requestArtifactId,
      );
    },
    "run.continue": async (payload) => {
      await deps.executor.continueRun(payload.runId, deps.workerId);
      // Automatic messaging mirror: once the run's bot messages are durable,
      // copy them into the outbox. Never let mirror failures fail the run.
      if (deps.messaging) {
        await mirrorMessagingOutbound(
          { prisma: deps.prisma, messaging: deps.messaging, events: deps.events, jobs: deps.jobs },
          payload.runId,
        );
        await deps.jobs.enqueue(messagingDeliverJob()).catch(async (error) => {
          getLogger().error("messaging.deliver enqueue error", error);
          await deliverMessaging();
        });
      }
    },
    "messaging.deliver": async (payload) => {
      await deliverMessaging(payload.runId);
    },
    "routine.wakeup": async (payload) => {
      await deps.executor.wakeRoutine(payload.routineId, payload.scheduledFor);
    },
    "computer.update": async ({ updateId }) => {
      await performComputerUpdate(deps, updateId);
    },
    "computer.sleep": async (payload) => {
      await sleepComputerIfIdle(deps, payload.computerId);
    },
    "computer.control-expire": async (payload) => {
      if (await expireComputerControl(deps, payload.computerId, payload.leaseId)) {
        scheduleComputerSleep(deps.jobs, payload.computerId);
      }
    },
    "skill.teaching-expire": async (payload) => {
      await expireTaughtSkillTeaching(deps, payload.skillId);
    },
    "cloud_agent.poll": async (payload) => {
      await pollCloudAgent(
        {
          prisma: deps.prisma,
          jobs: deps.jobs,
          events: deps.events,
          cloudAgent: deps.cloudAgent,
        },
        payload,
      );
    },
    "history.compact": async (payload) => {
      // Retrieval policies use stored context without paid message-count compaction.
      // Skip legacy backlog work after a policy change.
      if (deps.executor.contextStrategy && deps.executor.contextStrategy !== "current") return;
      await compactHistory(
        {
          prisma: deps.prisma,
          runtime: deps.runtime,
          jobs: deps.jobs,
          memoryProviders: deps.memoryProviders,
          deploymentModelKey: deps.deploymentModelKey,
          deploymentModelConfigured: deps.deploymentModelConfigured,
          ...(deps.executor.resolveModel ? { resolveModel: deps.executor.resolveModel } : {}),
        },
        payload.threadId,
      );
    },
  };
}
