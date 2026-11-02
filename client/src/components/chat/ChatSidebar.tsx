import { memo, useEffect, useRef, useState } from "react";
import { ArrowUpRight, MessageSquare, Plus, Trash2, X } from "lucide-react";
import { Brand } from "./Brand";
import type { Conversation } from "./types";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  ready: boolean;
  error: string;
  nextCursor: string | null;
  loadingMore: boolean;
  onClose: () => void;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onRetry: () => void;
  onMore: () => void;
}
export const ChatSidebar = memo(function ChatSidebar(props: Props) {
  const { open, onClose } = props;
  const [deleting, setDeleting] = useState<string | null>(null);
  const container = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    container.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        container.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href]",
        ) ?? [],
      ).filter((element) => element.offsetParent !== null);
      const first = buttons[0],
        last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, [open, onClose]);
  return (
    <>
      {props.open && (
        <button
          className="sidebar-backdrop"
          aria-label="Close chat history"
          onClick={props.onClose}
        />
      )}
      <aside
        ref={container}
        id="chat-sidebar"
        className={`chat-sidebar ${props.open ? "sidebar-open" : ""}`}
        aria-label="Chat history"
      >
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-only"
            aria-label="Close chat history"
            onClick={props.onClose}
          >
            <X size={18} />
          </button>
        </div>
        <button className="new-chat" onClick={() => props.onSelect(null)}>
          <Plus size={18} /> New chat <span>↗</span>
        </button>
        <div className="history-heading">
          YOUR CONVERSATIONS <span>{props.conversations.length || ""}</span>
        </div>
        <nav className="history-list" aria-label="Conversations">
          {!props.ready && !props.error && (
            <p className="sidebar-hint">Loading conversations…</p>
          )}
          {props.ready && !props.conversations.length && (
            <p className="sidebar-hint">
              A little curiosity goes a long way.
              <br />
              Your conversations will live here.
            </p>
          )}
          {props.conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`history-row ${props.activeId === conversation.id ? "active" : ""}`}
            >
              <button
                className="history-select"
                title={conversation.title}
                aria-current={
                  props.activeId === conversation.id ? "page" : undefined
                }
                onClick={() => props.onSelect(conversation.id)}
              >
                <MessageSquare size={15} />
                <span>{conversation.title}</span>
              </button>
              <button
                className="icon-button delete-chat"
                aria-label={`Delete ${conversation.title}`}
                onClick={() => setDeleting(conversation.id)}
              >
                <Trash2 size={14} />
              </button>
              {deleting === conversation.id && (
                <div className="delete-confirm">
                  <span>Delete this chat?</span>
                  <button
                    onClick={() => {
                      props.onDelete(conversation.id);
                      setDeleting(null);
                    }}
                  >
                    Delete
                  </button>
                  <button
                    aria-label="Keep conversation"
                    onClick={() => setDeleting(null)}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {props.nextCursor && (
            <button
              className="text-button load-more"
              disabled={props.loadingMore}
              onClick={props.onMore}
            >
              {props.loadingMore ? "Loading…" : "Load older conversations"}
            </button>
          )}
          {props.error && (
            <div className="sidebar-error" role="alert">
              {props.error}
              <button className="text-button" onClick={props.onRetry}>
                Retry history
              </button>
            </div>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="workspace-avatar">T</div>
          <div>
            <strong>Your workspace</strong>
            <span>Personal · This browser</span>
          </div>
          <ArrowUpRight size={16} />
        </div>
      </aside>
    </>
  );
});
