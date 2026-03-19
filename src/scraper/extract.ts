import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { ScrapedPage } from "./index.js";

export function extractReadableContent(
  url: string,
  fullHtml: string,
  pageTitle: string,
): ScrapedPage {
  const { document } = parseHTML(fullHtml);

  const reader = new Readability(document as unknown as Document);
  const article = reader.parse();

  return {
    url,
    title: article?.title ?? pageTitle,
    html: article?.content ?? fullHtml,
    text: article?.textContent ?? "",
    byline: article?.byline ?? null,
    excerpt: article?.excerpt ?? null,
    siteName: article?.siteName ?? null,
    scrapedAt: new Date().toISOString(),
  };
}
