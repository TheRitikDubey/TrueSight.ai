import axios from "axios";
import { z } from "zod";

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

const responseSchema = z.object({
  results: z.array(z.object({
    title: z.string(),
    url: z.string().url().refine((url) => /^https?:\/\//i.test(url)),
    content: z.string(),
    score: z.number().optional(),
  })),
});

export async function searchWeb(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) throw new Error("Web search is unavailable: set TAVILY_API_KEY in server/.env.");
  try {
    const { data } = await axios.post("https://api.tavily.com/search", {
      query: query.slice(0, 400),
      search_depth: process.env.SEARCH_DEPTH === "advanced" ? "advanced" : "basic",
      max_results: 3,
      include_answer: false,
      include_raw_content: false,
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 15000,
      signal,
    });
    return responseSchema.parse(data).results
      .filter((r) => r.content.trim())
      .map((r) => ({ ...r, content: r.content.slice(0, 1500), score: r.score ?? 0 }));
  } catch (error) {
    // Axios errors include request headers: never expose the API key in logs or responses.
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 401 || status === 403) throw new Error("Web search authentication failed. Check TAVILY_API_KEY in server/.env.");
      if (status === 429 || status === 432) throw new Error("Web search quota or rate limit reached. Check your Tavily account.");
      if (error.code === "ECONNABORTED") throw new Error("Web search timed out after 15 seconds.");
      throw new Error(`Web search failed${status ? ` (HTTP ${status})` : ": provider unreachable"}.`);
    }
    throw new Error("Web search returned an invalid response.");
  }
}
