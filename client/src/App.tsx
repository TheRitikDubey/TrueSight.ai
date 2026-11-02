import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, Menu, RotateCcw } from "lucide-react";
import { ChatSidebar } from "./components/chat/ChatSidebar";
import { ChatMessage, ChatLoader } from "./components/chat/ChatMessage";
import { ChatInput } from "./components/chat/ChatInput";
import { ChatEmptyState } from "./components/chat/ChatEmptyState";
import { useChat } from "./components/chat/useChat";
import { useAuth } from "./auth/context";
import { AuthControls } from "./auth/AuthControls";
import { AuthBottomSheet } from "./auth/AuthBottomSheet";
import { FREE_GUEST_QUESTIONS } from "./auth/guestUsage";
import "./App.css";

export default function App() {
  const chat = useChat();
  const auth = useAuth();
  const guestRemaining = Math.max(0, FREE_GUEST_QUESTIONS - auth.guestCount);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState(() => {
    try { return sessionStorage.getItem("truesight:draft") || ""; } catch { return ""; }
  });
  useEffect(() => {
    try {
      if (input) sessionStorage.setItem("truesight:draft", input);
      else sessionStorage.removeItem("truesight:draft");
    } catch { /* Draft persistence is optional when browser storage is disabled. */ }
  }, [input]);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const scrollArea = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openChat = chat.open;
  const select = useCallback(
    (id: string | null) => {
      setSidebarOpen(false);
      setInput("");
      follow.current = true;
      setAwayFromBottom(false);
      void openChat(id);
    },
    [openChat],
  );
  useEffect(() => {
    if (follow.current && scrollArea.current)
      scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
  }, [chat.messages, chat.streaming, chat.progress, chat.error, chat.loading]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setSidebarOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const title =
    chat.conversations.find((row) => row.id === chat.activeId)?.title ||
    "New conversation";
  return (
    <div className="chat-app">
      <ChatSidebar
        conversations={chat.conversations}
        activeId={chat.activeId}
        open={sidebarOpen}
        ready={chat.ready}
        error={chat.historyError}
        nextCursor={chat.nextCursor}
        loadingMore={chat.loadingMore}
        onMore={chat.loadMore}
        onClose={closeSidebar}
        onSelect={select}
        onDelete={chat.remove}
        onRetry={chat.refreshHistory}
      />
      <main className="chat-main" inert={sidebarOpen}>
        <header className="chat-header">
          <button
            className="icon-button mobile-only"
            aria-label="Open chat history"
            aria-expanded={sidebarOpen}
            aria-controls="chat-sidebar"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="conversation-heading">
            <span>{title}</span>
            <small>Room for a clearer perspective</small>
          </div>
          <div className="header-account"><span className="header-badge">Local AI</span><AuthControls /></div>
        </header>
        <div
          className="conversation-scroll"
          ref={scrollArea}
          onScroll={() => {
            const area = scrollArea.current;
            if (area) {
              follow.current =
                area.scrollHeight - area.scrollTop - area.clientHeight < 100;
              setAwayFromBottom(!follow.current);
            }
          }}
        >
          {chat.loading ? (
            <div className="conversation-loading">
              <ChatLoader progress="Loading your conversation…" />
            </div>
          ) : !chat.messages.length && !chat.error ? (
            <ChatEmptyState
              onSelect={(prompt) => {
                setInput(prompt);
                inputRef.current?.focus();
              }}
            />
          ) : (
            <div className="message-list">
              {chat.messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              {chat.streaming && (
                <ChatMessage
                  message={chat.streaming}
                  generating={chat.isGenerating}
                  progress={chat.progress}
                  incomplete={!chat.isGenerating}
                />
              )}
              {chat.error && (
                <div className="chat-error" role="alert">
                  <p>{chat.error}</p>
                  {chat.pendingUser ? (
                    <button
                      className="text-button"
                      disabled={chat.isGenerating}
                      onClick={() => {
                        follow.current = true;
                        void chat.send(
                          chat.pendingUser!.content,
                          chat.pendingUser!.verifyWeb,
                          chat.pendingUser,
                        );
                      }}
                    >
                      <RotateCcw size={14} />
                      Retry response
                    </button>
                  ) : (
                    <button
                      className="text-button"
                      onClick={() => void chat.open(chat.activeId)}
                    >
                      Reload conversation
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="composer-dock">
          {(auth.sessionError || (auth.error && !auth.prompt)) && (
            <div className="chat-error" role="alert">
              <p>{auth.sessionError || auth.error}</p>
              {auth.sessionError && <button className="text-button" onClick={() => void auth.refresh().catch(() => {})}>Retry connection</button>}
            </div>
          )}
          {!auth.isLoading && !auth.isAuthenticated && !auth.sessionError && (
            <p className="guest-remaining">{guestRemaining} free question{guestRemaining === 1 ? "" : "s"} remaining <span>·</span> <button onClick={auth.openLogin}>Sign in to keep exploring</button></p>
          )}
          {awayFromBottom && (
            <button
              className="jump-bottom icon-button"
              aria-label="Scroll to latest message"
              onClick={() => {
                follow.current = true;
                setAwayFromBottom(false);
                scrollArea.current?.scrollTo({
                  top: scrollArea.current.scrollHeight,
                  behavior: "smooth",
                });
              }}
            >
              <ArrowDown size={18} />
            </button>
          )}
          {!chat.ready && chat.historyError && (
            <div className="chat-error" role="alert">
              <p>{chat.historyError}</p>
              <button className="text-button" onClick={chat.refreshHistory}>
                Reconnect
              </button>
            </div>
          )}
          <ChatInput
            disabled={
              auth.isLoading || auth.isProcessing || Boolean(auth.sessionError) ||
              chat.loading ||
              !chat.ready ||
              Boolean(chat.pendingUser && !chat.isGenerating) ||
              Boolean(chat.error && !chat.messages.length)
            }
            generating={chat.isGenerating}
            input={input}
            onInput={setInput}
            inputRef={inputRef}
            onSend={(content, verify) => {
              follow.current = true;
              void chat.send(content, verify, undefined, () => setInput(""));
            }}
            onStop={chat.stop}
          />
        </div>
        <span className="sr-only" role="status">
          {chat.isGenerating
            ? "TrueSight is generating a response."
            : chat.messages.at(-1)?.role === "ASSISTANT"
              ? "Response complete."
              : ""}
        </span>
      </main>
      <AuthBottomSheet />
    </div>
  );
}
