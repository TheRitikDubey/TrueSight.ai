import OpenAI from "openai";
import { searchWeb, type SearchResult } from "../tools/search.js";
import { scrapeArticle } from "../tools/scraper.js";

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || "http://localhost:11434/v1",
  apiKey: "ollama", // required by sdk but unused by local servers
});
const MODEL = process.env.LLM_MODEL || "qwen3:8b";

// Qwen3 outputs <think>…</think> before the actual response — strip it
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// ── Types ──────────────────────────────────────────────────────────────────

interface Claim {
  id: number;
  claim: string;
}

interface ClaimVerdict {
  id: number;
  claim: string;
  verdict: "TRUE" | "FALSE" | "UNVERIFIED" | "MISLEADING";
  confidence: number; // 0-100
  evidence: string;
  sources: string[];
}

export interface FactCheckResult {
  title: string;
  source: string;
  claims: ClaimVerdict[];
  overallVerdict: "LIKELY TRUE" | "LIKELY FALSE" | "MIXED" | "UNVERIFIED";
  overallConfidence: number;
  summary: string;
}

// ── Step 1: Extract verifiable claims ──────────────────────────────────────

async function extractClaims(newsContent: string): Promise<Claim[]> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Extract 2-5 specific, verifiable factual claims from this news article.
Only include claims that can be checked against other sources (dates, events, statistics, quotes, named actions).
Skip opinions and vague statements.

Respond ONLY with a JSON array, no markdown:
[{"id": 1, "claim": "..."}, {"id": 2, "claim": "..."}]

Article:
${newsContent}`,
      },
    ],
  });

  const text = stripThinking(response.choices[0].message.content ?? "");
  try {
    return JSON.parse(text.replace(/```json?|```/g, "").trim());
  } catch {
    console.error("Failed to parse claims:", text);
    return [];
  }
}

// ── Step 2: Search and verify each claim ───────────────────────────────────

async function verifyClaim(claim: Claim): Promise<ClaimVerdict> {
  // Search for evidence
  let searchResults: SearchResult[] = [];
  try {
    searchResults = await searchWeb(claim.claim);
  } catch (err) {
    console.error(`Search failed for claim ${claim.id}:`, err);
    return {
      ...claim,
      verdict: "UNVERIFIED",
      confidence: 0,
      evidence: "Search failed — could not verify this claim.",
      sources: [],
    };
  }

  if (searchResults.length === 0) {
    return {
      ...claim,
      verdict: "UNVERIFIED",
      confidence: 20,
      evidence: "No relevant search results found for this claim.",
      sources: [],
    };
  }

  // Let the LLM judge the claim against search evidence
  const evidenceBlock = searchResults
    .map((r, i) => `[Source ${i + 1}: ${r.url}]\n${r.content}`)
    .join("\n\n");

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `You are a fact-checker. Compare this CLAIM against the EVIDENCE from search results.

CLAIM: "${claim.claim}"

EVIDENCE:
${evidenceBlock}

Respond ONLY with JSON, no markdown:
{
  "verdict": "TRUE" | "FALSE" | "MISLEADING" | "UNVERIFIED",
  "confidence": <0-100>,
  "evidence": "<1-2 sentence explanation of your reasoning>"
}`,
      },
    ],
  });

  const text = stripThinking(response.choices[0].message.content ?? "");

  try {
    const parsed = JSON.parse(text.replace(/```json?|```/g, "").trim());
    return {
      ...claim,
      verdict: parsed.verdict,
      confidence: parsed.confidence,
      evidence: parsed.evidence,
      sources: searchResults.slice(0, 3).map((r) => r.url),
    };
  } catch {
    return {
      ...claim,
      verdict: "UNVERIFIED",
      confidence: 0,
      evidence: "Failed to parse verification result.",
      sources: [],
    };
  }
}

// ── Step 3: Aggregate verdicts ─────────────────────────────────────────────

function aggregateVerdicts(verdicts: ClaimVerdict[]): {
  overallVerdict: FactCheckResult["overallVerdict"];
  overallConfidence: number;
} {
  if (verdicts.length === 0)
    return { overallVerdict: "UNVERIFIED", overallConfidence: 0 };

  const counts = { TRUE: 0, FALSE: 0, MISLEADING: 0, UNVERIFIED: 0 };
  let totalConf = 0;

  for (const v of verdicts) {
    counts[v.verdict]++;
    totalConf += v.confidence;
  }

  const avgConf = Math.round(totalConf / verdicts.length);
  const total = verdicts.length;

  let overallVerdict: FactCheckResult["overallVerdict"];
  if (counts.TRUE / total >= 0.7) overallVerdict = "LIKELY TRUE";
  else if (counts.FALSE / total >= 0.5) overallVerdict = "LIKELY FALSE";
  else if (counts.UNVERIFIED / total >= 0.7) overallVerdict = "UNVERIFIED";
  else overallVerdict = "MIXED";

  return { overallVerdict, overallConfidence: avgConf };
}

// ── Main agent entry point ─────────────────────────────────────────────────

export async function factCheck(input: string): Promise<FactCheckResult> {
  let title = "User-provided text";
  let source = "direct input";
  let newsContent = input;

  // If input looks like a URL, scrape it first
  const urlMatch = input.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    console.log(`🔗 Scraping URL: ${urlMatch[0]}`);
    try {
      const article = await scrapeArticle(urlMatch[0]);
      title = article.title;
      source = article.source;
      newsContent = `${article.title}\n\n${article.text}`;
    } catch (err) {
      console.error("Scrape failed, using raw input:", err);
    }
  } else {
    // No URL — search the web first so the LLM has current context to work with
    console.log("🌐 Searching web for context...");
    try {
      const webResults = await searchWeb(input);
      if (webResults.length > 0) {
        title = input.slice(0, 80);
        source = "web search";
        newsContent = webResults
          .map((r, i) => `[Source ${i + 1}: ${r.url}]\n${r.title}\n${r.content}`)
          .join("\n\n");
        console.log(`   Got ${webResults.length} results`);
      }
    } catch (err) {
      console.error("Web search failed, using raw input:", err);
    }
  }

  // Step 1: Extract claims
  console.log("🔍 Extracting claims...");
  const claims = await extractClaims(newsContent);
  console.log(`   Found ${claims.length} claims`);

  if (claims.length === 0) {
    return {
      title,
      source,
      claims: [],
      overallVerdict: "UNVERIFIED",
      overallConfidence: 0,
      summary: "Could not extract verifiable claims from this content.",
    };
  }

  // Step 2: Verify each claim (parallel)
  console.log("✅ Verifying claims...");
  const verdicts = await Promise.all(claims.map(verifyClaim));

  // Step 3: Aggregate
  const { overallVerdict, overallConfidence } = aggregateVerdicts(verdicts);

  // Step 4: Generate summary
  const summaryResponse = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: `Summarize this fact-check result in 2-3 sentences for a general audience.

Article: "${title}" from ${source}
Overall verdict: ${overallVerdict} (${overallConfidence}% confidence)
Claims checked:
${verdicts.map((v) => `- "${v.claim}" → ${v.verdict} (${v.confidence}%): ${v.evidence}`).join("\n")}

Be direct. State the verdict clearly.`,
      },
    ],
  });

  const summary = stripThinking(summaryResponse.choices[0].message.content ?? "") || "Unable to generate summary.";

  return {
    title,
    source,
    claims: verdicts,
    overallVerdict,
    overallConfidence,
    summary,
  };
}
