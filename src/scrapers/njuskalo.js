import * as cheerio from "cheerio";
import { fetchPage, politeSleep } from "../http.js";
import { logger } from "../logger.js";

const SOURCE = "njuskalo";

const LOCATION_IDS = { osijek: 2530 };

function getUrls(city) {
  const id = LOCATION_IDS[city];
  const idParam = id ? `?geo%5BlocationIds%5D=${id}` : "";
  return {
    stan: `https://www.njuskalo.hr/prodaja-stanova/${city}${idParam}`,
    kuca: `https://www.njuskalo.hr/prodaja-kuca/${city}${idParam}`,
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

      logger.info(`[njuskalo] Scraping ${type} in ${city}: ${url}`);
      const html = await fetchPage(url);
      if (!html) {
        logger.warn(`[njuskalo] Failed to fetch ${type}`);
        continue;
      }

      const listings = parseListings(html, type, city);
      results.push(...listings);
      logger.info(`[njuskalo] Found ${listings.length} ${type} listings`);

      await politeSleep();
    } catch (e) {
      logger.error(`[njuskalo] Error scraping ${type}: ${e.message}`);
    }

    const { listings, containerCount } = parseListings(html, type);
    results.push(...listings);
    totalContainerCount += containerCount;
    console.log(`[njuskalo] Found ${listings.length} ${type} listings`);

    await politeSleep();
  }

  return { listings: results, containerCount: totalContainerCount };
}

function parseListings(html, type, city) {
  const $ = cheerio.load(html);
  const listings = [];

  // Njuškalo uses EntityList items
  const containers = $(".EntityList--Regular .EntityList-item--Regular, .EntityList-item--VauVau, .EntityList-item--Featured");
  const containerCount = containers.length;
  containers.each(
    (_, el) => {
      try {
        const $el = $(el);

        // Title and URL
        const $link = $el.find(".entity-title a, .EntityList-item--title a, a.entity-title");
        const title = $link.text().trim();
        const href = $link.attr("href");
        if (!title || !href) return;

        const url = href.startsWith("http") ? href : `https://www.njuskalo.hr${href}`;

        // Price
        const priceText = $el.find(".price--hrk, .price--eur, .entity-price .price").first().text().trim();
        const price = parsePrice(priceText);

        // Description / details
        const descText = $el.find(".entity-description, .entity-body").text().trim();

        // Extract size and rooms from title + description
        const size = extractSize(title + " " + descText);
        const rooms = extractRooms(title + " " + descText);
        const location = extractLocation(title + " " + descText, city);

        const id = `${SOURCE}:${href.replace(/[^a-z0-9]/gi, "_")}`;
        const combinedText = title + " " + descText;

        listings.push({
          id,
          source: SOURCE,
          url,
          title,
          price,
          size,
          rooms,
          location,
          type,
          city,
          description: descText.slice(0, 300),
          amenities: extractAmenities(combinedText),
          orientation: extractOrientation(combinedText),
        });
      } catch (e) {
        logger.warn(`[njuskalo] Failed to parse listing: ${e.message}`);
      }
    }
  );

  return { listings, containerCount };
}

function parsePrice(text) {
  if (!text) return null;
  // Remove currency symbols, dots as thousand separators, convert comma to dot
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
  if (match) return parseFloat(match[1].replace(",", "."));
  return null;
}

function extractRooms(text) {
  // "3-sobni", "3 sobe", "trosoban" etc.
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
  const osijekAreas = [
    "gornji grad", "donji grad", "retfala", "sjenjak", "jug ii", "jug 2",
    "centar", "višnjevac", "visnjevac", "tvrđa", "tvrda", "čepin", "cepin",
    "josipovac", "briješće", "brijesce", "nemetinska", "industrijsko",
  ];

  const lower = text.toLowerCase();
  if (city === "osijek") {
    for (const area of osijekAreas) {
      if (lower.includes(area)) return area;
    }
  }

  return city.charAt(0).toUpperCase() + city.slice(1);
}
