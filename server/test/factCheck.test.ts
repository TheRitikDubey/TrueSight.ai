import test from "node:test";
import assert from "node:assert/strict";
import { factCheck, type ProgressEvent } from "../src/agents/factCheckAgent.js";

const claim = { claim: "The Moon is made of cheese.", query: "Moon composition NASA" };
const source = { title: "Moon facts", url: "https://science.nasa.gov/moon/facts/", content: "The Moon has a rocky crust.", score: 0.9 };
function harness(options: { claims?: typeof claim[]; search?: (...args: any[]) => Promise<any>; verdict?: unknown; plan?: unknown } = {}) {
  const prompts: string[] = [];
  const queries: string[] = [];
  const deps = {
    generate: async (prompt: string) => {
      prompts.push(prompt);
      return prompts.length === 1 ? options.plan ?? { reason: "Factual claims need evidence.", claims: options.claims ?? [claim] }
        : options.verdict ?? { claims: [{ id: 1, verdict: "FALSE", confidence: 95, evidence: "The Moon is rocky.", sourceIds: [1] }] };
    },
    search: async (query: string) => { queries.push(query); return options.search ? options.search(query) : [source]; },
    scrape: async () => ({ title: "Moon article", text: "The Moon is made of cheese.", source: "example.com" }),
  };
  return { deps, prompts, queries };
}

test("preserves the original claim, searches once and uses only two LLM calls", async () => {
  const h = harness();
  const events: ProgressEvent[] = [];
  const result = await factCheck(claim.claim, { onProgress: (event) => events.push(event) }, h.deps);
  assert.equal(h.prompts.length, 2);
  assert.equal(h.queries.length, 1);
  assert.ok(h.prompts[0].includes(claim.claim));
  assert.ok(!h.prompts[0].includes(source.content));
  assert.equal(result.claims[0].claim, claim.claim);
  assert.equal(result.overallVerdict, "LIKELY FALSE");
  assert.deepEqual(result.claims[0].sources, [source.url]);
  assert.equal(result.webSearch.status, "completed");
  assert.deepEqual(events.map((e) => e.stage), ["planning", "searching", "search_result", "verifying"]);
});

test("skips search when the prompt has no verifiable claims", async () => {
  const h = harness({ claims: [] });
  const result = await factCheck("Hello!", {}, h.deps);
  assert.equal(h.prompts.length, 1);
  assert.equal(h.queries.length, 0);
  assert.equal(result.webSearch.status, "skipped");
  assert.equal(result.overallVerdict, "UNVERIFIED");
});

test("search failures are visible and do not generate an unsupported verdict", async () => {
  const h = harness({ search: async () => { throw new Error("Web search authentication failed."); } });
  const result = await factCheck(claim.claim, {}, h.deps);
  assert.equal(h.prompts.length, 1);
  assert.equal(result.webSearch.status, "failed");
  assert.equal(result.overallConfidence, 0);
  assert.match(result.warnings[0], /authentication/);
  assert.deepEqual(result.claims[0].sources, []);
});

test("empty search results remain unverified", async () => {
  const h = harness({ search: async () => [] });
  const result = await factCheck(claim.claim, {}, h.deps);
  assert.equal(h.prompts.length, 1);
  assert.equal(result.webSearch.status, "completed");
  assert.equal(result.overallConfidence, 0);
  assert.match(result.claims[0].evidence, /No relevant/);
});

test("deduplicates queries while retaining separate claims", async () => {
  const h = harness({ claims: [claim, { claim: "The Moon is rocky.", query: "  Moon composition NASA  " }] });
  const result = await factCheck("Two claims", {}, h.deps);
  assert.equal(h.queries.length, 1);
  assert.equal(result.claims.length, 2);
  assert.equal(result.claims[1].verdict, "UNVERIFIED");
});

test("partial search failure does not discard successful evidence", async () => {
  const h = harness({ claims: [claim, { claim: "Other claim", query: "other" }], search: async (q) => {
    if (q === "other") throw new Error("Search timed out.");
    return [source];
  } });
  const result = await factCheck("Two claims", {}, h.deps);
  assert.equal(result.webSearch.status, "partial");
  assert.equal(result.claims[0].verdict, "FALSE");
  assert.equal(result.claims[1].verdict, "UNVERIFIED");
});

for (const [name, verdict] of [
  ["malformed verdict", { claims: [{ id: 1, verdict: "CERTAIN", confidence: 400 }] }],
  ["invented source", { claims: [{ id: 1, verdict: "TRUE", confidence: 95, evidence: "Yes", sourceIds: [99] }] }],
  ["uncited verdict", { claims: [{ id: 1, verdict: "TRUE", confidence: 95, evidence: "Yes", sourceIds: [] }] }],
  ["duplicate claim ID", { claims: [1, 1].map((id) => ({ id, verdict: "TRUE", confidence: 95, evidence: "Yes", sourceIds: [1] })) }],
] as const) {
  test(`${name} cannot become a verified fact`, async () => {
    const h = harness({ verdict });
    const result = await factCheck(claim.claim, {}, h.deps);
    assert.equal(result.claims[0].verdict, "UNVERIFIED");
    assert.equal(result.overallConfidence, 0);
    assert.equal(result.webSearch.searches[0].results[0].url, source.url);
  });
}

test("URL requests preserve user instructions alongside article text", async () => {
  const h = harness();
  const input = "Verify only the cheese claim: https://example.com/article";
  const result = await factCheck(input, {}, h.deps);
  assert.ok(h.prompts[0].includes(input));
  assert.ok(h.prompts[0].includes("Article: Moon article"));
  assert.equal(result.source, "example.com");
});

test("unreadable URLs keep original request and surface a warning", async () => {
  const h = harness();
  h.deps.scrape = async () => { throw new Error("Offline"); };
  const result = await factCheck("https://example.com/article", {}, h.deps);
  assert.match(result.warnings[0], /Could not read/);
  assert.ok(h.prompts[0].includes("https://example.com/article"));
});

test("cancellation stops before any model or search work", async () => {
  const h = harness();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(factCheck(claim.claim, { signal: controller.signal }, h.deps), { name: "AbortError" });
  assert.equal(h.prompts.length, 0);
  assert.equal(h.queries.length, 0);
});
