import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

export interface ScrapedPage {
  url: string;
  title: string;
  html: string;
  text: string;
  byline: string | null;
  excerpt: string | null;
  siteName: string | null;
  scrapedAt: string;
}

export interface ScraperOptions {
  headless?: boolean;
  timeout?: number;
  userDataDir?: string;
}

let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
let context: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newContext"]>> | null =
  null;

chromium.use(StealthPlugin());

export async function ensureBrowser(
  opts: ScraperOptions,
): Promise<typeof context & {}> {
  if (context) return context;

  browser = await chromium.launch({
    headless: opts.headless ?? true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  return context;
}

export async function scrapePage(
  url: string,
  opts: ScraperOptions,
): Promise<{ fullHtml: string; title: string }> {
  const ctx = await ensureBrowser(opts);
  const page = await ctx.newPage();

  try {
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: opts.timeout ?? 30_000,
    });

    // Wait a bit for lazy-loaded content / paywall overlays to settle
    await page.waitForTimeout(2000);

    // Remove common paywall overlays and fixed elements
    await page.evaluate(() => {
      const selectors = [
        '[class*="paywall"]',
        '[class*="Paywall"]',
        '[id*="paywall"]',
        '[class*="modal"]',
        '[class*="overlay"]',
        '[class*="gate"]',
        '[class*="subscribe"]',
        '[class*="metered"]',
        'div[style*="position: fixed"]',
        'div[style*="position:fixed"]',
      ];
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach((el) => el.remove());
      }
      document.body.style.overflow = "auto";
      document.documentElement.style.overflow = "auto";
    });

    const title = await page.title();
    const fullHtml = await page.content();

    return { fullHtml, title };
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close().catch(() => {});
    context = null;
  }
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}
