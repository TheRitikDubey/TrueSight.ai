import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { readCheckStream } from "../../client/src/checkStream.ts";
import type { FactCheckResult } from "../src/agents/factCheckAgent.js";

const result: FactCheckResult = { title: "Test", source: "direct input", claims: [], overallVerdict: "UNVERIFIED", overallConfidence: 0,
  summary: "Nothing to verify", warnings: [], webSearch: { status: "skipped", reason: "Greeting", searches: [] },
  timings: { totalMs: 1, planningMs: 1, searchMs: 0, verificationMs: 0 } };

test("API streams progress before completion and retains JSON compatibility", async (t) => {
  const server = createApp(async (_, options) => {
    options?.onProgress?.({ stage: "searching", message: "Searching now", elapsedMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    return result;
  }).listen(0, "127.0.0.1");
  t.after(() => { server.closeAllConnections(); server.close(); });
  await once(server, "listening");
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api/check`;
  const post = (input: unknown, accept = "application/json") => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: accept }, body: JSON.stringify({ input }) });
  const response = await post("Hello", "application/x-ndjson");
  assert.match(response.headers.get("content-type")!, /ndjson/);
  const events: any[] = [];
  await readCheckStream(response, (event) => events.push(event));
  assert.deepEqual(events.map((e) => e.type), ["progress", "progress", "result"]);
  assert.equal(events[1].message, "Searching now");
  assert.deepEqual(events[2].result, result);
  assert.deepEqual(await (await post("Hello")).json(), result);
  for (const input of [null, 42, " ", "x".repeat(10001)]) assert.equal((await post(input)).status, 400);
});

test("API sends a stream error instead of leaving the browser waiting", async (t) => {
  const server = createApp(async () => { throw new Error("credential-bearing SDK error"); }).listen(0, "127.0.0.1");
  t.after(() => { server.closeAllConnections(); server.close(); });
  await once(server, "listening");
  const address = server.address() as { port: number };
  const response = await fetch(`http://127.0.0.1:${address.port}/api/check`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ input: "Test" }),
  });
  const events: any[] = [];
  await readCheckStream(response, (event) => events.push(event));
  assert.equal(events.at(-1).type, "error");
  assert.ok(!JSON.stringify(events).includes("credential-bearing"));
});
