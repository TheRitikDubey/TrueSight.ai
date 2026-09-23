// Fetch chunks can split anywhere, including inside a JSON line or a UTF-8 character.
export async function readCheckStream(response: Response, onEvent: (event: unknown) => void): Promise<void> {
  if (!response.body) throw new Error("Streaming is unavailable in this browser.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) onEvent(JSON.parse(line));
      if (done) {
        if (pending.trim()) onEvent(JSON.parse(pending));
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
