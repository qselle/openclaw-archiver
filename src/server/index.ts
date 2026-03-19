import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getPage, getPageHtml, listPages, type StorageConfig } from "../storage/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let templateHtml: string | null = null;

function loadTemplate(): string {
  if (!templateHtml) {
    templateHtml = readFileSync(join(__dirname, "..", "..", "templates", "page.html"), "utf-8");
  }
  return templateHtml;
}

function loadListTemplate(): string {
  return readFileSync(join(__dirname, "..", "..", "templates", "list.html"), "utf-8");
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

export function createArchiveServer(
  config: StorageConfig,
  port: number,
  logger: { info: (msg: string) => void; error: (msg: string) => void },
): { start: () => Promise<void>; stop: () => Promise<void> } {
  let server: Server | null = null;

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const path = url.pathname;

    // GET /archive — list all pages
    if (path === "/archive" || path === "/archive/") {
      const pages = listPages(config);

      if (req.headers.accept?.includes("application/json")) {
        sendJson(res, 200, pages);
        return;
      }

      const template = loadListTemplate();
      const rows = pages
        .map(
          (p) =>
            `<tr>
              <td><a href="/archive/${p.id}">${escapeHtml(p.title)}</a></td>
              <td><a href="${escapeHtml(p.url)}" target="_blank">${escapeHtml(p.url)}</a></td>
              <td>${new Date(p.scrapedAt).toLocaleString()}</td>
            </tr>`,
        )
        .join("\n");

      sendHtml(res, template.replace("{{rows}}", rows));
      return;
    }

    // GET /archive/:id — serve a page
    const match = path.match(/^\/archive\/([a-f0-9]+)$/);
    if (match) {
      const id = match[1];
      const page = getPage(config, id);
      if (!page) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      // Raw HTML content
      if (url.searchParams.has("raw")) {
        const html = getPageHtml(config, id);
        sendHtml(res, html ?? "");
        return;
      }

      // Rendered with template
      const template = loadTemplate();
      const rendered = template
        .replace("{{title}}", escapeHtml(page.title))
        .replace("{{url}}", escapeHtml(page.url))
        .replace("{{byline}}", escapeHtml(page.byline ?? ""))
        .replace("{{date}}", new Date(page.scrapedAt).toLocaleString())
        .replace("{{content}}", page.html);

      sendHtml(res, rendered);
      return;
    }

    // Fallback: redirect to /archive
    res.writeHead(302, { Location: "/archive" });
    res.end();
  };

  return {
    start: () =>
      new Promise((resolve, reject) => {
        server = createServer(handler);
        server.listen(port, "0.0.0.0", () => {
          logger.info(`archiver: HTTP server listening on :${port}`);
          resolve();
        });
        server.on("error", reject);
      }),
    stop: () =>
      new Promise((resolve) => {
        if (server) {
          server.close(() => resolve());
        } else {
          resolve();
        }
      }),
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
