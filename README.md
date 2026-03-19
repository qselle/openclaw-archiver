# openclaw-archiver

OpenClaw plugin that scrapes web pages with a stealth browser, extracts readable content, and serves clean archived versions over HTTP.

## Features

- **Stealth browser** — Playwright + [puppeteer-extra-plugin-stealth](https://github.com/nicedayfor/puppeteer-extra-plugin-stealth) patches 10+ bot detection vectors (webdriver flag, chrome.runtime, headless signals, etc.)
- **Paywall bypass** — Removes common paywall overlays, metered gates, and subscribe modals after page load
- **Readability extraction** — Mozilla's [Readability](https://github.com/mozilla/readability) strips ads, nav, and clutter — keeps the article
- **HTTP viewer** — Clean, reader-friendly pages served on your tailnet

## Install

```bash
git clone https://github.com/qselle/openclaw-archiver.git
cd openclaw-archiver
npm install
npx playwright install chromium
npm run build
```

## Configure

Add to your `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "archiver": {
        "source": "/path/to/openclaw-archiver/index.ts",
        "config": {
          "port": 8787,
          "baseUrl": "https://your-machine.ts.net/archive"
        }
      }
    }
  }
}
```

Then expose via Tailscale:

```bash
tailscale serve --bg 8787
```

### Config options

| Key | Default | Description |
|-----|---------|-------------|
| `port` | `8787` | HTTP viewer port |
| `storagePath` | `~/.web-archiver/pages` | Where archived pages are stored |
| `baseUrl` | `http://localhost:8787/archive` | Public URL for archive links |
| `browser.headless` | `true` | Run browser headless |
| `browser.timeout` | `30000` | Page load timeout (ms) |

## Usage

Once the plugin is loaded, your OpenClaw agent has two tools:

### `archive_page`

Scrape a URL and get a readable archive link.

```
/archive https://example.com/some-paywalled-article
```

The agent calls `archive_page(url)`, fetches the page with the stealth browser, extracts the article, and returns a link like:

```
https://your-machine.ts.net/archive/a1b2c3d4e5f6
```

### `list_archives`

List all previously archived pages.

## Viewer

Browse all archives at `http://localhost:8787/archive` (or your Tailscale URL). Each page is rendered in a clean reading template with link back to the original.

Append `?raw` to any archive URL to get the raw extracted HTML.

## License

MIT
