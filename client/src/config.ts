// Backend origin. Empty = same origin (Vite proxies /api in development).
export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
