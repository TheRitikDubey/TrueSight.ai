import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import dotenv from "dotenv";
import { createApp } from "../src/app.js";
import { database } from "../src/chat/database.js";
import { readCheckStream } from "../../client/src/checkStream.ts";
import type { generateReply } from "../src/chat/service.js";
import type { Message } from "@prisma/client";

type Event = { type: string; text?: string; message?: Message; error?: string };

test(
  "chat PostgreSQL integration: ownership, streaming, retry, interruption, history and deletion",
  { skip: process.env.RUN_CHAT_INTEGRATION !== "1" },
  async (t) => {
    dotenv.config();
    const cookies: string[] = [];
    let mode: "normal" | "fail" | "wait" = "normal";
    let release = () => {};
    let entered = () => {};
    let calls = 0;
    const generate: typeof generateReply = async (options) => {
      calls++;
      const user = options.messages.at(-1)!;
      assert.equal(
        (await database().message.findUnique({ where: { id: user.id } }))?.role,
        "USER",
        "user is committed before generation",
      );
      await options.onDelta("Hello ");
      entered();
      if (mode === "wait")
        await new Promise<void>((resolve, reject) => {
          release = resolve;
          options.signal.addEventListener(
            "abort",
            () => reject(options.signal.reason),
            { once: true },
          );
        });
      if (mode === "fail") throw new Error("PRIVATE_KEY_must_not_be_exposed");
      await options.onDelta("world");
      return { content: "Hello world", evidence: undefined };
    };
    const server = createApp(undefined, generate).listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/conversations`;
    t.after(async () => {
      release();
      server.closeAllConnections();
      server.close();
      for (const cookie of cookies) {
        const ownerId = createHash("sha256")
          .update(cookie.split("=")[1])
          .digest("hex");
        await database().conversation.deleteMany({ where: { ownerId } });
      }
      await database().$disconnect();
    });
    const session = async () => {
      const res = await fetch(base);
      assert.equal(res.status, 200);
      const cookie = res.headers.get("set-cookie")!.split(";")[0];
      cookies.push(cookie);
      return cookie;
    };
    const owner = await session(),
      stranger = await session();
    const request = (
      path: string,
      method = "GET",
      body?: unknown,
      cookie = owner,
      signal?: AbortSignal,
    ) =>
      fetch(base + path, {
        method,
        headers: { cookie, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });
    const created = (await (await request("", "POST", {})).json()) as {
      id: string;
    };
    const id = created.id;
    const read = async () =>
      (await (await request(`/${id}`)).json()) as { messages: Message[] };
    const events = async (response: Response) => {
      const all: Event[] = [];
      await readCheckStream(response, (event) => all.push(event as Event));
      return all;
    };
    const body = {
      messageId: randomUUID(),
      content: "Explain RAG architecture",
      verifyWeb: false,
    };
    for (const method of ["GET", "DELETE"])
      assert.equal(
        (await request(`/${id}`, method, undefined, stranger)).status,
        404,
      );
    assert.equal(
      (await request(`/${id}/messages`, "POST", body, stranger)).status,
      404,
    );
    assert.equal(
      (await request(`/${id}/messages`, "POST", { ...body, content: " " }))
        .status,
      400,
    );
    const crossSite = await fetch(base, {
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    assert.equal(crossSite.status, 403);

    mode = "wait";
    const began = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const streaming = await request(`/${id}/messages`, "POST", body);
    await began;
    const reader = streaming.body!.getReader();
    const first = await reader.read();
    assert.match(new TextDecoder().decode(first.value), /accepted/);
    assert.equal(
      (await read()).messages.length,
      1,
      "only USER saved while reply is streaming",
    );
    assert.equal(
      (await request(`/${id}/messages`, "POST", body)).status,
      409,
      "concurrent turns are rejected",
    );
    release();
    reader.releaseLock();
    const rest = await events(streaming);
    assert.equal(rest.at(-1)?.type, "done");
    let history = await read();
    assert.deepEqual(
      history.messages.map((m) => m.role),
      ["USER", "ASSISTANT"],
    );
    assert.equal(history.messages[1].content, "Hello world");
    const beforeReplay = calls;
    const replay = await events(await request(`/${id}/messages`, "POST", body));
    assert.equal(replay.at(-1)?.type, "done");
    assert.equal(calls, beforeReplay);
    assert.equal((await read()).messages.length, 2);
    const list = (await (await request("")).json()) as {
      conversations: Record<string, unknown>[];
    };
    assert.deepEqual(Object.keys(list.conversations[0]).sort(), [
      "id",
      "title",
      "updatedAt",
    ]);
    assert.equal(list.conversations[0].title, body.content);
    assert.equal(
      (
        (await (await request("", "GET", undefined, stranger)).json()) as {
          conversations: unknown[];
        }
      ).conversations.length,
      0,
    );

    mode = "fail";
    const next = {
      ...body,
      messageId: randomUUID(),
      content: "And how is it useful?",
    };
    const failed = await events(await request(`/${id}/messages`, "POST", next));
    assert.equal(failed.at(-1)?.type, "error");
    assert.ok(!JSON.stringify(failed).includes("PRIVATE_KEY"));
    assert.equal(
      (await read()).messages.length,
      3,
      "partial assistant text is never saved",
    );
    mode = "normal";
    assert.equal(
      (await events(await request(`/${id}/messages`, "POST", next))).at(-1)
        ?.type,
      "done",
    );
    history = await read();
    assert.equal(history.messages.length, 4);
    assert.equal(
      history.messages.filter((m) => m.id === next.messageId).length,
      1,
    );

    mode = "wait";
    const cancel = new AbortController();
    const interrupted = {
      ...body,
      messageId: randomUUID(),
      content: "Interrupt this reply",
    };
    const cancelling = await request(
      `/${id}/messages`,
      "POST",
      interrupted,
      owner,
      cancel.signal,
    );
    const cancellingReader = cancelling.body!.getReader();
    await cancellingReader.read();
    cancel.abort();
    await cancellingReader.cancel().catch(() => {});
    for (let attempt = 0; attempt < 50; attempt++) {
      const row = await database().conversation.findUniqueOrThrow({
        where: { id },
      });
      if (!row.generationId) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal((await read()).messages.length, 5);
    assert.equal(
      (await database().conversation.findUniqueOrThrow({ where: { id } }))
        .generationId,
      null,
    );
    mode = "normal";
    assert.equal(
      (await events(await request(`/${id}/messages`, "POST", interrupted))).at(
        -1,
      )?.type,
      "done",
    );
    assert.equal((await request(`/${id}`, "DELETE")).status, 204);
    assert.equal(
      await database().message.count({ where: { conversationId: id } }),
      0,
      "deletion cascades",
    );
    assert.equal((await request(`/${id}`)).status, 404);
  },
);
