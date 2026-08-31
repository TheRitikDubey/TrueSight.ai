import "dotenv/config";
import express from "express";
import cors from "cors";
import { factCheck } from "./agents/factCheckAgent.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (_, res) => {
  res.json({ status: "ok", agent: "TrueSight.ai" });
});

// Main fact-check endpoint
app.post("/api/check", async (req, res) => {
  const { input } = req.body;

  if (!input || typeof input !== "string" || input.trim().length < 10) {
    return res.status(400).json({ error: "Provide at least 10 characters of news text or a URL." });
  }

  try {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`📰 New fact-check request (${input.length} chars)`);
    console.log(`${"═".repeat(60)}`);

    const result = await factCheck(input.trim());
    res.json(result);
  } catch (err: any) {
    console.error("Fact-check failed:", err);
    res.status(500).json({ error: "Fact-check failed. " + (err.message || "") });
  }
});

app.listen(PORT, () => {
  console.log(`\n🛡️  TrueSight.ai server running on http://localhost:${PORT}`);
  console.log(`   POST /api/check  { "input": "<url or news text>" }\n`);
});
