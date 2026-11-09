const PARAM = "auth_error";

export function readCallbackError() {
  const code = new URLSearchParams(window.location.search).get(PARAM);
  return !code ? "" : code === "cancelled" ? "Sign-in was cancelled. You can try again whenever you’re ready." : "We couldn’t complete sign-in. Please try again.";
}

export function clearCallbackError() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(PARAM)) return;
  url.searchParams.delete(PARAM);
  window.history.replaceState(null, "", url);
}
