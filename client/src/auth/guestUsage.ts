const configuredLimit = Number(import.meta.env?.VITE_FREE_GUEST_QUESTIONS ?? 3);
export const FREE_GUEST_QUESTIONS = Number.isSafeInteger(configuredLimit) && configuredLimit >= 0 ? configuredLimit : 3;
export const GUEST_STORAGE_KEY = "truesight:guest-questions:v1";
type StorageAccess = Pick<Storage, "getItem" | "setItem">;

export function createGuestUsage(storage: () => StorageAccess, limit = FREE_GUEST_QUESTIONS) {
  let memory: string[] = [];
  let unavailable = false;
  function read() {
    if (unavailable) return memory;
    try {
      const parsed: unknown = JSON.parse(storage().getItem(GUEST_STORAGE_KEY) || "[]");
      if (Array.isArray(parsed) && parsed.every(id => typeof id === "string")) memory = [...new Set(parsed)];
    } catch { unavailable = true; }
    return memory;
  }
  return {
    count: () => read().length,
    claim(messageId: string) {
      const ids = read();
      if (ids.includes(messageId)) return true;
      if (ids.length >= limit) return false;
      memory = [...ids, messageId];
      try { storage().setItem(GUEST_STORAGE_KEY, JSON.stringify(memory)); } catch { unavailable = true; }
      return true;
    },
  };
}
export const guestUsage = createGuestUsage(() => window.localStorage);
