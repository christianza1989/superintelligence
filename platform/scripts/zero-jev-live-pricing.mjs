/** Qualification for one fixed text-only, one-question Jev profile; never a model dispatch. */
import { readBodyCapped, withAbort } from "../packages/adapters/src/web-ssrf.ts";

export const JEV_LIVE_MODEL = "typesafe/jev-1.13";
export const JEV_LIVE_RESERVE_MICROS = 100_000;
export const JEV_LIVE_MAX_CONTEXT = 262_144;
const maximumPromptRate = 0.000000042;
export const JEV_LIVE_PRICING_URL = `https://openrouter.ai/api/v1/models/${JEV_LIVE_MODEL}/endpoints`;

/** Unknown fees or larger limits fail closed. A reservation is retained separately from actual usage. */
export function qualifyJevPricing(json, observedAt = new Date().toISOString()) {
  const endpoints = json?.data?.endpoints;
  if (
    json?.data?.id !== JEV_LIVE_MODEL ||
    !Array.isArray(endpoints) ||
    !endpoints.length ||
    endpoints.length > 8
  )
    throw new Error("Jev pricing profile unavailable");
  for (const endpoint of endpoints) {
    const pricing = endpoint?.pricing;
    if (
      !pricing ||
      typeof pricing !== "object" ||
      Object.keys(pricing).some((key) => !["prompt", "completion", "discount"].includes(key)) ||
      !["string", "number"].includes(typeof pricing.prompt) ||
      !Number.isFinite(Number(pricing.prompt)) ||
      Number(pricing.prompt) <= 0 ||
      Number(pricing.prompt) > maximumPromptRate ||
      !["string", "number"].includes(typeof pricing.completion) ||
      Number(pricing.completion) !== 0 ||
      (pricing.discount !== undefined &&
        (typeof pricing.discount !== "number" ||
          !Number.isFinite(pricing.discount) ||
          pricing.discount < 0 ||
          pricing.discount > 1)) ||
      !Number.isSafeInteger(endpoint.context_length) ||
      endpoint.context_length <= 0 ||
      endpoint.context_length > JEV_LIVE_MAX_CONTEXT
    )
      throw new Error("Jev pricing exceeds qualified profile");
  }
  const maximumContextCostMicros = Math.ceil(JEV_LIVE_MAX_CONTEXT * maximumPromptRate * 1_000_000);
  if (
    maximumContextCostMicros > JEV_LIVE_RESERVE_MICROS ||
    !Number.isFinite(Date.parse(observedAt))
  )
    throw new Error("Jev reservation does not cover qualified profile");
  return {
    model: JEV_LIVE_MODEL,
    source: JEV_LIVE_PRICING_URL,
    observedAt,
    maximumPromptUsdPerToken: maximumPromptRate,
    completionUsdPerToken: 0,
    maximumContextTokens: JEV_LIVE_MAX_CONTEXT,
    maximumQuestions: 1,
    maximumContextCostMicros,
    reserveUsdMicros: JEV_LIVE_RESERVE_MICROS,
    limitation:
      "Dated endpoint metadata bound for this fixed request; not an account-wide provider invoice guarantee",
  };
}

export async function readJevPricing(fetcher = fetch) {
  const signal = AbortSignal.timeout(15_000);
  const response = await withAbort(
    fetcher(JEV_LIVE_PRICING_URL, { redirect: "error", signal }),
    signal,
  );
  if (!response.ok || response.redirected) throw new Error("Jev pricing unavailable");
  const bytes = await readBodyCapped(response, 65_536, signal);
  return qualifyJevPricing(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
