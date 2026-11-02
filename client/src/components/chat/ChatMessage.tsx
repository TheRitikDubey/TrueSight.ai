import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Brand } from "./Brand";
import { ResultCard } from "./Evidence";
import type { Message } from "./types";

export function ChatLoader({ progress }: { progress?: string }) {
  return (
    <div className="thinking" role="status">
      <span className="thinking-line">
        TrueSight is thinking{" "}
        <span className="thinking-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </span>
      {progress && <span className="thinking-progress">{progress}</span>}
    </div>
  );
}
export const ChatMessage = memo(function ChatMessage({
  message,
  generating = false,
  progress,
  incomplete = false,
}: {
  message: Message;
  generating?: boolean;
  progress?: string;
  incomplete?: boolean;
}) {
  if (message.role === "SYSTEM") return null;
  const assistant = message.role === "ASSISTANT";
  return (
    <article
      className={`chat-message ${assistant ? "assistant-message" : "user-message"}`}
      aria-label={assistant ? "TrueSight response" : "Your message"}
    >
      {assistant && (
        <div className="message-avatar">
          <Brand compact />
        </div>
      )}
      <div className="message-body">
        <div className="message-author">
          {assistant ? (
            <>
              TrueSight <span>AI</span>
            </>
          ) : (
            "You"
          )}
        </div>
        {assistant ? (
          message.content ? (
            <div className={`markdown ${generating ? "streaming-text" : ""}`}>
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ children, ...props }) => (
                    <a {...props} target="_blank" rel="noreferrer">
                      {children}
                    </a>
                  ),
                }}
              >
                {message.content}
              </Markdown>
            </div>
          ) : generating ? (
            <ChatLoader progress={progress} />
          ) : null
        ) : (
          <p className="user-content">{message.content}</p>
        )}
        {message.evidence && (
          <details className="evidence-panel">
            <summary>
              Web evidence · {message.evidence.claims.length} claims ·{" "}
              {message.evidence.overallVerdict.toLowerCase()}
            </summary>
            <ResultCard result={message.evidence} />
          </details>
        )}
        {incomplete && message.content && (
          <p className="incomplete-label">Incomplete reply · not saved</p>
        )}
      </div>
    </article>
  );
});
