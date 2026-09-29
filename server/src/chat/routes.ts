import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { database } from "./database.js";
import { chatSession } from "./session.js";
import { generateReply } from "./service.js";

class ChatError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const summary = { id: true, title: true, updatedAt: true } as const;
const inputSchema = z
  .object({
    content: z.string().trim().min(1).max(10000),
    messageId: z.string().uuid(),
    verifyWeb: z.boolean().default(false),
  })
  .strict();
const route =
  (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };

export function conversationRoutes(generate = generateReply) {
  const router = Router();
  router.use(chatSession);
  router.get(
    "/",
    route(async (req, res) => {
      const cursor =
        typeof req.query.cursor === "string" ? req.query.cursor : undefined;
      const rows = await database().conversation.findMany({
        where: { ownerId: res.locals.ownerId },
        select: summary,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 51,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const hasMore = rows.length > 50;
      const conversations = rows.slice(0, 50);
      res.json({
        conversations,
        nextCursor: hasMore ? conversations.at(-1)!.id : null,
      });
    }),
  );
  router.post(
    "/",
    route(async (_, res) => {
      const conversation = await database().conversation.create({
        data: { ownerId: res.locals.ownerId },
        select: summary,
      });
      res.status(201).json(conversation);
    }),
  );
  router.get(
    "/:id",
    route(async (req, res) => {
      const conversation = await database().conversation.findFirst({
        where: { id: String(req.params.id), ownerId: res.locals.ownerId },
        select: {
          ...summary,
          generatingUntil: true,
          messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        },
      });
      if (!conversation) throw new ChatError(404, "Conversation not found.");
      res.json(conversation);
    }),
  );
  router.delete(
    "/:id",
    route(async (req, res) => {
      const result = await database().conversation.deleteMany({
        where: { id: String(req.params.id), ownerId: res.locals.ownerId },
      });
      if (!result.count) throw new ChatError(404, "Conversation not found.");
      res.status(204).end();
    }),
  );
  router.post(
    "/:id/messages",
    route(async (req, res) => {
      const parsed = inputSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ChatError(
          400,
          "Provide a message of 1–10,000 characters and a valid message ID.",
        );
      const { content, messageId, verifyWeb } = parsed.data;
      const id = String(req.params.id);
      const ownerId: string = res.locals.ownerId;
      const generationId = randomUUID();
      const controller = new AbortController();
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(300000),
      ]);
      res.on("close", () => {
        if (!res.writableEnded) controller.abort();
      });
      // Atomic lease also protects multiple server processes. It outlives the request timeout.
      const prepared = await database().$transaction(async (tx:any) => {
        const locked = await tx.conversation.updateMany({
          where: {
            id,
            ownerId,
            OR: [
              { generatingUntil: null },
              { generatingUntil: { lt: new Date() } },
            ],
          },
          data: {
            generationId,
            generatingUntil: new Date(Date.now() + 360000),
          },
        });
        if (!locked.count) {
          const exists = await tx.conversation.count({
            where: { id, ownerId },
          });
          throw new ChatError(
            exists ? 409 : 404,
            exists
              ? "A reply is already being generated. Wait a moment, then retry."
              : "Conversation not found.",
          );
        }
        const previous = await tx.message.findUnique({
          where: { id: messageId },
        });
        if (
          previous &&
          (previous.conversationId !== id ||
            previous.role !== "USER" ||
            previous.content !== content ||
            previous.verifyWeb !== verifyWeb)
        ) {
          throw new ChatError(409, "This message ID has already been used.");
        }
        const completed = previous
          ? await tx.message.findUnique({ where: { replyToId: messageId } })
          : null;
        if (completed) {
          await tx.conversation.update({
            where: { id },
            data: { generationId: null, generatingUntil: null },
          });
          return {
            completed,
            user: previous!,
            messages: [],
            conversation: await tx.conversation.findUniqueOrThrow({
              where: { id },
              select: summary,
            }),
          };
        }
        const latest = await tx.message.findFirst({
          where: { conversationId: id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        if (previous && latest?.id !== messageId)
          throw new ChatError(
            409,
            "Only the latest unanswered message can be retried.",
          );
        if (!previous && latest?.role === "USER")
          throw new ChatError(
            409,
            "Retry the unanswered message before sending a new one.",
          );
        const user =
          previous ??
          (await tx.message.create({
            data: {
              id: messageId,
              conversationId: id,
              role: "USER",
              content,
              verifyWeb,
            },
          }));
        const conversation = await tx.conversation.update({
          where: { id },
          data: {
            ...(!latest
              ? { title: content.replace(/\s+/g, " ").slice(0, 60) }
              : {}),
            updatedAt: new Date(),
          },
          select: summary,
        });
        const recent = await tx.message.findMany({
          where: { conversationId: id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 40,
        });
        return {
          completed: null,
          user,
          messages: recent.reverse(),
          conversation,
        };
      });
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const send = (event: unknown) => {
        if (res.destroyed || res.writableEnded) return false;
        return res.write(`${JSON.stringify(event)}\n`);
      };
      try {
        signal.throwIfAborted();
        res.set({
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
          "X-Accel-Buffering": "no",
        });
        res.flushHeaders();
        send({
          type: "accepted",
          message: prepared.user,
          conversation: prepared.conversation,
        });
        if (prepared.completed) {
          send({
            type: "done",
            message: prepared.completed,
            conversation: prepared.conversation,
          });
          res.end();
          return;
        }
        heartbeat = setInterval(() => send({ type: "heartbeat" }), 10000);
        const reply = await generate({
          messages: prepared.messages,
          signal,
          onProgress: (event) => {
            send({ type: "progress", ...event });
          },
          onEvidence: (result) => {
            send({ type: "evidence", result });
          },
          onDelta: async (text) => {
            signal.throwIfAborted();
            if (!send({ type: "delta", text }))
              await once(res, "drain", { signal });
          },
        });
        signal.throwIfAborted();
        const saved = await database().$transaction(async (tx:any) => {
          const lock = await tx.conversation.updateMany({
            where: { id, ownerId, generationId },
            data: {
              generationId: null,
              generatingUntil: null,
              updatedAt: new Date(),
            },
          });
          if (!lock.count)
            throw new Error("Conversation removed or generation expired.");
          const message = await tx.message.create({
            data: {
              conversationId: id,
              role: "ASSISTANT",
              content: reply.content,
              replyToId: messageId,
              evidence: reply.evidence
                ? (JSON.parse(
                    JSON.stringify(reply.evidence),
                  ) as Prisma.InputJsonValue)
                : undefined,
            },
          });
          const conversation = await tx.conversation.findUniqueOrThrow({
            where: { id },
            select: summary,
          });
          return { message, conversation };
        });
        send({ type: "done", ...saved });
        res.end();
      } catch {
        if (!res.destroyed) {
          send({
            type: "error",
            error: signal.aborted
              ? "Generation was interrupted. Your message is saved; retry when ready."
              : "Could not complete or save the reply. Check the model and database, then retry.",
          });
          res.end();
        }
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        await database()
          .conversation.updateMany({
            where: { id, generationId },
            data: { generationId: null, generatingUntil: null },
          })
          .catch(() => {
            console.error(
              "Could not release chat generation lease; it will expire automatically.",
            );
          });
      }
    }),
  );
  router.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      const status = error instanceof ChatError ? error.status : 503;
      res
        .status(status)
        .json({
          error:
            error instanceof ChatError
              ? error.message
              : "Chat storage is unavailable. Check PostgreSQL and run the database migrations, then retry.",
        });
    },
  );
  return router;
}
