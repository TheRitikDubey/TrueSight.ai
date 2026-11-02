interface SearchActivity {
  query: string;
  status: "completed" | "failed";
  results: { title: string; url: string; content: string }[];
  durationMs: number;
  error?: string;
}

interface ClaimVerdict {
  id: number;
  claim: string;
  verdict: "TRUE" | "FALSE" | "UNVERIFIED" | "MISLEADING";
  confidence: number;
  evidence: string;
  sources: string[];
}

export interface FactCheckResult {
  title: string;
  source: string;
  claims: ClaimVerdict[];
  overallVerdict: string;
  overallConfidence: number;
  summary: string;
  webSearch: { status: string; reason: string; searches: SearchActivity[] };
  warnings: string[];
  timings: {
    totalMs: number;
    planningMs: number;
    searchMs: number;
    verificationMs: number;
  };
}

function SearchResults({ searches }: { searches: SearchActivity[] }) {
  return (
    <div className="space-y-3 text-left">
      {searches.map((search, index) => (
        <div key={index} className="text-sm space-y-1">
          <p className="text-zinc-300 break-words">
            🔎 {search.query}{" "}
            <span className="text-zinc-500">
              · {(search.durationMs / 1000).toFixed(1)}s
            </span>
          </p>
          {search.error && <p className="text-amber-400">{search.error}</p>}
          {search.status === "completed" && !search.results.length && (
            <p className="text-zinc-500">No relevant sources found.</p>
          )}
          {search.results.map((source, i) => (
            <a
              key={i}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="block text-blue-400 hover:underline break-words"
            >
              {source.title || new URL(source.url).hostname}
            </a>
          ))}
        </div>
      ))}
    </div>
  );
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

export function ResultCard({ result }: { result: FactCheckResult }) {
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

      {result.warnings.map((warning, i) => (
        <p key={i} className="text-amber-400 text-sm" role="alert">
          {warning}
        </p>
      ))}
      <details
        className="border border-zinc-800 rounded-lg p-3"
        open={
          result.webSearch.status === "failed" ||
          result.webSearch.status === "partial"
        }
      >
        <summary className="cursor-pointer text-sm text-zinc-300">
          Web search: {result.webSearch.status} ·{" "}
          {result.webSearch.searches.length} queries ·{" "}
          {(result.timings.totalMs / 1000).toFixed(1)}s total
        </summary>
        <p className="text-zinc-500 text-xs my-2">{result.webSearch.reason}</p>
        <SearchResults searches={result.webSearch.searches} />
        <p className="text-zinc-500 text-xs mt-3">
          Planning {(result.timings.planningMs / 1000).toFixed(1)}s · Search{" "}
          {(result.timings.searchMs / 1000).toFixed(1)}s · Verification{" "}
          {(result.timings.verificationMs / 1000).toFixed(1)}s
        </p>
      </details>

      {result.claims.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-zinc-800">
          <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">
            Claims Checked
          </p>
          {result.claims.map((c) => (
            <div
              key={c.id}
              className="bg-zinc-800/50 rounded-lg p-3 space-y-1.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold border ${verdictColor[c.verdict]}`}
                >
                  {verdictEmoji[c.verdict]} {c.verdict} {c.confidence}%
                </span>
              </div>
              <p className="text-zinc-200 text-sm">"{c.claim}"</p>
              <p className="text-zinc-400 text-xs">{c.evidence}</p>
              {c.sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {c.sources.map((s, i) => (
                    <a
                      key={i}
                      href={s}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 text-xs hover:underline truncate max-w-[250px]"
                    >
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
