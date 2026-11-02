import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X, LoaderCircle } from "lucide-react";
import { Brand } from "../components/chat/Brand";
import { useAuth } from "./context";

function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.24-2.51c-.9.6-2.06.96-3.38.96-2.61 0-4.83-1.77-5.62-4.15H3.04v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.38 13.88a6 6 0 0 1 0-3.76V7.53H3.04a10 10 0 0 0 0 8.94l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.97c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.96 5.53l3.34 2.59C7.17 7.74 9.39 5.97 12 5.97Z"/></svg>;
}
export function AuthBottomSheet() {
  const auth = useAuth();
  const { closeLogin } = auth;
  const reduceMotion = useReducedMotion();
  const dialog = useRef<HTMLElement>(null);
  const isOpen = Boolean(auth.prompt);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = document.getElementById("root");
    const wasInert = root?.inert ?? false;
    const overflow = document.body.style.overflow;
    if (root) root.inert = true;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLogin();
      if (event.key !== "Tab") return;
      const elements = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      const first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); dialog.current?.focus(); return; }
      if (!dialog.current?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      if (root) root.inert = wasInert;
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [isOpen, closeLogin]);
  return createPortal(<AnimatePresence>{isOpen && (
    <motion.div className="auth-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.18 }}>
      <div className="auth-backdrop" onClick={closeLogin} />
      <motion.section ref={dialog} className="auth-sheet" role="dialog" aria-modal="true" aria-labelledby="auth-title" aria-describedby="auth-description" tabIndex={-1}
        initial={{ y: reduceMotion ? 0 : "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: reduceMotion ? 0 : "100%", opacity: 0 }} transition={reduceMotion ? { duration: 0 } : { type: "spring", damping: 30, stiffness: 300 }}>
        <div className="auth-sheet-handle" />
        <button className="icon-button auth-close" aria-label="Close sign-in" onClick={closeLogin} disabled={auth.isProcessing}><X size={20} /></button>
        <Brand />
        <span className="auth-eyebrow">A LITTLE MORE CLARITY</span>
        <h1 id="auth-title">{auth.prompt === "limit" ? "Continue your conversation" : "Welcome to your next perspective"}</h1>
        <p id="auth-description">{auth.prompt === "limit" ? "You’ve used your free questions. Sign in to keep asking, exploring, and finding a clearer view." : "Bring your curiosity. Sign in with Google to keep the conversation going."}</p>
        <button className="google-login" disabled={auth.isProcessing} onClick={() => void auth.login()}>
          {auth.isProcessing ? <LoaderCircle size={20} className="auth-spinner" /> : <GoogleMark />}
          {auth.isProcessing ? "Authenticating…" : "Continue with Google"}
        </button>
        {auth.error && <p className="auth-error" role="alert">{auth.error}</p>}
        <p className="auth-footnote">New here or returning? One Google account is all you need.</p>
        <button className="text-button auth-later" onClick={closeLogin} disabled={auth.isProcessing}>Maybe later</button>
      </motion.section>
    </motion.div>
  )}</AnimatePresence>, document.body);
}
