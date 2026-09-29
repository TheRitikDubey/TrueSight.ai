import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

// A bearer token in an HttpOnly cookie; only its hash is stored in the database.
// Replace this owner resolution with your user ID when account authentication is added.
export function chatSession(req: Request, res: Response, next: NextFunction) {
  if (req.get("sec-fetch-site") === "cross-site") {
    res.status(403).json({ error: "Open chat from the TrueSight app." });
    return;
  }
  const cookie = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("truesight_session="))
    ?.slice(18);
  const token =
    cookie && /^[a-f0-9]{64}$/.test(cookie)
      ? cookie
      : randomBytes(32).toString("hex");
  res.cookie("truesight_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 24 * 60 * 60 * 1000,
    path: "/api",
  });
  res.locals.ownerId = createHash("sha256").update(token).digest("hex");
  res.set("Cache-Control", "no-store");
  next();
}
