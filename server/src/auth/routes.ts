import { createHash } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { database } from "../chat/database.js";
import { findOrCreateGoogleUser } from "../users/service.js";
import { googleProvider, type GoogleProvider } from "./google.js";
import { ATTEMPT_MS, AUTH_COOKIE, OAUTH_COOKIE, cookieOptions, frontendUrl, safeReturnTo } from "./config.js";
import { establishSession, hashToken, randomToken, readToken, resolveUser, sameOrigin } from "./session.js";

const route = (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { void handler(req, res).catch(next); };

export function authRoutes(provider: GoogleProvider = googleProvider) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    next();
  });
  router.get("/session", route(async (req, res) => {
    res.json({ user: await resolveUser(req, res) });
  }));
  router.post("/google", sameOrigin, route(async (req, res) => {
    const state = randomToken(), browser = randomToken(), nonce = randomToken(), codeVerifier = randomToken();
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const authorizationUrl = provider.authorizationUrl(state, nonce, codeChallenge);
    const previous = readToken(req, OAUTH_COOKIE);
    await database().oAuthAttempt.deleteMany({ where: { OR: [
      { expiresAt: { lte: new Date() } },
      ...(previous ? [{ browserHash: hashToken(previous) }] : []),
    ] } });
    await database().oAuthAttempt.create({ data: {
      stateHash: hashToken(state), browserHash: hashToken(browser), nonce, codeVerifier,
      returnTo: safeReturnTo(req.body?.returnTo), expiresAt: new Date(Date.now() + ATTEMPT_MS),
    } });
    res.cookie(OAUTH_COOKIE, browser, { ...cookieOptions(), maxAge: ATTEMPT_MS });
    res.json({ authorizationUrl });
  }));
  router.get("/google/callback", route(async (req, res) => {
    let returnTo = "/";
    let errorCode = "failed";
    try {
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const browser = readToken(req, OAUTH_COOKIE);
      if (!/^[a-f0-9]{64}$/.test(state) || !browser) throw new Error("Missing OAuth state.");
      const attempt = await database().oAuthAttempt.findUnique({ where: { stateHash: hashToken(state) } });
      if (!attempt || attempt.browserHash !== hashToken(browser) || attempt.expiresAt.getTime() <= Date.now()) {
        throw new Error("Invalid OAuth state.");
      }
      // Atomic consumption prevents a callback from being replayed, including concurrent requests.
      const consumed = await database().oAuthAttempt.deleteMany({ where: { stateHash: attempt.stateHash, browserHash: attempt.browserHash } });
      if (consumed.count !== 1) throw new Error("OAuth state already consumed.");
      returnTo = safeReturnTo(attempt.returnTo);
      if (req.query.error) {
        errorCode = req.query.error === "access_denied" ? "cancelled" : "failed";
        throw new Error("Google authorization not completed.");
      }
      if (typeof req.query.code !== "string" || !req.query.code || req.query.code.length > 4096) throw new Error("Missing authorization code.");
      const profile = await provider.verify(req.query.code, attempt.codeVerifier, attempt.nonce);
      const user = await findOrCreateGoogleUser(profile);
      await establishSession(req, res, user.id);
      res.clearCookie(OAUTH_COOKIE, cookieOptions());
      res.redirect(303, new URL(returnTo, frontendUrl()).href);
    } catch {
      // Never expose Google responses, authorization codes, or database errors to the client/logs.
      res.clearCookie(OAUTH_COOKIE, cookieOptions());
      const target = new URL(returnTo, frontendUrl());
      target.searchParams.set("auth_error", errorCode);
      res.redirect(303, target.href);
    }
  }));
  router.post("/logout", sameOrigin, route(async (req, res) => {
    const token = readToken(req, AUTH_COOKIE);
    const attempt = readToken(req, OAUTH_COOKIE);
    if (attempt) await database().oAuthAttempt.deleteMany({ where: { browserHash: hashToken(attempt) } });
    if (token) await database().authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
    res.clearCookie(AUTH_COOKIE, cookieOptions());
    res.clearCookie(OAUTH_COOKIE, cookieOptions());
    res.status(204).end();
  }));
  router.use((_error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(503).json({ error: "Sign-in is temporarily unavailable. Please try again shortly." });
  });
  return router;
}
