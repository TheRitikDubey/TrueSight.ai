import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import dotenv from "dotenv";
import { authRoutes } from "../src/auth/routes.js";
import { safeReturnTo, cookieOptions } from "../src/auth/config.js";
import { profileFromPayload, type GoogleProvider } from "../src/auth/google.js";
import { hashToken, requireAuth } from "../src/auth/session.js";
import { database } from "../src/chat/database.js";
import { findOrCreateGoogleUser } from "../src/users/service.js";
import { createGuestUsage } from "../../client/src/auth/guestUsage.ts";
import type { TokenPayload } from "google-auth-library";

test("OAuth identity requires a verified email and matching nonce", () => {
  const payload: TokenPayload & { nonce: string } = { iss: "https://accounts.google.com", aud: "test", sub: "google-user", iat: 1, exp: 2, email: " Person@Example.com ", email_verified: true, nonce: "nonce" };
  assert.equal(profileFromPayload(payload, "nonce").email, "person@example.com");
  assert.throws(() => profileFromPayload(payload, "other"));
  assert.throws(() => profileFromPayload({ ...payload, email_verified: false }, "nonce"));
  assert.throws(() => profileFromPayload({ ...payload, sub: "" }, "nonce"));
  assert.throws(() => profileFromPayload(undefined, "nonce"));
});
test("OAuth return location cannot leave the app or carry arbitrary parameters", () => {
  for (const path of ["//evil.test", "/\\evil.test", "https://evil.test", "/api/auth/logout", null]) assert.equal(safeReturnTo(path), "/");
  assert.equal(safeReturnTo("/?chat=abc123&redirect=https://evil.test"), "/?chat=abc123");
});
test("production auth cookies are secure and inaccessible to JavaScript", () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.deepEqual(cookieOptions(), { httpOnly: true, secure: true, sameSite: "lax", path: "/api" });
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
test("guest limit survives reloads, allows retries, and blocks the fourth new question", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const usage = createGuestUsage(() => storage, 3);
  for (const id of ["one", "two", "three"]) assert.equal(usage.claim(id), true);
  assert.equal(usage.claim("three"), true);
  assert.equal(usage.claim("four"), false);
  const reloaded = createGuestUsage(() => storage, 3);
  assert.equal(reloaded.count(), 3);
  assert.equal(reloaded.claim("four"), false);
  assert.equal(createGuestUsage(() => storage, 0).claim("new"), false);
});
test("guest limit retains an in-memory count when storage is unavailable", () => {
  const usage = createGuestUsage(() => { throw new Error("disabled"); }, 1);
  assert.equal(usage.claim("one"), true);
  assert.equal(usage.claim("two"), false);
  const writeBlocked = createGuestUsage(() => ({ getItem: () => null, setItem: () => { throw new Error("quota"); } }), 1);
  assert.equal(writeBlocked.claim("one"), true);
  assert.equal(writeBlocked.claim("two"), false);
});

