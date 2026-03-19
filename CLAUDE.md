# CLAUDE.md

## What is this

OpenClaw plugin that scrapes web pages with a stealth browser (Playwright + anti-detection), extracts readable content via Mozilla Readability, stores the result, and serves it on an HTTP viewer.

## Stack

- TypeScript (strict mode, ES2022, Node16 modules)
- playwright-extra + puppeteer-extra-plugin-stealth (anti-bot evasion)
- @mozilla/readability + linkedom (content extraction)
- Build: `npm run build` (tsc)

## Structure

```
index.ts                    — Plugin entry point, registers tools/service/command
src/
  scraper/
    index.ts                — Stealth Playwright browser, page fetching, paywall removal
    extract.ts              — Readability extraction (HTML → clean article)
  storage/
    index.ts                — Filesystem storage (JSON metadata + HTML)
  server/
    index.ts                — HTTP server for viewing archived pages
templates/
  page.html                 — Reader-view template for individual pages
  list.html                 — Archive listing template
```

## Key concepts

- **Stealth browser**: playwright-extra with stealth plugin patches 10+ detection vectors (webdriver, chrome.runtime, etc.)
- **Paywall removal**: After page load, removes common paywall overlay selectors and restores scroll
- **Readability**: Mozilla's algorithm extracts main article content, strips ads/nav
- **Storage**: `~/.web-archiver/pages/{id}.json` + `{id}.html`
- **HTTP viewer**: Serves on port 8787, routes: `/archive` (list), `/archive/:id` (view), `/archive/:id?raw` (raw HTML)

## Commands

- `npm run build` — compile TypeScript
- `npm run dev` — watch mode
- `/archive` — status command (registered as OpenClaw native command)

## Config

Plugin config lives in `openclaw.json` under `plugins.entries.archiver.config`. See `openclaw.plugin.json` for schema.

Key config:
- `port` (default: 8787) — HTTP viewer port
- `storagePath` — override storage dir
- `baseUrl` — public URL for archive links (set to your Tailscale domain)
- `browser.headless` (default: true)
- `browser.timeout` (default: 30000)
