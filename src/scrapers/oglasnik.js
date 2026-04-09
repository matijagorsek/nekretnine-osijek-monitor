import * as cheerio from "cheerio";
import { fetchPage, politeSleep } from "../http.js";
import { logger } from "../logger.js";

const SOURCE = "oglasnik";

const SEARCH_URLS = {
  stan: "https://www.oglasnik.hr/stanovi/prodaja/osijek/?sort=new",
  kuca: "https://www.oglasnik.hr/kuce/prodaja/osijek/?sort=new",
};

export async function scrape(filterType = "all") {
  const results = [];
  const types = filterType === "all" ? ["stan", "kuca"] : [filterType];

  for (const type of types) {
    try {
      const url = SEARCH_URLS[type];
      if (!url) continue;

      logger.info(`[oglasnik] Scraping ${type}: ${url}`);
      const html = await fetchPage(url);
      if (!html) {
        logger.warn(`[oglasnik] Failed to fetch ${type}`);
        continue;
      }

      const listings = parseListings(html, type);
      results.push(...listings);
      logger.info(`[oglasnik] Found ${listings.length} ${type} listings`);

      await politeSleep();
    } catch (e) {
      logger.error(`[oglasnik] Error scraping ${type}: ${e.message}`);
    }
  }

  return results;
}

function parseListings(html, type) {
  const $ = cheerio.load(html);
  const listings = [];

  $(".oglas, .listing-item, article.ad, [class*='oglas-item'], .advert").each((_, el) => {
    try {
      const $el = $(el);

      const $link = $el.find("a[href*='/oglas/'], a[href*='/nekretnine/'], a").first();
      const href = $link.attr("href");
      if (!href) return;

      const title =
        $el.find("h2, h3, .title, .oglas-title, .name").first().text().trim() ||
        $link.attr("title") ||
        $link.text().trim();
      if (!title || title.length < 5) return;

      const url = href.startsWith("http") ? href : `https://www.oglasnik.hr${href.startsWith("/") ? "" : "/"}${href}`;

      const priceText = $el.find(".price, .cijena, [class*='price'], [class*='cijena']").first().text().trim();
      const price = parsePrice(priceText);

      const infoText = $el.text();
      const size = extractSize(infoText);
      const rooms = extractRooms(infoText);
      const location = extractLocation(infoText);

      const id = `${SOURCE}:${href.replace(/[^a-z0-9]/gi, "_")}`;

      listings.push({
        id,
        source: SOURCE,
        url,
        title: title.slice(0, 200),
        price,
        size,
        rooms,
        location,
        type,
        description: infoText.slice(0, 300),
      });
    } catch (e) {
      logger.warn(`[oglasnik] Failed to parse listing: ${e.message}`);
    }
  });

  return listings;
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text
    .replace(/EUR|€|HRK|kn/gi, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.]/g, "")
    .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function extractSize(text) {
  const match = text.match(/(\d+[\.,]?\d*)\s*m[²2]/i);
  return match ? parseFloat(match[1].replace(",", ".")) : null;
}

function extractRooms(text) {
  const m = text.match(/(\d+)\s*-?\s*sob/i);
  if (m) return parseInt(m[1]);
  const wordMap = { jednosoban: 1, dvosoban: 2, trosoban: 3, četverosoban: 4, petosoban: 5 };
  for (const [w, n] of Object.entries(wordMap)) {
    if (text.toLowerCase().includes(w)) return n;
  }
  return null;
}

function extractLocation(text) {
  const areas = [
    "gornji grad", "donji grad", "retfala", "sjenjak", "jug ii", "jug 2",
    "centar", "višnjevac", "visnjevac", "tvrđa", "tvrda", "čepin", "cepin",
    "josipovac", "briješće", "brijesce", "nemetinska", "industrijsko",
  ];
  const lower = text.toLowerCase();
  for (const area of areas) {
    if (lower.includes(area)) return area;
  }
  return "Osijek";
}
