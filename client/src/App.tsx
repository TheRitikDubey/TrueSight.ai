import { useState } from "react";

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Request failed");
      }

      const data: FactCheckResult = await res.json();
      setResults((prev) => [data, ...prev]);
      setInput("");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
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
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste a news URL or type a claim..."
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition"
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
            <p>Extracting claims and searching the web...</p>
            <p className="text-xs text-zinc-600">This takes 10-20 seconds</p>
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
