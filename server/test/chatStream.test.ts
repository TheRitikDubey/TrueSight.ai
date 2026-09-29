import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { streamChat } from "../src/tools/llm.js";

function configure(t: TestContext) {
  const previous = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "ollama";
  t.after(() => {
    if (previous === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = previous;
  });
}

test("Ollama yields native chunks before completion, including split UTF-8", async (t) => {
  configure(t);
  let finish!: () => void;
  const encoder = new TextEncoder();
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, options: RequestInit) => {
      const request = JSON.parse(options.body as string);
      assert.equal(request.stream, true);
      assert.equal(request.think, false);
      return new Response(
        new ReadableStream({
          start(controller) {
            const first = encoder.encode(
              JSON.stringify({ message: { content: "Café " }, done: false }) +
                "\n",
            );
            const split = first.indexOf(0xc3) + 1;
            controller.enqueue(first.slice(0, split));
            controller.enqueue(first.slice(split));
            finish = () => {
              controller.enqueue(
                encoder.encode(
                  '{"message":{"content":"works"},"done":true,"done_reason":"stop"}\n',
                ),
              );
              controller.close();
            };
          },
        }),
      );
    },
  );
  const iterator = streamChat(
    [{ role: "user", content: "Hi" }],
    new AbortController().signal,
  );
  assert.deepEqual(await iterator.next(), { value: "Café ", done: false });
  finish();
  assert.deepEqual(await iterator.next(), { value: "works", done: false });
  assert.equal((await iterator.next()).done, true);
});

test("Ollama rejects disconnected and truncated streams rather than saving partial content", async (t) => {
  configure(t);
  for (const payload of [
    '{"message":{"content":"Partial"},"done":false}\n',
    '{"done":true,"done_reason":"length"}\n',
    '{"error":"failure"}\n',
  ]) {
    t.mock.method(globalThis, "fetch", async () => new Response(payload));
    await assert.rejects(async () => {
      for await (const _ of streamChat(
        [{ role: "user", content: "Hi" }],
        new AbortController().signal,
      )) {
        /* consume */
      }
    });
  }
});

test("OpenAI-compatible providers stream deltas and require a successful finish", async (t) => {
  const { createServer } = await import("node:http");
  const { once } = await import("node:events");
  let finishReason = "stop";
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    assert.equal(JSON.parse(body).stream, true);
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "Genuine " }, finish_reason: null }] })}\n\n`,
    );
    res.write(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "chunks" }, finish_reason: null }] })}\n\n`,
    );
    res.end(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`,
    );
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const previousProvider = process.env.LLM_PROVIDER;
  const previousUrl = process.env.LLM_BASE_URL;
  process.env.LLM_PROVIDER = "openai";
  process.env.LLM_BASE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
  t.after(() => {
    if (previousProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = previousProvider;
    if (previousUrl === undefined) delete process.env.LLM_BASE_URL;
    else process.env.LLM_BASE_URL = previousUrl;
    server.closeAllConnections();
    server.close();
  });
  const collect = async () => {
    const chunks: string[] = [];
    for await (const chunk of streamChat(
      [{ role: "user", content: "Hello" }],
      new AbortController().signal,
    ))
      chunks.push(chunk);
    return chunks;
  };
  assert.deepEqual(await collect(), ["Genuine ", "chunks"]);
  finishReason = "length";
  await assert.rejects(collect(), /did not complete/);
});
