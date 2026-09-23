import test from "node:test";
import assert from "node:assert/strict";
import { readCheckStream } from "../../client/src/checkStream.ts";

test("browser stream parser handles split JSON and multibyte characters", async () => {
  const events = [{ type: "progress", message: "Searching 🔎" }, { type: "result", result: { summary: "Done" } }];
  const encoded = new TextEncoder().encode(events.map((e) => JSON.stringify(e)).join("\n"));
  const stream = new ReadableStream({ start(controller) {
    for (const byte of encoded) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } });
  const received: unknown[] = [];
  await readCheckStream(new Response(stream), (event) => received.push(event));
  assert.deepEqual(received, events);
});

test("stream errors propagate to the UI", async () => {
  await assert.rejects(readCheckStream(new Response('{"type":"error","error":"Offline"}\n'), (raw: any) => {
    if (raw.type === "error") throw new Error(raw.error);
  }), /Offline/);
});
