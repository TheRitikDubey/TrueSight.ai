import axios from "axios";
import * as cheerio from "cheerio";

export interface ArticleContent {
  title: string;
  text: string;
  source: string;
}

export async function scrapeArticle(url: string, signal?: AbortSignal): Promise<ArticleContent> {
  const { data: html } = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    timeout: 10000,
    signal,
  });

  const $ = cheerio.load(html);

  // Remove noise
  $("script, style, nav, footer, header, aside, .ad, .advertisement").remove();

  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text().trim() ||
    "Unknown Title";

  // Extract article body - try common selectors
  const selectors = [
    "article",
    '[role="main"]',
    ".post-content",
    ".article-body",
    ".entry-content",
    ".story-body",
    "main",
  ];

  let text = "";
  for (const sel of selectors) {
    const found = $(sel).text().trim();
    if (found.length > 200) {
      text = found;
      break;
    }
  }

  // Fallback: grab all <p> tags
  if (!text) {
    text = $("p")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((p) => p.length > 40)
      .join("\n\n");
  }

  // Trim to ~3000 chars to keep context manageable
  text = text.replace(/\s+/g, " ").slice(0, 3000);

  const hostname = new URL(url).hostname;

  return { title, text, source: hostname };
}
