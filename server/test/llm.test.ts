import test from "node:test";
import assert from "node:assert/strict";
import { generateJSON } from "../src/tools/llm.js";

test("native Ollama request disables thinking and requests bounded JSON output", async (t) => {
  const names = ["LLM_BASE_URL", "LLM_PROVIDER", "LLM_MODEL", "LLM_THINK"];
  const previous = names.map((name) => process.env[name]);
  t.after(() => names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; }));
  process.env.LLM_BASE_URL = "http://localhost:11434/v1";
  process.env.LLM_PROVIDER = "ollama";
  process.env.LLM_MODEL = "qwen3:8b";
  process.env.LLM_THINK = "false";
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "http://localhost:11434/api/chat");
    const body = JSON.parse(options.body as string);
    assert.equal(body.think, false);
    assert.equal(body.format, "json");
    assert.equal(body.options.num_predict, 900);
    assert.equal(body.keep_alive, "10m");
    assert.ok(options.signal);
    return new Response(JSON.stringify({ message: { content: '{"claims":[]}' } }));
  });
  assert.deepEqual(await generateJSON("Extract claims", 900), { claims: [] });
});

test("truncated model output fails explicitly", async (t) => {
  const previous = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "ollama";
  t.after(() => { if (previous === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = previous; });
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ message: { content: '{"claims":' }, done_reason: "length" })));
  await assert.rejects(generateJSON("Extract claims", 900), /exceeded the token limit/);
});
