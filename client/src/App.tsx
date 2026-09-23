import { useEffect, useRef, useState } from "react";
import { readCheckStream } from "./checkStream";

interface SearchActivity {
  query: string;
  status: "completed" | "failed";
  results: { title: string; url: string; content: string }[];
  durationMs: number;
  error?: string;
}

interface ProgressEvent {
  type: "progress";
  message: string;
  elapsedMs: number;
  search?: SearchActivity;
}

interface ClaimVerdict {
  id: number;
  claim: string;
  verdict: "TRUE" | "FALSE" | "UNVERIFIED" | "MISLEADING";
  confidence: number;
  evidence: string;
  sources: string[];
}

interface FactCheckResult {
  title: string;
  source: string;
  claims: ClaimVerdict[];
  overallVerdict: string;
  overallConfidence: number;
  summary: string;
  webSearch: { status: string; reason: string; searches: SearchActivity[] };
  warnings: string[];
  timings: { totalMs: number; planningMs: number; searchMs: number; verificationMs: number };
}

function SearchResults({ searches }: { searches: SearchActivity[] }) {
  return <div className="space-y-3 text-left">
    {searches.map((search, index) => <div key={index} className="text-sm space-y-1">
      <p className="text-zinc-300 break-words">🔎 {search.query} <span className="text-zinc-500">· {(search.durationMs / 1000).toFixed(1)}s</span></p>
      {search.error && <p className="text-amber-400">{search.error}</p>}
      {search.status === "completed" && !search.results.length && <p className="text-zinc-500">No relevant sources found.</p>}
      {search.results.map((source, i) => <a key={i} href={source.url} target="_blank" rel="noreferrer" className="block text-blue-400 hover:underline break-words">
        {source.title || new URL(source.url).hostname}
      </a>)}
    </div>)}
  </div>;
}

const verdictColor: Record<string, string> = {
  TRUE: "bg-green-500/20 text-green-400 border-green-500/40",
  "LIKELY TRUE": "bg-green-500/20 text-green-400 border-green-500/40",
  FALSE: "bg-red-500/20 text-red-400 border-red-500/40",
  "LIKELY FALSE": "bg-red-500/20 text-red-400 border-red-500/40",
  MISLEADING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  MIXED: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  UNVERIFIED: "bg-zinc-500/20 text-zinc-400 border-zinc-500/40",
};

const verdictEmoji: Record<string, string> = {
  TRUE: "✅",
  "LIKELY TRUE": "✅",
  FALSE: "❌",
  "LIKELY FALSE": "❌",
  MISLEADING: "⚠️",
  MIXED: "⚠️",
  UNVERIFIED: "❓",
};

function ResultCard({ result }: { result: FactCheckResult }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-white font-semibold text-lg leading-tight">
            {result.title}
          </h3>
          <p className="text-zinc-500 text-sm mt-1">Source: {result.source}</p>
        </div>
        <span
          className={`shrink-0 px-3 py-1.5 rounded-lg border text-sm font-bold ${verdictColor[result.overallVerdict] || verdictColor.UNVERIFIED}`}
        >
          {verdictEmoji[result.overallVerdict] || "❓"} {result.overallVerdict}
          <span className="ml-1 font-normal opacity-70">
            {result.overallConfidence}%
          </span>
        </span>
      </div>

      <p className="text-zinc-300 text-sm leading-relaxed">{result.summary}</p>

      {result.warnings.map((warning, i) => <p key={i} className="text-amber-400 text-sm" role="alert">{warning}</p>)}
      <details className="border border-zinc-800 rounded-lg p-3" open={result.webSearch.status === "failed" || result.webSearch.status === "partial"}>
        <summary className="cursor-pointer text-sm text-zinc-300">Web search: {result.webSearch.status} · {result.webSearch.searches.length} queries · {(result.timings.totalMs / 1000).toFixed(1)}s total</summary>
        <p className="text-zinc-500 text-xs my-2">{result.webSearch.reason}</p>
        <SearchResults searches={result.webSearch.searches} />
        <p className="text-zinc-500 text-xs mt-3">Planning {(result.timings.planningMs / 1000).toFixed(1)}s · Search {(result.timings.searchMs / 1000).toFixed(1)}s · Verification {(result.timings.verificationMs / 1000).toFixed(1)}s</p>
      </details>

      {result.claims.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-zinc-800">
          <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">
            Claims Checked
          </p>
          {result.claims.map((c) => (
            <div key={c.id} className="bg-zinc-800/50 rounded-lg p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-bold border ${verdictColor[c.verdict]}`}>
                  {verdictEmoji[c.verdict]} {c.verdict} {c.confidence}%
                </span>
              </div>
              <p className="text-zinc-200 text-sm">"{c.claim}"</p>
              <p className="text-zinc-400 text-xs">{c.evidence}</p>
              {c.sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {c.sources.map((s, i) => (
                    <a key={i} href={s} target="_blank" rel="noreferrer"
                      className="text-blue-400 text-xs hover:underline truncate max-w-[250px]">
                      🔗 {new URL(s).hostname}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FactCheckResult[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("Connecting to the local model…");
  const [searches, setSearches] = useState<SearchActivity[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!loading) return;
    const start = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    setLoading(true);
    setError("");
    setProgress("Connecting to the local model…");
    setSearches([]);
    setElapsed(0);
    const requestController = new AbortController();
    controller.current = requestController;

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ input: input.trim() }),
        signal: requestController.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Request failed");
      }

      let data: FactCheckResult | undefined;
      await readCheckStream(res, (raw) => {
        const event = raw as ProgressEvent | { type: "result"; result: FactCheckResult } | { type: "error"; error: string } | { type: "heartbeat" };
        if (event.type === "error") throw new Error(event.error);
        if (event.type === "progress") {
          setProgress(event.message);
          if (event.search) setSearches((previous) => [...previous, event.search!]);
        }
        if (event.type === "result") data = event.result;
      });
      if (!data) throw new Error("Connection ended before the result arrived. Please retry.");
      const completed = data;
      setResults((prev) => [completed, ...prev]);
      setInput("");
    } catch (err: unknown) {
      setError(requestController.signal.aborted ? "Check cancelled." : err instanceof Error ? err.message : "Something went wrong");
    } finally {
      controller.current = null;
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">
            🛡️ TrueSight<span className="text-blue-400">.ai</span>
          </h1>
          <p className="text-zinc-400 mt-2">
            Paste a news link or text — AI verifies each claim against the web.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              aria-label="News text, factual question, or URL"
              maxLength={10000}
              disabled={loading}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste a news URL, claim, or question..."
              className="min-w-0 flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:cursor-not-allowed px-5 py-3 rounded-lg font-semibold transition"
            >
              {loading ? "Checking..." : "Check"}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </form>

        {loading && (
          <div className="text-center text-zinc-400 py-8 space-y-2">
            <div className="text-4xl animate-pulse">🔍</div>
            <p role="status" aria-live="polite">{progress}</p>
            <p className="text-xs text-zinc-500">{elapsed}s elapsed</p>
            <button type="button" onClick={() => controller.current?.abort()} className="text-sm text-zinc-400 underline">Cancel</button>
            <SearchResults searches={searches} />
          </div>
        )}

        <div className="space-y-6">
          {results.map((r, i) => (
            <ResultCard key={i} result={r} />
          ))}
        </div>
      </div>
    </div>
  );
}
