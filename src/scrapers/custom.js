import * as cheerio from "cheerio";
import { fetchPage, politeSleep } from "../http.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

export async function scrape(filterType = "all", city = "osijek") {
  const scrapers = config.customScrapers;
  if (!scrapers || scrapers.length === 0) return { listings: [], containerCount: 0 };

  const results = [];
  let totalContainerCount = 0;

  for (const scraperConfig of scrapers) {
    if (scraperConfig.city && scraperConfig.city !== city) continue;
    try {
      logger.info(`[custom:${scraperConfig.name}] Scraping: ${scraperConfig.url}`);
      const html = await fetchPage(scraperConfig.url);
      if (!html) {
        logger.warn(`[custom:${scraperConfig.name}] Failed to fetch`);
        continue;
      }
      const { listings, containerCount } = parseListings(html, scraperConfig, city);
      results.push(...listings);
      totalContainerCount += containerCount;
      logger.info(`[custom:${scraperConfig.name}] Found ${listings.length} listings`);
      await politeSleep(2000, 5000);
    } catch (e) {
      logger.error(`[custom:${scraperConfig.name}] Error: ${e.message}`);
    }
  }

  return { listings: results, containerCount: totalContainerCount };
}

function parseListings(html, scraperConfig, city) {
  const $ = cheerio.load(html);
  const listings = [];
  const { selectors, name: scraperName } = scraperConfig;
  const listingCity = scraperConfig.city || city;

  const containers = $(selectors.item);
  const containerCount = containers.length;

  containers.each((_, el) => {
    try {
      const $el = $(el);

      const $link = $el.find(selectors.link).first();
      const href = $link.attr("href");
      if (!href) return;

      const title =
        (selectors.title ? $el.find(selectors.title).first().text().trim() : "") ||
        $link.text().trim();
      if (!title || title.length < 5) return;

      const baseUrl = new URL(scraperConfig.url).origin;
      const url = href.startsWith("http") ? href : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;

      const priceText = selectors.price ? $el.find(selectors.price).first().text().trim() : "";
      const price = parsePrice(priceText);

      const infoText = $el.text();
      const size = extractSize(infoText);
      const rooms = extractRooms(infoText);
      const location = extractLocation(infoText, listingCity);
      const type = guessType(infoText);

      const id = `custom:${scraperName.replace(/\s/g, "_")}:${href.replace(/[^a-z0-9]/gi, "_")}`;

      listings.push({
        id,
        source: `custom:${scraperName}`,
        url,
        title: title.slice(0, 200),
        price,
        size,
        rooms,
        location,
        type,
        city: listingCity,
        description: infoText.slice(0, 300),
      });
    } catch (e) {
      logger.warn(`[custom:${scraperName}] Failed to parse listing: ${e.message}`);
    }
  });

  return { listings, containerCount };
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/EUR|€|HRK|kn/gi, "").replace(/\./g, "").replace(/,/g, ".").replace(/[^\d.]/g, "").trim();
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

function extractLocation(text, city) {
  const areas = [
    "gornji grad", "donji grad", "retfala", "sjenjak", "jug ii", "jug 2",
    "centar", "višnjevac", "tvrđa", "čepin", "josipovac",
  ];
  const lower = text.toLowerCase();
  for (const a of areas) if (lower.includes(a)) return a;
  return city.charAt(0).toUpperCase() + city.slice(1);
}

function guessType(text) {
  const lower = text.toLowerCase();
  if (lower.includes("kuć") || lower.includes("kuc")) return "kuca";
  if (lower.includes("stan")) return "stan";
  return "unknown";
}
