import { createContext, useContext } from "react";

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
export const AuthContext = createContext<AuthState | null>(null);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth requires AuthProvider");
  return value;
}
