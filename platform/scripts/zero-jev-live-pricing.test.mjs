import assert from "node:assert/strict";
import { test } from "node:test";
import { JEV_LIVE_MODEL, qualifyJevPricing, readJevPricing } from "./zero-jev-live-pricing.mjs";

const price = () => ({
  data: {
    id: JEV_LIVE_MODEL,
    endpoints: [
      { context_length: 262144, pricing: { prompt: "0.000000042", completion: "0", discount: 0 } },
    ],
  },
});
test("qualifies the fixed one-question profile conservatively", () => {
  const result = qualifyJevPricing(price());
  assert.equal(result.maximumContextCostMicros, 11011);
  assert.equal(result.reserveUsdMicros, 100000);
  assert.equal(result.maximumQuestions, 1);
});
test("rejects missing, changed, nonfinite and extra billing facts", () => {
  const changes = [
    (p) => (p.data.id = "~typesafe/jev-latest"),
    (p) => (p.data.endpoints = []),
    (p) => (p.data.endpoints[0].pricing.prompt = "0.000000043"),
    (p) => (p.data.endpoints[0].pricing.prompt = "NaN"),
    (p) => (p.data.endpoints[0].pricing.prompt = null),
    (p) => (p.data.endpoints[0].pricing.completion = "0.000001"),
    (p) => delete p.data.endpoints[0].pricing.completion,
    (p) => (p.data.endpoints[0].pricing.completion = null),
    (p) => (p.data.endpoints[0].pricing.request = "0.01"),
    (p) => (p.data.endpoints[0].context_length = 262145),
    (p) => (p.data.endpoints[0].context_length = 0),
  ];
  for (const change of changes) {
    const input = price();
    change(input);
    assert.throws(() => qualifyJevPricing(input));
  }
});
test("fetches only the public pinned pricing endpoint with no credential", async () => {
  let called = 0;
  await readJevPricing(async (url, init) => {
    called++;
    assert.equal(url, "https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints");
    assert.equal(init.redirect, "error");
    assert.equal(init.headers, undefined);
    return Response.json(price());
  });
  assert.equal(called, 1);
});
test("rejects an oversized public pricing response", async () => {
  await assert.rejects(readJevPricing(async () => new Response(" ".repeat(65537))));
});
