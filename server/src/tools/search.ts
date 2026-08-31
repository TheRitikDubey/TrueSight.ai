import axios from "axios";

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export async function searchWeb(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new Error("TAVILY_API_KEY not set in .env");
  }

  const { data } = await axios.post(
    "https://api.tavily.com/search",
    {
      query,
      search_depth: "advanced",
      max_results: 5,
      include_answer: false,
    },
    {
      headers: { "Content-Type": "application/json" },
      params: { api_key: apiKey },
    }
  );

  return (data.results || []).map((r: any) => ({
    title: r.title,
    url: r.url,
    content: r.content?.slice(0, 500) || "",
    score: r.score || 0,
  }));
}
