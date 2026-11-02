import { LogOut } from "lucide-react";
import { useAuth } from "./context";

export function AuthControls() {
  const auth = useAuth();
  if (auth.isLoading) return <span className="auth-loading" role="status">Checking session…</span>;
  if (auth.sessionError) return <button className="auth-signin" onClick={() => void auth.refresh().catch(() => {})}>Retry connection</button>;
  if (!auth.user) return <button className="auth-signin" onClick={auth.openLogin}>Sign in</button>;
  return <div className="auth-account">
    <span className="auth-avatar" title={auth.user.email}>{auth.user.avatar ? <img src={auth.user.avatar} alt="" referrerPolicy="no-referrer" /> : auth.user.name.slice(0, 1).toUpperCase()}</span>
    <span className="auth-name">{auth.user.name}</span>
    <button className="icon-button" title="Sign out" aria-label="Sign out" disabled={auth.isProcessing} onClick={() => void auth.logout()}><LogOut size={17} /></button>
  </div>;
}
