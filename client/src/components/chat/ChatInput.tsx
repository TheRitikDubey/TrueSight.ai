import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowUp, Globe2, Square } from "lucide-react";

interface Props {
  disabled: boolean;
  generating: boolean;
  onSend: (content: string, verifyWeb: boolean) => void;
  onStop: () => void;
  input: string;
  onInput: (value: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}
export function ChatInput(props: Props) {
  const { input, onInput: setInput, inputRef: textarea } = props;
  const [verifyWeb, setVerifyWeb] = useState(false);
  const wasGenerating = useRef(false);
  useEffect(() => {
    // A forwarded DOM ref is intentionally resized to fit the draft.
    if (textarea.current) {
      textarea.current.style.setProperty("height", "auto");
      textarea.current.style.setProperty(
        "height",
        `${Math.min(textarea.current.scrollHeight, 180)}px`,
      );
    }
  }, [input, textarea]);
  useEffect(() => {
    if (wasGenerating.current && !props.generating) textarea.current?.focus();
    wasGenerating.current = props.generating;
  }, [props.generating, textarea]);
  function submit() {
    if (!input.trim() || props.disabled || props.generating) return;
    props.onSend(input, verifyWeb);
  }
  return (
    <div className="composer-area">
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={textarea}
          aria-label="Message TrueSight"
          rows={1}
          maxLength={10000}
          value={input}
          disabled={props.disabled}
          placeholder="Ask TrueSight anything…"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer-actions">
          <button
            type="button"
            className={`web-toggle ${verifyWeb ? "enabled" : ""}`}
            aria-pressed={verifyWeb}
            title="Verify this message using web search and show the evidence"
            disabled={props.generating}
            onClick={() => setVerifyWeb((value) => !value)}
          >
            <Globe2 size={15} /> Verify with web
          </button>
          <span className="keyboard-hint">Shift + Enter for a new line</span>
          {props.generating ? (
            <button
              type="button"
              className="send-button"
              aria-label="Stop generating"
              onClick={props.onStop}
            >
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              className="send-button"
              aria-label="Send message"
              disabled={props.disabled || !input.trim()}
            >
              <ArrowUp size={20} />
            </button>
          )}
        </div>
      </form>
      <p className="composer-note">
        A clearer view starts with a good question. Always check important
        details.
      </p>
    </div>
  );
}
