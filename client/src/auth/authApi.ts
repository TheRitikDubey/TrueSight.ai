import { API_URL } from "../config";
import type { User } from "./context";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}/api/auth${path}`, { ...init, credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json", ...init?.headers }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Authentication is unavailable. Please try again.");
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const authApi = {
  session: () => request<{ user: User | null }>("/session").then(data => data.user),
  // returnTo is a frontend path; the backend validates it before redirecting back.
  googleAuthorizationUrl: (returnTo: string) =>
    request<{ authorizationUrl: string }>("/google", { method: "POST", body: JSON.stringify({ returnTo }) }).then(data => data.authorizationUrl),
  logout: () => request<void>("/logout", { method: "POST", body: "{}" }),
};
