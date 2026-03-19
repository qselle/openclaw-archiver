import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { ScrapedPage } from "../scraper/index.js";

export interface StoredPage extends ScrapedPage {
  id: string;
}

export interface StorageConfig {
  storagePath: string;
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function generateId(): string {
  return randomBytes(6).toString("hex");
}

export function savePage(config: StorageConfig, page: ScrapedPage): StoredPage {
  ensureDir(config.storagePath);

  const id = generateId();
  const stored: StoredPage = { ...page, id };

  // Save metadata
  const metaPath = join(config.storagePath, `${id}.json`);
  writeFileSync(metaPath, JSON.stringify(stored, null, 2));

  // Save rendered HTML
  const htmlPath = join(config.storagePath, `${id}.html`);
  writeFileSync(htmlPath, stored.html);

  return stored;
}

export function getPage(config: StorageConfig, id: string): StoredPage | null {
  const metaPath = join(config.storagePath, `${id}.json`);
  if (!existsSync(metaPath)) return null;
  return JSON.parse(readFileSync(metaPath, "utf-8"));
}

export function getPageHtml(config: StorageConfig, id: string): string | null {
  const htmlPath = join(config.storagePath, `${id}.html`);
  if (!existsSync(htmlPath)) return null;
  return readFileSync(htmlPath, "utf-8");
}

export function listPages(config: StorageConfig): StoredPage[] {
  ensureDir(config.storagePath);

  return readdirSync(config.storagePath)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(config.storagePath, f), "utf-8")) as StoredPage;
      } catch {
        return null;
      }
    })
    .filter((p): p is StoredPage => p !== null)
    .sort((a, b) => new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime());
}
