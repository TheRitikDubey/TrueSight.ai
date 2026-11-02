import { useCallback, useEffect, useRef, useState } from "react";
import { readCheckStream } from "../../checkStream";
import { chatRequest } from "./api";
import { useAuth } from "../../auth/context";
import type {
  ChatEvent,
  Conversation,
  ConversationDetail,
  Message,
} from "./types";

const selectedId = () =>
  new URLSearchParams(window.location.search).get("chat");
function setLocation(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("chat", id);
  else url.searchParams.delete("chat");
  window.history.replaceState(null, "", url);
}
export function useChat() {
  const { authorizeQuestion } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(selectedId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState<Message | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [progress, setProgress] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const busy = useRef(false);
  const listVersion = useRef(0);

  const upsert = useCallback((conversation: Conversation) => {
    listVersion.current++;
    setConversations((rows) =>
      [conversation, ...rows.filter((row) => row.id !== conversation.id)].sort(
        (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      ),
    );
  }, []);
  const refreshHistory = useCallback(async () => {
    const version = listVersion.current;
    try {
      const result = await chatRequest<{
        conversations: Conversation[];
        nextCursor: string | null;
      }>();
      if (version === listVersion.current) {
        setConversations(result.conversations);
        setNextCursor(result.nextCursor);
      }
      setHistoryError("");
      setReady(true);
    } catch (reason) {
      setHistoryError(
        reason instanceof Error ? reason.message : "Could not load history.",
      );
    }
  }, []);
  const open = useCallback(async (id: string | null) => {
    const version = ++epoch.current;
    controller.current?.abort();
    controller.current = null;
    busy.current = false;
    setActiveId(id);
    setLocation(id);
    setMessages([]);
    setStreaming(null);
    setError("");
    setIsGenerating(false);
    setLoading(Boolean(id));
    if (!id) return;
    const request = new AbortController();
    controller.current = request;
    try {
      const result = await chatRequest<ConversationDetail>(
        `/${encodeURIComponent(id)}`,
        { signal: request.signal },
      );
      if (version !== epoch.current) return;
      setMessages(result.messages);
      if (result.messages.at(-1)?.role === "USER")
        setError(
          result.generatingUntil &&
            Date.parse(result.generatingUntil) > Date.now()
            ? "This conversation has a reply in progress or recently interrupted. Retry after it finishes."
            : "The last reply wasn’t completed. Retry to continue this conversation.",
        );
    } catch (reason) {
      if (version === epoch.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not load conversation.",
        );
    } finally {
      if (version === epoch.current) {
        setLoading(false);
        controller.current = null;
      }
    }
  }, []);
  useEffect(() => {
    let mounted = true;
    // Defer until the StrictMode setup/cleanup probe finishes to avoid duplicate requests.
    void Promise.resolve().then(() => {
      if (mounted) {
        void refreshHistory();
        void open(selectedId());
      }
    });
    return () => {
      mounted = false;
      // These are request/version refs, not DOM refs: intentionally cancel the latest request.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      epoch.current++;
      controller.current?.abort();
    };
  }, [refreshHistory, open]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await chatRequest<{
        conversations: Conversation[];
        nextCursor: string | null;
      }>(`?cursor=${encodeURIComponent(nextCursor)}`);
      setConversations((rows) => [
        ...rows,
        ...result.conversations.filter(
          (row) => !rows.some((old) => old.id === row.id),
        ),
      ]);
      setNextCursor(result.nextCursor);
      setHistoryError("");
    } catch {
      setHistoryError("Could not load older conversations. Please retry.");
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);
  async function send(content: string, verifyWeb: boolean, retry?: Message, onStarted?: () => void) {
    if (busy.current || loading || !ready || !content.trim()) return;
    busy.current = true;
    const version = ++epoch.current;
    const user: Message = retry ?? {
      id: crypto.randomUUID(),
      role: "USER",
      content: content.trim(),
      verifyWeb,
      createdAt: new Date().toISOString(),
    };
    const allowed = await authorizeQuestion(user.id);
    if (version !== epoch.current) return;
    if (!allowed) { busy.current = false; return; }
    const request = new AbortController();
    controller.current = request;
    onStarted?.();
    if (!retry) setMessages((rows) => [...rows, user]);
    setError("");
    setProgress("");
    setIsGenerating(true);
    setStreaming({
      id: "streaming",
      role: "ASSISTANT",
      content: "",
      verifyWeb,
      createdAt: new Date().toISOString(),
    });
    let completed = false;
    try {
      let id = activeId;
      if (!id) {
        // Let creation finish even if navigation aborts generation, so retries keep the same ID.
        const conversation = await chatRequest<Conversation>("", {
          method: "POST",
          body: "{}",
        });
        if (version !== epoch.current) {
          await chatRequest(`/${conversation.id}`, { method: "DELETE" });
          return;
        }
        id = conversation.id;
        setActiveId(id);
        setLocation(id);
        upsert(conversation);
      }
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(id)}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/x-ndjson",
          },
          body: JSON.stringify({
            content: user.content,
            messageId: user.id,
            verifyWeb: user.verifyWeb,
          }),
          signal: request.signal,
        },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          data?.error || "Could not send your message. Please retry.",
        );
      }
      await readCheckStream(response, (raw) => {
        if (version !== epoch.current) return;
        const event = raw as ChatEvent;
        if (event.type === "error") throw new Error(event.error);
        if (event.type === "accepted") {
          upsert(event.conversation);
          setMessages((rows) =>
            rows.map((row) => (row.id === user.id ? event.message : row)),
          );
        }
        if (event.type === "progress") setProgress(event.message);
        if (event.type === "delta")
          setStreaming((row) =>
            row ? { ...row, content: row.content + event.text } : row,
          );
        if (event.type === "evidence")
          setStreaming((row) =>
            row ? { ...row, evidence: event.result } : row,
          );
        if (event.type === "done") {
          completed = true;
          upsert(event.conversation);
          setMessages((rows) => [
            ...rows.filter((row) => row.id !== event.message.id),
            event.message,
          ]);
          setStreaming(null);
        }
      });
      if (!completed)
        throw new Error(
          "The connection ended before the reply was saved. Retry to recover it.",
        );
    } catch (reason) {
      if (version === epoch.current && !completed)
        setError(
          request.signal.aborted
            ? "Generation stopped. Retry when you’re ready."
            : reason instanceof Error
              ? reason.message
              : "Something went wrong. Please retry.",
        );
    } finally {
      if (version === epoch.current) {
        busy.current = false;
        controller.current = null;
        setIsGenerating(false);
      }
    }
  }
  const remove = useCallback(
    async (id: string) => {
      try {
        await chatRequest(`/${encodeURIComponent(id)}`, { method: "DELETE" });
        listVersion.current++;
        setConversations((rows) => rows.filter((row) => row.id !== id));
        if (activeId === id) void open(null);
      } catch {
        setHistoryError("Could not delete this conversation. Please retry.");
      }
    },
    [activeId, open],
  );
  const pendingUser =
    messages.at(-1)?.role === "USER" ? messages.at(-1) : undefined;
  return {
    conversations,
    activeId,
    messages,
    streaming,
    isGenerating,
    loading,
    ready,
    error,
    historyError,
    progress,
    nextCursor,
    loadingMore,
    refreshHistory,
    loadMore,
    open,
    send,
    remove,
    pendingUser,
    stop: () => controller.current?.abort(),
  };
}
