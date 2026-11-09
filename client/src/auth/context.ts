import { create } from "zustand";
import { authApi } from "./authApi";
import { readCallbackError } from "./authCallback";
import { guestUsage } from "./guestUsage";
import { API_URL } from "../config";

export interface User { id: string; email: string; name: string; avatar: string | null }
export type Prompt = "signin" | "limit" | null;
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isProcessing: boolean;
  error: string;
  sessionError: string;
  prompt: Prompt;
  guestCount: number;
  openLogin: () => void;
  closeLogin: () => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<User | null>;
  authorizeQuestion: (messageId: string) => Promise<boolean>;
}

let sessionRequest: Promise<User | null> | null = null;
const initialError = readCallbackError();

export const useAuth = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isProcessing: false,
  error: initialError,
  sessionError: "",
  prompt: initialError ? "signin" : null,
  guestCount: guestUsage.count(),
  refresh: () => {
    // Coalesce StrictMode, focus, and send checks to prevent stale responses racing.
    sessionRequest ??= authApi.session().then(user => {
      set({ user, isAuthenticated: Boolean(user), sessionError: "", ...(user && { prompt: null }) });
      return user;
    }).catch(() => {
      set({ sessionError: "Could not check your sign-in status. Retry to reconnect." });
      throw new Error("Session check failed.");
    }).finally(() => { set({ isLoading: false }); sessionRequest = null; });
    return sessionRequest;
  },
  openLogin: () => set({ error: "", prompt: "signin" }),
  closeLogin: () => { if (!get().isProcessing) set({ prompt: null, error: "" }); },
  login: async () => {
    if (get().isProcessing) return;
    set({ isProcessing: true, error: "" });
    try {
      window.location.assign(await authApi.googleAuthorizationUrl(API_URL + '/api/auth'));
    } catch {
      set({ error: "Google sign-in is unavailable right now. Please try again shortly.", isProcessing: false });
    }
  },
  logout: async () => {
    if (get().isProcessing) return;
    set({ isProcessing: true, error: "" });
    try {
      await sessionRequest?.catch(() => {});
      await authApi.logout();
      set({ user: null, isAuthenticated: false, sessionError: "", guestCount: guestUsage.count() });
    } catch { set({ error: "Could not sign out. Please try again." }); }
    finally { set({ isProcessing: false }); }
  },
  authorizeQuestion: async (messageId) => {
    if (get().isLoading || get().isProcessing) return false;
    let current: User | null;
    try { current = await get().refresh(); } catch { return false; }
    if (current) return true;
    if (!guestUsage.claim(messageId)) { set({ error: "", prompt: "limit" }); return false; }
    set({ guestCount: guestUsage.count() });
    return true;
  },
}));
