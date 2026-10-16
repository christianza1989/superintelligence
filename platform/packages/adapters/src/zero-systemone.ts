/** Server-only OpenRouter SystemOne transport. A decision never grants execution permission. */
import { z } from "zod";
import { readBodyCapped, withAbort } from "./web-ssrf.js";

export type SystemOneReservation = {
  invocationId: string;
  hold: () => Promise<void>;
};
export type SystemOneConfig = Readonly<{
  apiKey?: string;
  model: string;
  timeoutMs: number;
}>;
export type SystemOneDependencies = {
  fetch?: typeof fetch;
  /** Trusted composition must reserve finite account/lane caps atomically before dispatch. */
  reserve: (invocationId: string) => Promise<SystemOneReservation | null>;
  /** Recheck account, data recipient and the caller's semantic grants immediately before dispatch. */
  authorizeDispatch: (invocationId: string, generation: number) => Promise<boolean>;
};
type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };
const description = z.string().max(1_000).nullable();
const instructions = z.string().trim().min(1).max(2_000);
const label = z.string().regex(/^[a-zA-Z0-9_.:-]{1,80}$/);
const questionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("choice"),
      instructions,
      criteria: z.record(label, description).refine((value) => {
        const count = Object.keys(value).length;
        return count >= 1 && count <= 8;
      }),
    })
    .strict(),
  z
    .object({
      type: z.literal("noul"),
      instructions,
      criteria: z
        .object({ true: description.optional(), false: description.optional() })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("score"),
      instructions,
      criteria: z.array(description).min(2).max(8),
    })
    .strict(),
]);
export type SystemOneQuestion = z.infer<typeof questionSchema>;
const questionsSchema = z.record(label, questionSchema).refine((value) => {
  const count = Object.keys(value).length;
  return count >= 1 && count <= 8;
});
const probability = z.number().min(0).max(1);
const probabilities = z.record(z.string(), probability).optional();
const answerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("choice"),
    choice: z.string(),
    confidence: probability.optional(),
    probabilities,
  }),
  z.object({ type: z.literal("noul"), noul: probability }),
  z.object({
    type: z.literal("score"),
    score: z.number(),
    confidence: probability.optional(),
    probabilities,
  }),
]);
export type SystemOneAnswer = z.infer<typeof answerSchema>;
const responseSchema = z.object({
  answers: z.record(z.string(), answerSchema),
  model: z.string().min(1).max(200).optional(),
  provider: z.string().min(1).max(200).optional(),
  id: z.string().min(1).max(256).optional(),
  usage: z
    .object({
      input_tokens: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      output_tokens: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      cost: z.number().min(0).optional(),
    })
    .optional(),
});
export type SystemOneDecision =
  | {
      status: "answered";
      answers: Record<string, SystemOneAnswer>;
      model?: string;
      provider?: string;
      requestId?: string;
      usage?: { inputTokens: number; outputTokens: number; cost?: number };
    }
  | { status: "blocked" | "unknown"; reason: string };
export type SystemOneRequest = Readonly<{
  invocationId: string;
  generation: number;
  state: string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
  questions: Readonly<Record<string, SystemOneQuestion>>;
  signal?: AbortSignal;
}>;
const ENDPOINT = "https://openrouter.ai/api/v1/systemone";
const MAX_BYTES = 65_536;

function boundedQuestions(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const questions = Object.values(value);
  if (questions.length < 1 || questions.length > 8) return false;
  return questions.every((question: unknown) => {
    if (!question || typeof question !== "object") return false;
    const { type, criteria } = question as { type?: unknown; criteria?: unknown };
    if (type === "score") return Array.isArray(criteria) && criteria.length <= 8;
    if (type !== "choice") return true;
    return (
      !!criteria &&
      typeof criteria === "object" &&
      !Array.isArray(criteria) &&
      Object.keys(criteria).length <= 8
    );
  });
}

function boundedState(value: unknown, depth = 0, budget = { nodes: 512 }): boolean {
  if (--budget.nodes < 0 || depth > 8) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= 16_000;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (Array.isArray(value))
    return value.length <= 64 && value.every((item) => boundedState(item, depth + 1, budget));
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 64 &&
    entries.every(([key, item]) => key.length <= 128 && boundedState(item, depth + 1, budget))
  );
}