test("auth PostgreSQL integration: OAuth binding, replay, unique users, sessions, logout and CSRF", { skip: process.env.RUN_AUTH_INTEGRATION !== "1" }, async t => {
  dotenv.config();
  const suffix = randomUUID();
  const profile = { email: `auth-test-${suffix}@example.com`, name: "Auth Test", googleId: suffix };
  let verifyCalls = 0;
  let rejectIdentity = false;
  const provider: GoogleProvider = {
    authorizationUrl(state, nonce, codeChallenge) {
      return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ state, nonce, code_challenge: codeChallenge })}`;
    },
    async verify(code, verifier, nonce) {
      verifyCalls++;
      assert.equal(code, "test-code");
      assert.match(verifier, /^[a-f0-9]{64}$/);
      assert.match(nonce, /^[a-f0-9]{64}$/);
      if (rejectIdentity) throw new Error("SECRET-provider-error");
      return profile;
    },
  };
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes(provider));
  app.get("/protected", requireAuth, (_req, res) => res.json(res.locals.user));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const states: string[] = [];
  t.after(async () => {
    server.closeAllConnections(); server.close();
    await database().oAuthAttempt.deleteMany({ where: { stateHash: { in: states.map(hashToken) } } });
    await database().user.deleteMany({ where: { email: profile.email } });
    await database().$disconnect();
  });
  const post = (path: string, body: unknown = {}, cookie = "", origin?: string) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", cookie, ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
  const get = (path: string, cookie = "") => fetch(base + path, { headers: { cookie }, redirect: "manual" });
  const cookieNamed = (res: Response, name: string) => res.headers.getSetCookie().find(value => value.startsWith(name + "="))!.split(";")[0];
  const begin = async (returnTo = "/?chat=abc") => {
    const res = await post("/api/auth/google", { returnTo });
    assert.equal(res.status, 200);
    const data = await res.json() as { authorizationUrl: string };
    const url = new URL(data.authorizationUrl);
    const state = url.searchParams.get("state")!;
    states.push(state);
    assert.equal(url.searchParams.get("code_challenge")!.length, 43);
    const cookie = cookieNamed(res, "truesight_oauth");
    assert.match(res.headers.get("set-cookie")!, /HttpOnly/);
    assert.match(res.headers.get("set-cookie")!, /SameSite=Lax/);
    return { state, cookie, path: `/api/auth/google/callback?code=test-code&state=${state}` };
  };
  assert.deepEqual(await (await get("/api/auth/session")).json(), { user: null });
  assert.equal((await get("/protected?email=" + profile.email)).status, 401);
  assert.equal((await post("/api/auth/google", {}, "", "https://evil.test")).status, 403);
  const first = await begin();
  assert.match((await get(first.path)).headers.get("location")!, /auth_error=failed/);
  assert.equal(verifyCalls, 0);
  const success = await get(first.path, first.cookie);
  assert.equal(success.status, 303);
  assert.equal(success.headers.get("location"), "http://localhost:5173/?chat=abc");
  const authCookie = cookieNamed(success, "truesight_auth");
  assert.match(success.headers.get("set-cookie")!, /HttpOnly/);
  const user = await (await get("/protected", authCookie)).json() as { id: string; email: string };
  assert.equal(user.email, profile.email);
  const stored = await database().authSession.findUnique({ where: { tokenHash: hashToken(authCookie.split("=")[1]) } });
  assert.equal(stored?.userId, user.id);
  assert.notEqual(stored?.tokenHash, authCookie.split("=")[1]);
  assert.match((await get(first.path, first.cookie)).headers.get("location")!, /auth_error=failed/);
  assert.equal(verifyCalls, 1);
  const results = await Promise.all(Array.from({ length: 5 }, () => findOrCreateGoogleUser({ ...profile, email: profile.email.toUpperCase() })));
  assert.ok(results.every(row => row.id === user.id));
  assert.equal(await database().user.count({ where: { email: profile.email } }), 1);
  await assert.rejects(() => findOrCreateGoogleUser({ ...profile, googleId: "different-user" }));
  const again = await begin();
  const againResponse = await get(again.path, `${again.cookie}; ${authCookie}`);
  const newCookie = cookieNamed(againResponse, "truesight_auth");
  assert.notEqual(newCookie, authCookie);
  assert.equal((await get("/protected", authCookie)).status, 401);
  assert.equal((await get("/protected", newCookie)).status, 200);
  const cancelled = await begin();
  assert.match((await get(`/api/auth/google/callback?error=access_denied&state=${cancelled.state}`, cancelled.cookie)).headers.get("location")!, /auth_error=cancelled/);
  const expired = await begin();
  await database().oAuthAttempt.update({ where: { stateHash: hashToken(expired.state) }, data: { expiresAt: new Date(0) } });
  assert.match((await get(expired.path, expired.cookie)).headers.get("location")!, /auth_error=failed/);
  rejectIdentity = true;
  const invalid = await begin("https://evil.test");
  const rejected = await get(invalid.path, invalid.cookie);
  assert.equal(rejected.headers.get("location"), "http://localhost:5173/?auth_error=failed");
  assert.ok(!rejected.headers.getSetCookie().some(cookie => cookie.startsWith("truesight_auth=")));
  assert.equal((await post("/api/auth/logout", {}, newCookie, "https://evil.test")).status, 403);
  assert.equal((await get("/protected", newCookie)).status, 200);
  assert.equal((await post("/api/auth/logout", {}, newCookie)).status, 204);
  assert.equal((await get("/protected", newCookie)).status, 401);
  assert.equal(await database().user.count({ where: { email: profile.email } }), 1);
  rejectIdentity = false;
  const expiry = await begin();
  const expiringCookie = cookieNamed(await get(expiry.path, expiry.cookie), "truesight_auth");
  await database().authSession.update({ where: { tokenHash: hashToken(expiringCookie.split("=")[1]) }, data: { expiresAt: new Date(0) } });
  assert.deepEqual(await (await get("/api/auth/session", expiringCookie)).json(), { user: null });
  assert.equal((await get("/protected", "truesight_auth=" + "a".repeat(64))).status, 401);
  const race = await begin();
  const before = verifyCalls;
  const callbacks = await Promise.all([get(race.path, race.cookie), get(race.path, race.cookie)]);
  assert.equal(verifyCalls, before + 1);
  assert.equal(callbacks.filter(response => response.headers.getSetCookie().some(cookie => cookie.startsWith("truesight_auth="))).length, 1);
});
