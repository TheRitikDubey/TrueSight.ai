# 🛡️ TrueSight.ai

AI-powered news fact-checker. Paste a news URL or text — the agent extracts claims, searches the web for each, and returns a verdict with sources.

## Architecture

```
User Input (URL or text)
    │
    ▼
┌─────────────────────┐
│  Scraper (cheerio)   │ ← if URL provided
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  Claim Extractor     │ ← LLM call: break news into 2-5 verifiable claims
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  Web Search (Tavily) │ ← tool call per claim (parallel)
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  Verdict Generator   │ ← LLM call: compare claim vs evidence
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  Aggregator          │ ← overall verdict + summary
└─────────────────────┘
```

## Setup

### 1. Get API keys

- **Anthropic**: https://console.anthropic.com → API Keys
- **Tavily**: https://tavily.com → free tier (1000 searches/month)

### 2. Install & configure

```bash
# Clone and enter project
cd TrueSight.ai

# Install dependencies
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

# Set up environment
cp server/.env.example server/.env
# Edit server/.env with your API keys
```

### 3. Run

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Agent concepts you'll learn

| Concept | Where it lives |
|---------|---------------|
| Tool use (search, scrape) | `server/src/tools/` |
| Agent loop with LLM decisions | `server/src/agents/factCheckAgent.ts` |
| Structured output parsing | Claim extraction + verdict parsing |
| Parallel tool execution | `Promise.all(claims.map(verifyClaim))` |
| Multi-step reasoning | Extract → Search → Judge → Summarize |

## Next steps

- [ ] Add streaming (SSE) so verdicts appear as they complete
- [ ] Add a retry loop: if confidence < 40%, search with a rephrased query
- [ ] Store past checks in SQLite for a history view
- [ ] Add source credibility scoring (known reliable vs tabloid domains)
