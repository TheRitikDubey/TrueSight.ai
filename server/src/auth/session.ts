import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { database } from "../chat/database.js";
import { publicUser } from "../users/service.js";
import { AUTH_COOKIE, SESSION_MS, cookieOptions, frontendUrl } from "./config.js";

export const randomToken = () => randomBytes(32).toString("hex");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function readToken(req: Request, name: string) {
  const value = req.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}
export async function resolveUser(req: Request, res: Response) {
  const token = readToken(req, AUTH_COOKIE);
  if (!token) return null;
  const session = await database().authSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: publicUser } } });
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    res.clearCookie(AUTH_COOKIE, cookieOptions());
    return null;
  }
  return session.user;
}
export async function establishSession(req: Request, res: Response, userId: string) {
  const token = randomToken();
  const previous = readToken(req, AUTH_COOKIE);
  await database().$transaction(async tx => {
    await tx.authSession.deleteMany({ where: { OR: [
      { expiresAt: { lte: new Date() } },
      ...(previous ? [{ tokenHash: hashToken(previous) }] : []),
    ] } });
    await tx.authSession.create({ data: { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_MS) } });
  });
  res.cookie(AUTH_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_MS });
}
// Available to future account APIs. Never derive identity from request body/query.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  void resolveUser(req, res).then(user => {
    if (!user) { res.status(401).json({ error: "Sign in to continue." }); return; }
    res.locals.user = user;
    next();
  }).catch(() => res.status(503).json({ error: "Could not verify your session. Please retry." }));
}
export function sameOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.get("origin");
  if (req.get("sec-fetch-site") === "cross-site" || (origin && origin !== frontendUrl())) {
    res.status(403).json({ error: "Open sign-in from the TrueSight app." });
    return;
  }
  next();
}
