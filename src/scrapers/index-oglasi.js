import * as cheerio from "cheerio";
import { fetchPage, politeSleep } from "../http.js";
import { logger } from "../logger.js";

const SOURCE = "index";

function getSearchUrls(city) {
  return {
    stan: `https://www.index.hr/oglasi/prodaja-stanova/gp/${city}?elementsNum=25&sortby=new`,
    kuca: `https://www.index.hr/oglasi/prodaja-kuca/gp/${city}?elementsNum=25&sortby=new`,
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

      logger.info(`[index] Scraping ${type} in ${city}: ${url}`);
      const html = await fetchPage(url);
      if (!html) {
        logger.warn(`[index] Failed to fetch ${type}`);
        continue;
      }

      const listings = parseListings(html, type, city);
      results.push(...listings);
      logger.info(`[index] Found ${listings.length} ${type} listings`);

      await politeSleep();
    } catch (e) {
      logger.error(`[index] Error scraping ${type}: ${e.message}`);
    }
  }

  return results;
}

function parseListings(html, type, city = "osijek") {
  const $ = cheerio.load(html);
  const listings = [];

  // Index oglasi listing items
  $(".OgsListing, .oglasi-list .oglas-item, [class*='listing']").each((_, el) => {
    try {
      const $el = $(el);

      const $link = $el.find("a[href*='/oglas/'], a[href*='/oglasi/']").first();
      const title = $link.text().trim() || $el.find(".title, h3, h2").first().text().trim();
      const href = $link.attr("href");
      if (!title || !href) return;

      const url = href.startsWith("http") ? href : `https://www.index.hr${href}`;

      const priceText = $el.find(".price, [class*='price'], [class*='cijena']").first().text().trim();
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
      });
    } catch (e) {
      logger.warn(`[index] Failed to parse listing: ${e.message}`);
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
  const directMatch = text.match(/(\d+)\s*-?\s*sob/i);
  if (directMatch) return parseInt(directMatch[1]);
  const wordMap = { jednosoban: 1, dvosoban: 2, trosoban: 3, četverosoban: 4, petosoban: 5 };
  const lower = text.toLowerCase();
  for (const [word, num] of Object.entries(wordMap)) {
    if (lower.includes(word)) return num;
  }
  return null;
}

function extractLocation(text, city = "osijek") {
  const areas = [
    "gornji grad", "donji grad", "retfala", "sjenjak", "jug ii", "jug 2",
    "centar", "višnjevac", "tvrđa", "čepin", "josipovac", "briješće",
  ];
  const lower = text.toLowerCase();
  for (const area of areas) {
    if (lower.includes(area)) return area;
  }
  return city.charAt(0).toUpperCase() + city.slice(1);
}
