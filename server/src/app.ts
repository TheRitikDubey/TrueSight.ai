import express from "express";
import cors from "cors";
import { factCheck } from "./agents/factCheckAgent.js";

export function createApp(runCheck = factCheck) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "32kb" }));
  app.get("/api/health", (_, res) => {
    res.json({ status: "ok", agent: "TrueSight.ai", searchConfigured: Boolean(process.env.TAVILY_API_KEY?.trim()) });
  });
  app.post("/api/check", async (req, res) => {
    const input = req.body?.input;
    if (typeof input !== "string" || !input.trim() || input.trim().length > 10000) {
      return res.status(400).json({ error: "Provide between 1 and 10,000 characters of news text, a question, or a URL." });
    }
    const streaming = req.get("accept")?.includes("application/x-ndjson");
    const controller = new AbortController();
    res.on("close", () => { if (!res.writableEnded) controller.abort(); });
    const send = (event: unknown) => {
      if (!res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
    };
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    if (streaming) {
      res.set({ "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
      res.flushHeaders();
      send({ type: "progress", stage: "planning", message: "Connecting to the local model…", elapsedMs: 0 });
      heartbeat = setInterval(() => send({ type: "heartbeat" }), 10000);
    }
    try {
      const result = await runCheck(input.trim(), {
        signal: controller.signal,
        onProgress: streaming ? (event) => send({ type: "progress", ...event }) : undefined,
      });
      if (controller.signal.aborted) return;
      if (streaming) { send({ type: "result", result }); res.end(); }
      else res.json(result);
    } catch {
      if (controller.signal.aborted) return;
      // SDK errors may include credentials or request data. Return a safe actionable message.
      const error = "Fact-check failed. Check that your local LLM is running and LLM_BASE_URL / LLM_MODEL are correct, then retry.";
      console.error(error);
      if (streaming) { send({ type: "error", error }); res.end(); }
      else res.status(500).json({ error });
    } finally {
      if (heartbeat) clearInterval(heartbeat);
    }
  });
  return app;
}
