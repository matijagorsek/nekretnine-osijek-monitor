import * as cheerio from "cheerio";
import { fetchPage, politeSleep } from "../http.js";
import { logger } from "../logger.js";

const SOURCE = "index";

function getUrls(city) {
  return {
    stan: `https://www.index.hr/oglasi/prodaja-stanova/gp/${city}?elementsNum=25&sortby=new`,
    kuca: `https://www.index.hr/oglasi/prodaja-kuca/gp/${city}?elementsNum=25&sortby=new`,
  };
}

export async function scrape(filterType = "all", city = "osijek") {
  const results = [];
  let totalContainerCount = 0;
  const types = filterType === "all" ? ["stan", "kuca"] : [filterType];
  const SEARCH_URLS = getUrls(city);

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

      const { listings, containerCount } = parseListings(html, type, city);
      results.push(...listings);
      totalContainerCount += containerCount;
      logger.info(`[index] Found ${listings.length} ${type} listings`);

      await politeSleep();
    } catch (e) {
      logger.error(`[index] Error scraping ${type}: ${e.message}`);
    }
  }

  return { listings: results, containerCount: totalContainerCount };
}

function parseListings(html, type, city) {
  const $ = cheerio.load(html);
  const listings = [];

  // Index oglasi listing items
  const containers = $(".OgsListing, .oglasi-list .oglas-item, [class*='listing']");
  const containerCount = containers.length;
  containers.each((_, el) => {
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

      const imgEl = $el.find(".oglas-slika img, .listing-image img, img").first();
      const imgSrc = imgEl.attr("src") || imgEl.attr("data-src") || null;
      const image_url = imgSrc && !imgSrc.startsWith("data:") ? imgSrc : null;

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
        city,
        description: infoText.slice(0, 300),
        amenities: extractAmenities(infoText),
        orientation: extractOrientation(infoText),
        image_url,
      });
    } catch (e) {
      logger.warn(`[index] Failed to parse listing: ${e.message}`);
    }
  });

  return { listings, containerCount };
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
    "centar", "višnjevac", "tvrđa", "čepin", "josipovac", "briješće",
  ];
  const lower = text.toLowerCase();
  if (city === "osijek") {
    for (const area of areas) {
      if (lower.includes(area)) return area;
    }
  }
  return city.charAt(0).toUpperCase() + city.slice(1);
}