export async function requestSystemOneDecision(
  config: SystemOneConfig,
  dependencies: SystemOneDependencies,
  request: SystemOneRequest,
): Promise<SystemOneDecision> {
  config = { ...config };
  dependencies = { ...dependencies };
  request = { ...request };
  if (!config.apiKey) return { status: "blocked", reason: "routing_connection_not_configured" };
  if (
    !config.model?.trim() ||
    config.model.length > 200 ||
    !Number.isFinite(config.timeoutMs) ||
    config.timeoutMs < 100 ||
    config.timeoutMs > 30_000
  )
    return { status: "blocked", reason: "invalid_routing_config" };
  if (
    !request.invocationId ||
    request.invocationId.length > 128 ||
    !Number.isSafeInteger(request.generation) ||
    request.generation < 0
  )
    return { status: "blocked", reason: "invalid_request" };
  if (
    typeof dependencies.reserve !== "function" ||
    typeof dependencies.authorizeDispatch !== "function"
  )
    return { status: "blocked", reason: "dispatch_hooks_required" };
  if (request.signal?.aborted) return { status: "blocked", reason: "cancelled_before_dispatch" };

  let body: string;
  let questions: Record<string, SystemOneQuestion>;
  try {
    // Validate and serialize synchronously: neither nested criteria nor state can
    // change while the durable reservation is pending.
    // Reject excessive collections before asking the schema to visit every item.
    if (!boundedQuestions(request.questions))
      return { status: "blocked", reason: "invalid_decision_request" };
    questions = questionsSchema.parse(request.questions);
    if (
      !boundedState(request.state) ||
      request.state === null ||
      (typeof request.state !== "object" && typeof request.state !== "string")
    )
      return { status: "blocked", reason: "invalid_decision_state" };
    body = JSON.stringify({
      model: config.model,
      state: request.state,
      questions,
    });
    if (new TextEncoder().encode(body).byteLength > 32_768)
      return { status: "blocked", reason: "decision_payload_too_large" };
  } catch {
    return { status: "blocked", reason: "invalid_decision_request" };
  }

  let reservation: SystemOneReservation | null;
  try {
    reservation = await dependencies.reserve(request.invocationId);
  } catch {
    return { status: "blocked", reason: "budget_service_unavailable" };
  }
  if (
    !reservation ||
    reservation.invocationId !== request.invocationId ||
    typeof reservation.hold !== "function"
  )
    return { status: "blocked", reason: "budget_or_duplicate_invocation" };
  const hold = reservation.hold.bind(reservation);
  const boundedSignal = request.signal
    ? AbortSignal.any([request.signal, AbortSignal.timeout(config.timeoutMs)])
    : AbortSignal.timeout(config.timeoutMs);

  const performDecision = async (): Promise<SystemOneDecision> => {
    try {
      if (boundedSignal.aborted)
        return { status: "blocked", reason: "recipient_or_data_grant_changed" };
      const authorization = dependencies.authorizeDispatch(
        request.invocationId,
        request.generation,
      );
      // A hook may abort synchronously and then reject; consume that rejection
      // even if withAbort observes an already-aborted signal.
      void authorization.catch(() => undefined);
      if (!(await withAbort(authorization, boundedSignal)))
        return { status: "blocked", reason: "recipient_or_data_grant_changed" };
      boundedSignal.throwIfAborted();
      // One fixed endpoint, one dispatch, one deadline for headers AND body. No SDK retries.
      const pending = (dependencies.fetch ?? fetch)(ENDPOINT, {
        method: "POST",
        redirect: "error",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body,
        signal: boundedSignal,
      });
      // Also release late responses from an injected fetch that ignores cancellation.
      void pending.then(
        (response) => {
          if (boundedSignal.aborted) void response.body?.cancel().catch(() => undefined);
        },
        () => undefined,
      );
      const response = await withAbort(pending, boundedSignal);
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        return {
          status: "unknown",
          reason: "provider_rejected_or_usage_unknown",
        };
      }
      if (!response.body) return { status: "unknown", reason: "empty_provider_response" };
      const bytes = await readBodyCapped(response, MAX_BYTES, boundedSignal);
      const parsed = responseSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
      if (!parsed.success) return { status: "unknown", reason: "invalid_provider_schema" };
      const result = parsed.data;
      if (
        Object.keys(result.answers).length !== Object.keys(questions).length ||
        Object.keys(result.answers).some((name) => !Object.hasOwn(questions, name))
      )
        return { status: "unknown", reason: "invalid_provider_schema" };
      for (const [name, question] of Object.entries(questions)) {
        const answer = result.answers[name];
        if (!answer || answer.type !== question.type)
          return { status: "unknown", reason: "invalid_provider_schema" };
        if (question.type === "choice" && answer.type === "choice") {
          if (!Object.hasOwn(question.criteria, answer.choice))
            return { status: "blocked", reason: "choice_outside_request_enum" };
          if (
            Object.keys(answer.probabilities ?? {}).some(
              (key) => !Object.hasOwn(question.criteria, key),
            )
          )
            return { status: "unknown", reason: "invalid_provider_schema" };
        }
        if (question.type === "score" && answer.type === "score") {
          if (
            answer.score < 0 ||
            answer.score > question.criteria.length - 1 ||
            Object.keys(answer.probabilities ?? {}).some(
              (key) => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= question.criteria.length,
            )
          )
            return { status: "unknown", reason: "invalid_provider_schema" };
        }
      }
      return {
        status: "answered",
        answers: result.answers,
        ...(result.model === undefined ? {} : { model: result.model }),
        ...(result.provider === undefined ? {} : { provider: result.provider }),
        ...(result.id === undefined ? {} : { requestId: result.id }),
        ...(result.usage === undefined
          ? {}
          : {
              usage: {
                inputTokens: result.usage.input_tokens,
                outputTokens: result.usage.output_tokens,
                ...(result.usage.cost === undefined ? {} : { cost: result.usage.cost }),
              },
            }),
      };
    } catch {
      return {
        status: "unknown",
        reason: "provider_timeout_or_invalid_response",
      };
    }
  };
  const decision = await performDecision();
  try {
    // No expiry or refund: even cancellation/invalid responses may already cost money.
    await hold();
  } catch {
    return {
      status: "unknown",
      reason: "budget_receipt_requires_reconciliation",
    };
  }
  if (decision.status === "answered" && request.signal?.aborted)
    return { status: "unknown", reason: "cancelled_after_dispatch" };
  return decision;
}
