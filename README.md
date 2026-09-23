# TrueSight.ai

A local-LLM fact-checker with live web evidence. Enter a claim, factual question, or news URL. The app shows its search queries, retrieved sources, progress, and evidence-based verdicts.

## Setup

Install Node.js 22 or newer, [Ollama](https://ollama.com), and pull the configured model:

```bash
ollama pull qwen3:8b
npm install
npm --prefix server install
npm --prefix client install
cp server/.env.example server/.env
```

If `server/.env` already exists, keep it and add any desired settings from the example. Set `TAVILY_API_KEY` to your key from [Tavily](https://app.tavily.com). The LLM runs locally; search queries are sent to Tavily. No Anthropic key is required.

Start Ollama and then run:

```bash
npm run dev
```

Frontend: http://localhost:5173. Backend: http://localhost:3001.

The server loads `server/.env` regardless of its working directory. Defaults are `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_MODEL=qwen3:8b`, thinking disabled, and basic search. Use `LLM_PROVIDER=ollama` for custom Ollama ports or proxies. For other OpenAI-compatible local servers use `LLM_PROVIDER=openai` and their base URL; `LLM_API_KEY` is optional if the server requires authentication.

## How checks work

1. Read the linked article when a URL is supplied, keeping the original request alongside it.
2. Make one structured LLM call to identify up to five claims or factual questions and focused search queries. Greetings, creative requests, pure opinions, and requests forbidding search should skip browsing. This routing is model-based; inspect the search reason in the result.
3. Search Tavily for each distinct query in parallel. Queries, links, empty results, and failures appear live. Search requests time out after 15 seconds. Failed searches remain unverified.
4. Make one batched LLM call to compare claims against their retrieved evidence. Only valid source IDs can become citation links. Missing or malformed verdicts remain unverified.
5. Aggregate the result and build its summary without another LLM call. Each result includes timing details and the search activity, including sources for manual review if verification fails.

A normal fact-check uses two model calls. A prompt without verifiable content, or a check with no retrieved evidence, uses one. Duplicate queries share a single search within the request. There is no cross-request search cache.

## Why the terminal can feel faster

A terminal chat often starts displaying tokens from a single generation immediately. A fact-check also needs claim planning, network search, and evidence comparison. The previous app made up to seven model calls, used advanced search by default, generated thinking that was discarded afterwards, and showed only the final JSON response.

This version batches verification, eliminates the summary generation call, defaults to basic search, keeps the Ollama model loaded for ten minutes, and disables thinking through [Ollama's native API](https://docs.ollama.com/api/chat). Set `LLM_THINK=true` if you prefer thinking mode. The UI streams progress and source links; the final structured verdict arrives after verification, rather than streaming model tokens. A cold model load, slower hardware, or poor internet will still increase total time. Expand a result's Web search panel to see planning, search, and verification durations.

## Search troubleshooting

Authentication uses the `Authorization: Bearer` header required by the [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search). The old URL query parameter returned HTTP 401 with the configured account.

- Missing/invalid key: the result explains how to configure `TAVILY_API_KEY`.
- Quota or rate limit: check your Tavily account, then retry.
- Poor connectivity: the result shows timeout/provider failure and remains unverified.
- No results: the UI says so; absence of evidence does not become a false verdict.
- LLM unavailable: check Ollama, `LLM_BASE_URL`, and `LLM_MODEL`.

`GET /api/health` reports whether a key is configured, not whether the key is valid. Search evidence consists of bounded snippets, not full source-page review. Confidence is a model assessment rather than a calibrated probability; inspect cited sources for important decisions.

## API and checks

`POST /api/check` accepts `{ "input": "claim, question, or URL" }` with 1–10,000 characters. It returns JSON by default. Add `Accept: application/x-ndjson` for newline-delimited `progress`, `heartbeat`, `result`, and `error` events. A stream can report an error after HTTP headers have been sent, so clients must handle the `error` event. Disconnecting or cancelling aborts pending work.

```bash
npm --prefix server test
npm --prefix server run build
npm --prefix client run build
npm --prefix client run lint
```

Tests use mock LLM/search responses and temporary localhost HTTP servers. They do not consume search credits or require a running LLM.
