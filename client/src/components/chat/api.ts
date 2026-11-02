export async function chatRequest<T>(
  path = "",
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/conversations${path}`, {
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
