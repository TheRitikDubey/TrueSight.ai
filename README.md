# TrueSight.ai

A local-LLM chat workspace with persistent conversations and optional live web fact-checking. Ask a question, explore an idea, or verify a claim or news URL with source-backed evidence.

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

This version batches verification, eliminates the summary generation call, defaults to basic search, keeps the Ollama model loaded for ten minutes, and disables thinking through [Ollama's native API](https://docs.ollama.com/api/chat). Set `LLM_THINK=true` if you prefer thinking mode. The legacy `/api/check` endpoint streams progress and source links, then a structured verdict after verification. The new chat interface additionally streams actual model text; with web verification enabled, that text generation starts after evidence collection and assessment. A cold model load, slower hardware, or poor internet will still increase total time. Expand a result's Web search panel to see planning, search, and verification durations.

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

## Persistent streaming chat

The main page is a conversational workspace with a responsive history sidebar, Markdown/code rendering, stop/retry controls, and browser-session persistence. Chat uses the same local model settings as fact-checking. Enable **Verify with web** in the composer to run the existing fact-check pipeline first, inspect its evidence cards, and then stream a conversational explanation. This adds a model generation after the original structured check. Ordinary chat streams immediately without a search/planning round trip. The original `/api/check` API is unchanged.

### PostgreSQL setup

Prisma 6 and PostgreSQL are configured in `server/prisma/schema.prisma`. Set the server-only `DATABASE_URL` in `server/.env` to a PostgreSQL database you own. Do not replace other settings or expose it as a Vite variable.

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/truesight"
```

On this development machine, PostgreSQL 16 was installed through Homebrew and a separate `truesight` database was created on **5433**, because 5432 was already occupied. `server/.env` points to 5433. The new server runs from `/opt/homebrew/var/postgresql@16`; it was started manually, not registered to start on login. If it is stopped, restart it with:

```bash
/opt/homebrew/opt/postgresql@16/bin/pg_ctl \
  -D /opt/homebrew/var/postgresql@16 \
  -l /opt/homebrew/var/postgresql@16/server.log \
  -o '-p 5433' start
```

For another machine, create a PostgreSQL database and use your own connection string. The development migration user needs permission to create a shadow database. With dependencies installed:

```bash
cd server
npx prisma generate
npx prisma migrate dev --name add_chat_history
npx prisma migrate status
cd ..
npm run dev
```

Use `npm --prefix server run db:deploy` to apply committed migrations in deployment; do not use `migrate dev` against production. Serve the frontend and `/api` on the same origin over HTTPS, and set `NODE_ENV=production` for secure session cookies. Keep Ollama and PostgreSQL accessible only to the backend. Required settings: `DATABASE_URL`; existing `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_PROVIDER` retain their defaults. `LLM_API_KEY` is optional for compatible providers. `TAVILY_API_KEY` is needed only for web verification.

### Conversation API

| Route | Behavior |
| --- | --- |
| `POST /api/conversations` | Create a conversation for the current session. The UI calls this on first send. |
| `GET /api/conversations?cursor=ID` | Return `{ conversations, nextCursor }`; 50 lightweight summaries, newest first. |
| `GET /api/conversations/:id` | Return the conversation, generation lease, and messages in chronological order. |
| `DELETE /api/conversations/:id` | Delete an owned conversation and its messages. |
| `POST /api/conversations/:id/messages` | Accept `{ content, messageId, verifyWeb }`; `messageId` is a stable UUID used for retries. |

The message endpoint returns newline-delimited JSON using streaming `fetch`, matching the existing API convention. Events are `accepted`, `progress`, `evidence`, `delta`, `heartbeat`, `done`, and `error`. `delta` events carry genuine chunks from Ollama's native streaming API or the existing OpenAI-compatible SDK. A final `done` event is sent **only after** the assistant message commits to PostgreSQL. A provider failure, truncation, disconnect, or save failure leaves the original user message available for retry; partial assistant text is not stored. Repeating a completed message ID replays its saved reply without another generation. A database lease rejects overlapping turns across tabs/server processes; after a server crash it expires within six minutes.

Google account authentication is now available (see setup below). Existing chat history still uses its separate opaque HttpOnly, SameSite=Strict browser cookie; only its SHA-256 hash is stored on conversations. All history, send, and delete operations check browser ownership. History remains **browser-specific**: signing in does not attach existing conversations to a user, migrate messages, or enable cross-device sync. Signing out clears the account session but leaves this browser’s existing chat history available in guest mode. Future account-scoped APIs must use the verified user from `requireAuth`, not a supplied email. The existing legacy `/api/check` remains stateless.

### Validation

```bash
npm --prefix server test                 # unit/API regressions; no model/search calls
npm --prefix server run test:chat        # real PostgreSQL, mocked generation; isolated test rows cleaned up
npm --prefix server run build
npm --prefix client run build
npm --prefix client run lint
```

`test:chat` uses `server/.env` and a migrated database. It verifies ownership isolation, immediate user persistence, streaming before final save, duplicate retry recovery, concurrent turn protection, interrupted generation, chronological history, and cascading deletion. Native streaming unit tests cover split UTF-8 chunks and missing/truncated completions; an OpenAI-compatible SSE fixture checks that provider path as well.

The server pins a patched `deepmerge-ts` override for Prisma 6’s configuration helper; keep it until upgrading to a Prisma release that includes the patched dependency. Prisma client generation and migration status were verified with this override.

For a manual check, send a short prompt with Ollama running, observe the thinking animation and progressive reply, refresh, start a new chat, reopen the previous chat, and send a follow-up. Try Stop and Retry, enable web verification, and test the collapsible sidebar on a narrow screen. New Chat alone creates no database row.

Model context is bounded to the most recent 40 messages and approximately 24,000 characters (plus current verification evidence); all completed messages remain stored and visible. Web verification checks the current user message; for follow-up claims, include the claim explicitly. There is no account recovery, cross-device history, or automatic generation resumption after a server restart.


## Google authentication and guest questions

The existing React hooks now share an `AuthProvider` for user/loading state, login, logout, and session refresh. The header’s **Sign in** button and guest limit open the same Motion bottom sheet, with a focus trap, Escape/backdrop dismissal, reduced-motion support, and safe errors. The composer draft survives the OAuth redirect in tab-scoped session storage. Sign-in returns to the selected browser conversation. The signed-in profile in the header confirms success.

Guests can submit three distinct questions across conversations and reloads. The fourth attempt opens sign-in and keeps its draft. The localStorage counter records submitted questions (including interrupted/failed submissions); retrying the same message ID does not spend another question. Signing in removes the limit; logout restores the existing guest allowance, without resetting it. To change the default, copy `client/.env.example` to `client/.env.local` and set `VITE_FREE_GUEST_QUESTIONS` to a non-negative integer, then restart/rebuild Vite. This is explicitly a UX limit, not API rate limiting: clearing browser storage bypasses it. Storage-restricted browsers fall back to a page-local counter.

The backend exchanges the authorization code and uses Google’s official auth library to validate the ID token’s signature, issuer, audience, and expiry. OAuth state is browser-bound, expiring, and consumed once; PKCE and nonce add code/token replay protection. Only a verified email is accepted. Emails are normalized and have a database uniqueness constraint; concurrent sign-ins reuse one user. A stored email cannot be silently rebound to a different Google subject. Changed account emails/identity conflicts require a future account-recovery flow instead of automatically merging accounts.

Account sessions use random opaque tokens in HttpOnly, SameSite=Lax cookies, with Secure enabled in production. PostgreSQL stores only their hashes, with a fixed 30-day expiry. Login rotates the current session; logout revokes it without deleting the user. Expired sessions and OAuth attempts are pruned during subsequent logins. Google access/refresh tokens are never persisted or returned to the frontend. No JWT or session-signing secret is needed. Auth responses use `no-store`; cross-origin auth mutations are rejected. All frontend requests use the same-origin `/api` proxy, so credentialed CORS is unnecessary.

| Route | Purpose |
| --- | --- |
| `POST /api/auth/google` | Start browser-bound OAuth; JSON body may contain a validated `returnTo`. |
| `GET /api/auth/google/callback` | Verify Google response, create/retrieve user, establish session, redirect to the app. |
| `GET /api/auth/session` | Return `{ user: { id, email, name, avatar } }` or `{ user: null }`. |
| `POST /api/auth/logout` | Revoke the current session and clear auth cookies. |

`server/src/auth/session.ts` exports `requireAuth` for future protected routes. It derives `res.locals.user.id/email` exclusively from a verified database session. Existing guest chat APIs retain their browser ownership checks; account-linked conversation persistence is intentionally deferred.

### Manual setup required

1. In [Google Cloud / Google Auth Platform](https://console.cloud.google.com/auth/overview), create/select a project. Configure **Branding** (app name, support/developer email), **Audience** (Internal or External as appropriate), and **Data Access** for the `openid`, `email`, and `profile` scopes. While External is in Testing, add your Google account under test users. Configure production app domains and publish the consent configuration when ready. See [Google’s server-flow setup](https://developers.google.com/identity/openid-connect/openid-connect).
2. Under **Clients**, create an OAuth client of type **Web application**. Copy its client ID and client secret into **server/.env only** as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Never use `VITE_` prefixes for either. Do not commit `.env`.
3. Register this exact **Authorized redirect URI** for development: `http://localhost:5173/api/auth/google/callback`. Set `FRONTEND_URL=http://localhost:5173` and `GOOGLE_CALLBACK_URL=http://localhost:5173/api/auth/google/callback`. Open the app at `localhost`, not `127.0.0.1`. The callback goes through Vite’s `/api` proxy to Express on port 3001; do not register port 3001 as the callback.
4. For production, replace `YOUR_APP_DOMAIN` with your public hostname. Register `https://YOUR_APP_DOMAIN/api/auth/google/callback`, set `FRONTEND_URL=https://YOUR_APP_DOMAIN`, `GOOGLE_CALLBACK_URL=https://YOUR_APP_DOMAIN/api/auth/google/callback`, and `NODE_ENV=production`. Serve the frontend and `/api` on that **same HTTPS origin**, forwarding `/api` to Express without stripping its prefix. The production domain is not configured in this repository yet.
5. **Authorized JavaScript origins:** none required for this backend authorization-code flow; no browser Google SDK is used. Redirect URI configuration is required.
6. Keep `DATABASE_URL` pointing at PostgreSQL and apply the committed auth migration before starting the backend:

   ```bash
   npm --prefix server install
   npm --prefix client install
   npm --prefix server run db:generate
   npm --prefix server run db:deploy
   npm run dev
   ```

No Google credentials are included. Until they are configured, guest chat remains available and clicking Continue with Google displays an unavailable message. The new migration adds only User, AuthSession, and OAuthAttempt tables; it does not modify or migrate conversations/messages.

### Authentication validation

```bash
npm --prefix server test
npm --prefix server run test:auth
npm --prefix server run test:chat
npm --prefix server run build
npm --prefix client run build
npm --prefix client run lint
```

`test:auth` uses the configured PostgreSQL database and a mocked Google provider; it creates unique test accounts and cleans up its rows. It covers browser/state binding, replay, cancellation, expiration, unsafe return URLs, unique-user races, cookie sessions, session rotation/revocation, verified identity lookup, and cross-origin rejection. Unit tests also cover nonce/verified-email checks and guest persistence, retries, and unavailable storage. No test requests a live Google token.

After supplying credentials, manually verify: Sign in → Continue with Google → app/profile; refresh retains login; logout returns to guest mode; three guest sends work and the fourth opens the sheet; Escape/backdrop closes it but another send reopens it; a retained fourth-question draft can be sent after sign-in; Google cancellation shows a retryable error. Check both desktop and mobile widths. Cross-device chat restoration is not part of this phase.
