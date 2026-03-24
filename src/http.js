import fetch from "node-fetch";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch a URL with retry, delay, and rotating user agents.
 * Respectful: delays between requests, retries on failure.
 */
export async function fetchPage(url, options = {}) {
  const { retries = 3, delay = 2000, timeout = 15000 } = options;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Polite delay between requests
      if (attempt > 1) await sleep(delay * attempt);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const resp = await fetch(url, {
        headers: {
          "User-Agent": randomUA(),
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "hr,en;q=0.5",
          "Accept-Encoding": "gzip, deflate",
          Connection: "keep-alive",
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!resp.ok) {
        console.warn(`[HTTP] ${url} → ${resp.status} (attempt ${attempt}/${retries})`);
        if (attempt === retries) return null;
        continue;
      }

      return await resp.text();
    } catch (err) {
      console.warn(`[HTTP] ${url} → ${err.message} (attempt ${attempt}/${retries})`);
      if (attempt === retries) return null;
    }
  }

  return null;
}

/**
 * Polite delay between scraping different sources
 */
export async function politeSleep(minMs = 1000, maxMs = 3000) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  await sleep(ms);
}
