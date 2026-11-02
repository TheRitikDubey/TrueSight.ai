import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { guestUsage } from "./guestUsage";

import { AuthContext, type User, type Prompt } from "./context";

function callbackError() {
  const code = new URLSearchParams(window.location.search).get("auth_error");
  return !code ? "" : code === "cancelled" ? "Sign-in was cancelled. You can try again whenever you’re ready." : "We couldn’t complete sign-in. Please try again.";
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/auth${path}`, { ...init, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", ...init?.headers }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Authentication is unavailable. Please try again.");
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [isProcessing, setProcessing] = useState(false);
  const [error, setError] = useState(callbackError);
  const [sessionError, setSessionError] = useState("");
  const [prompt, setPrompt] = useState<Prompt>(() => callbackError() ? "signin" : null);
  const [guestCount, setGuestCount] = useState(() => guestUsage.count());
  const processing = useRef(false);
  const sessionRequest = useRef<Promise<User | null> | null>(null);
  const refresh = useCallback(() => {
    // Coalesce StrictMode, focus, and send checks to prevent stale responses racing.
    if (!sessionRequest.current) {
      sessionRequest.current = request<{ user: User | null }>("/session").then(data => {
        setUser(data.user);
        setSessionError("");
        if (data.user) setPrompt(null);
        return data.user;
      }).catch(() => {
        setSessionError("Could not check your sign-in status. Retry to reconnect.");
        throw new Error("Session check failed.");
      }).finally(() => { setLoading(false); sessionRequest.current = null; });
    }
    return sessionRequest.current;
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    const authError = url.searchParams.get("auth_error");
    if (authError) {
      url.searchParams.delete("auth_error");
      window.history.replaceState(null, "", url);
    }
    void refresh().catch(() => {});
    const recheck = () => {
      // Returning with browser Back must not leave the Google button stuck.
      if (document.visibilityState === "visible" && !processing.current) void refresh().catch(() => {});
    };
    const onPageShow = () => { processing.current = false; setProcessing(false); recheck(); };
    const onStorage = () => setGuestCount(guestUsage.count());
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);
  const openLogin = useCallback(() => { setError(""); setPrompt("signin"); }, []);
  const closeLogin = useCallback(() => { if (!processing.current) { setPrompt(null); setError(""); } }, []);
  async function login() {
    if (processing.current) return;
    processing.current = true;
    setProcessing(true);
    setError("");
    try {
      const data = await request<{ authorizationUrl: string }>("/google", { method: "POST", body: JSON.stringify({ returnTo: window.location.pathname + window.location.search }) });
      window.location.assign(data.authorizationUrl);
    } catch {
      setError("Google sign-in is unavailable right now. Please try again shortly.");
      processing.current = false;
      setProcessing(false);
    }
  }
  async function logout() {
    if (processing.current) return;
    processing.current = true;
    setProcessing(true);
    setError("");
    try {
      await sessionRequest.current?.catch(() => {});
      await request<void>("/logout", { method: "POST", body: "{}" });
      setUser(null);
      setSessionError("");
      setGuestCount(guestUsage.count());
    } catch { setError("Could not sign out. Please try again."); }
    finally { processing.current = false; setProcessing(false); }
  }
  async function authorizeQuestion(messageId: string) {
    if (isLoading || processing.current) return false;
    let current: User | null;
    try { current = await refresh(); } catch { return false; }
    if (current) return true;
    if (!guestUsage.claim(messageId)) {
      setError(""); setPrompt("limit"); return false;
    }
    setGuestCount(guestUsage.count());
    return true;
  }
  return <AuthContext.Provider value={{ user, isAuthenticated: Boolean(user), isLoading, isProcessing, error, sessionError, prompt, guestCount, openLogin, closeLogin, login, logout, refresh, authorizeQuestion }}>{children}</AuthContext.Provider>;
}
