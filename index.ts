import { homedir } from "node:os";
import { join } from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { jsonResult } from "openclaw/plugin-sdk";
import { scrapePage, closeBrowser, type ScraperOptions } from "./src/scraper/index.js";
import { extractReadableContent } from "./src/scraper/extract.js";
import { savePage, listPages, type StorageConfig } from "./src/storage/index.js";
import { createArchiveServer } from "./src/server/index.js";

interface ArchiverConfig {
  port: number;
  storagePath: string;
  baseUrl: string;
  browser: ScraperOptions;
}

function resolveConfig(raw: Record<string, unknown> | undefined): ArchiverConfig {
  const r = raw ?? {};
  const port = (r.port as number) ?? 8787;
  const storagePath = (r.storagePath as string) ?? join(homedir(), ".web-archiver", "pages");
  const baseUrl = (r.baseUrl as string) ?? `http://localhost:${port}/archive`;
  const browserRaw = (r.browser as Record<string, unknown>) ?? {};

  return {
    port,
    storagePath,
    baseUrl,
    browser: {
      headless: (browserRaw.headless as boolean) ?? true,
      timeout: (browserRaw.timeout as number) ?? 30_000,
      userDataDir: browserRaw.userDataDir as string | undefined,
      proxy: browserRaw.proxy as string | undefined,
    },
  };
}

const plugin = {
  id: "archiver",
  name: "Archiver",
  description: "Scrape, extract, and serve readable web pages",

  register(api: OpenClawPluginApi) {
    const config = resolveConfig(api.pluginConfig);
    const logger = api.logger;

    const storageConfig: StorageConfig = { storagePath: config.storagePath };

    const httpServer = createArchiveServer(storageConfig, config.port, logger);

    // ── Tool: archive_page ──────────────────────────────────────────────
    api.registerTool({
      name: "archive_page",
      label: "Archive Page",
      description:
        "Scrape a web page, extract its readable content, and return a link to the archived version. " +
        "Bypasses soft paywalls and bot detection using a stealth browser.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to archive" },
        },
        required: ["url"],
      },
      execute: async (_id, params) => {
        const { url } = params as { url: string };
        logger.info(`archiver: scraping ${url}`);

        try {
          const { fullHtml, title } = await scrapePage(url, config.browser);
          const extracted = extractReadableContent(url, fullHtml, title);
          const stored = savePage(storageConfig, extracted);

          const link = `${config.baseUrl}/${stored.id}`;
          logger.info(`archiver: saved ${url} → ${link}`);

          return jsonResult({
            title: stored.title,
            byline: stored.byline,
            siteName: stored.siteName,
            excerpt: stored.excerpt,
            link,
            originalUrl: url,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`archiver: failed to scrape ${url}: ${msg}`);
          return {
            content: [{ type: "text" as const, text: `Failed to archive: ${msg}` }],
            details: { error: msg },
          };
        }
      },
    });

    // ── Tool: list_archives ─────────────────────────────────────────────
    api.registerTool({
      name: "list_archives",
      label: "List Archives",
      description: "List all archived web pages with their titles, URLs, and archive links.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max pages to return (default: 20)" },
        },
      },
      execute: async (_id, params) => {
        const { limit } = params as { limit?: number };
        const max = limit ?? 20;
        const pages = listPages(storageConfig).slice(0, max);

        return jsonResult(
          pages.map((p) => ({
            id: p.id,
            title: p.title,
            url: p.url,
            link: `${config.baseUrl}/${p.id}`,
            scrapedAt: p.scrapedAt,
          })),
        );
      },
    });

    // ── Background Service ──────────────────────────────────────────────
    api.registerService({
      id: "archiver-http",
      start: async () => {
        await httpServer.start();
        logger.info(`archiver: plugin active — port=${config.port}, storage=${config.storagePath}`);
      },
      stop: async () => {
        await httpServer.stop();
        await closeBrowser();
      },
    });

    // ── Commands ────────────────────────────────────────────────────────
    api.registerCommand({
      name: "archive",
      description: "Archive a web page: /archive <url>",
      acceptsArgs: true,
      handler: async (ctx) => {
        const url = ctx.args?.trim();
        if (!url) {
          return {
            text: [
              `Usage: /archive <url>`,
              `Viewer: ${config.baseUrl}`,
              `Storage: ${config.storagePath}`,
            ].join("\n"),
          };
        }

        try {
          logger.info(`archiver: /archive command for ${url}`);
          const { fullHtml, title } = await scrapePage(url, config.browser);
          const extracted = extractReadableContent(url, fullHtml, title);
          const stored = savePage(storageConfig, extracted);
          const link = `${config.baseUrl}/${stored.id}`;
          logger.info(`archiver: saved ${url} → ${link}`);

          return {
            text: [
              `Archived: **${stored.title}**`,
              stored.byline ? `By: ${stored.byline}` : null,
              ``,
              link,
            ]
              .filter(Boolean)
              .join("\n"),
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`archiver: /archive failed for ${url}: ${msg}`);
          return { text: `Failed to archive: ${msg}` };
        }
      },
    });
  },
};

export default plugin;
