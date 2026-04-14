import * as cheerio from "cheerio";
import { fetchPage, politeSleep } from "../http.js";
import { logger } from "../logger.js";

const SOURCE = "crozilla";

function getSearchUrls(city) {
  return {
    stan: `https://www.crozilla.com/prodaja/stanovi/grad-${city}/`,
    kuca: `https://www.crozilla.com/prodaja/kuce/grad-${city}/`,
  };
}

export async function scrape(filterType = "all", city = "osijek") {
  const results = [];
  const types = filterType === "all" ? ["stan", "kuca"] : [filterType];
  const SEARCH_URLS = getSearchUrls(city);

  for (const type of types) {
    try {
      const url = SEARCH_URLS[type];
      if (!url) continue;

      logger.info(`[crozilla] Scraping ${type} in ${city}: ${url}`);
      const html = await fetchPage(url);
      if (!html) {
        logger.warn(`[crozilla] Failed to fetch ${type}`);
        continue;
      }

      const listings = parseListings(html, type, city);
      results.push(...listings);
      logger.info(`[crozilla] Found ${listings.length} ${type} listings`);

      await politeSleep();
    } catch (e) {
      logger.error(`[crozilla] Error scraping ${type}: ${e.message}`);
    }
  }

  return results;
}

function parseListings(html, type, city = "osijek") {
  const $ = cheerio.load(html);
  const listings = [];

  $(".property-card, .listing-card, article, .property-item, [class*='listing-item']").each((_, el) => {
    try {
      const $el = $(el);

      const $link = $el.find("a[href*='/prodaja/'], a[href*='/nekretnina/'], a").first();
      const href = $link.attr("href");
      if (!href) return;

      const title =
        $el.find("h2, h3, .property-title, .listing-title, .title").first().text().trim() ||
        $link.text().trim();
      if (!title || title.length < 5) return;

      const url = href.startsWith("http") ? href : `https://www.crozilla.com${href.startsWith("/") ? "" : "/"}${href}`;

      const priceText = $el.find(".price, .property-price, [class*='price'], [class*='cijena']").first().text().trim();
      const price = parsePrice(priceText);

      const infoText = $el.text();
      const size = extractSize(infoText);
      const rooms = extractRooms(infoText);
      const location = extractLocation(infoText, city);

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
        amenities: extractAmenities(infoText),
        orientation: extractOrientation(infoText),
      });
    } catch (e) {
      logger.warn(`[crozilla] Failed to parse listing: ${e.message}`);
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

function extractAmenities(text) {
  const lower = text.toLowerCase();
  const KEYWORD_MAP = {
    "garaž": "garaža",
    "parking": "parking",
    "balkon": "balkon",
    "terasa": "terasa",
    "terasom": "terasa",
    "lift": "lift",
    "podrum": "podrum",
    "okućnica": "okućnica",
    "namješteno": "namješteno",
    "namještena": "namješteno",
    "klima": "klima",
    "centralno grijanje": "centralno grijanje",
    "centralnog grijanja": "centralno grijanje",
  };
  const seen = new Set();
  const amenities = [];
  for (const [keyword, label] of Object.entries(KEYWORD_MAP)) {
    if (lower.includes(keyword) && !seen.has(label)) {
      amenities.push(label);
      seen.add(label);
    }
  }
  return amenities.length > 0 ? JSON.stringify(amenities) : null;
}

function extractOrientation(text) {
  const lower = text.toLowerCase();
  if (/orijenti?rano\s+prema\s+jugu|južna\s+strana|okrenuto\s+prema\s+jugu/.test(lower)) return "jug";
  if (/orijenti?rano\s+prema\s+sjeveru|sjeverna\s+strana|okrenuto\s+prema\s+sjeveru/.test(lower)) return "sjever";
  if (/orijenti?rano\s+prema\s+istoku|istočna\s+strana|okrenuto\s+prema\s+istoku/.test(lower)) return "istok";
  if (/orijenti?rano\s+prema\s+zapadu|zapadna\s+strana|okrenuto\s+prema\s+zapadu/.test(lower)) return "zapad";
  return null;
}

function extractLocation(text, city = "osijek") {
  const areas = [
    "gornji grad", "donji grad", "retfala", "sjenjak", "jug ii", "jug 2",
    "centar", "višnjevac", "visnjevac", "tvrđa", "tvrda", "čepin", "cepin",
    "josipovac", "briješće", "brijesce", "nemetinska", "industrijsko",
  ];
  const lower = text.toLowerCase();
  for (const area of areas) {
    if (lower.includes(area)) return area;
  }
  return city.charAt(0).toUpperCase() + city.slice(1);
}
