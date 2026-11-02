export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const ATTEMPT_MS = 10 * 60 * 1000;
export const AUTH_COOKIE = "truesight_auth";
export const OAUTH_COOKIE = "truesight_oauth";

export function frontendUrl() {
  const url = new URL(process.env.FRONTEND_URL || "http://localhost:5173");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      !["http:", "https:"].includes(url.protocol) ||
      (process.env.NODE_ENV === "production" && url.protocol !== "https:")) {
    throw new Error("FRONTEND_URL must be an origin, with HTTPS in production.");
  }
  return url.origin;
}

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_CALLBACK_URL?.trim() || `${frontendUrl()}/api/auth/google/callback`;
  // Frontend and /api are served together, including through Vite in development.
  if (!clientId || !clientSecret || redirectUri !== `${frontendUrl()}/api/auth/google/callback`) {
    throw new Error("Google sign-in configuration is incomplete.");
  }
  return { clientId, clientSecret, redirectUri };
}

export function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api" };
}

export function safeReturnTo(value: unknown) {
  // The app has one page; preserve only the existing conversation selector.
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  const url = new URL(value, frontendUrl());
  if (url.origin !== frontendUrl() || url.pathname !== "/") return "/";
  const chat = url.searchParams.get("chat");
  return chat && /^[a-zA-Z0-9_-]{1,100}$/.test(chat) ? `/?chat=${encodeURIComponent(chat)}` : "/";
}
