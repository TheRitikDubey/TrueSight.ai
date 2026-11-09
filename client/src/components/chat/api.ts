import { API_URL } from "../../config";

export async function chatRequest<T>(
  path = "",
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_URL}/api/conversations${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      data?.error || "Could not connect to TrueSight. Please retry.",
    );
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
