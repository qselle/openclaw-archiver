import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

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
  proxy?: string; // e.g. socks5://100.x.x.x:1080 or http://proxy:8080
}

let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
let context: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newContext"]>> | null =
  null;

chromium.use(StealthPlugin());

function getProfileDir(opts: ScraperOptions): string {
  const dir = opts.userDataDir ?? join(homedir(), ".web-archiver", "browser-profile");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function ensureBrowser(
  opts: ScraperOptions,
): Promise<typeof context & {}> {
  if (context) return context;

  const profileDir = getProfileDir(opts);

  browser = await chromium.launch({
    headless: opts.headless ?? true,
    ...(opts.proxy ? { proxy: { server: opts.proxy } } : {}),
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-dev-shm-usage",
      "--disable-background-timer-throttling",
    ],
  });

  context = await browser.newContext({
    storageState: undefined,
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    locale: "en-US",
    timezoneId: "Europe/Berlin",
    // Make it look like a real browser
    javaScriptEnabled: true,
    bypassCSP: true,
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Linux"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    },
  });

  // Persist cookies across sessions
  context.on("close", async () => {
    try {
      const state = await context!.storageState();
      const { writeFileSync } = await import("node:fs");
      writeFileSync(join(profileDir, "storage-state.json"), JSON.stringify(state));
    } catch {}
  });

  // Load persisted cookies if available
  try {
    const { readFileSync } = await import("node:fs");
    const stateFile = join(profileDir, "storage-state.json");
    const data = readFileSync(stateFile, "utf-8");
    const state = JSON.parse(data);
    if (state.cookies?.length) {
      await context.addCookies(state.cookies);
    }
  } catch {}

  return context;
}

export async function scrapePage(
  url: string,
  opts: ScraperOptions,
): Promise<{ fullHtml: string; title: string }> {
  const ctx = await ensureBrowser(opts);
  const page = await ctx.newPage();

  try {
    // Additional stealth patches at page level
    await page.addInitScript(() => {
      // Override webdriver detection
      Object.defineProperty(navigator, "webdriver", { get: () => false });

      // Override plugins to look real
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: PermissionDescriptor) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: "denied" } as PermissionStatus)
          : originalQuery(parameters);

      // Chrome runtime
      (window as any).chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };

      // Override language detection
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
    });

    // Navigate with a referrer to look like a click from Google
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: opts.timeout ?? 30_000,
      referer: "https://www.google.com/",
    });

    // Wait for content to load and any challenges to resolve
    await page.waitForTimeout(3000);

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
        '[class*="regwall"]',
        '[class*="piano"]',
        '[id*="piano"]',
        '[class*="leaky"]',
        'div[style*="position: fixed"]',
        'div[style*="position:fixed"]',
        'tp-modal',
        '.fc-consent-root',
      ];
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach((el) => el.remove());
      }
      document.body.style.overflow = "auto";
      document.documentElement.style.overflow = "auto";
      document.body.style.position = "static";
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
