import * as cheerio from "cheerio";
import { fetchPage, politeSleep } from "../http.js";
import { logger } from "../logger.js";

const SOURCE = "njuskalo";

// Njuškalo search URLs for Osijek
const SEARCH_URLS = {
  stan: "https://www.njuskalo.hr/prodaja-stanova/osijek?geo%5BlocationIds%5D=2530",
  kuca: "https://www.njuskalo.hr/prodaja-kuca/osijek?geo%5BlocationIds%5D=2530",
};

export async function scrape(filterType = "all") {
  const results = [];
  const types = filterType === "all" ? ["stan", "kuca"] : [filterType];

  for (const type of types) {
    try {
      const url = SEARCH_URLS[type];
      if (!url) continue;

      logger.info(`[njuskalo] Scraping ${type}: ${url}`);
      const html = await fetchPage(url);
      if (!html) {
        logger.warn(`[njuskalo] Failed to fetch ${type}`);
        continue;
      }

      const listings = parseListings(html, type);
      results.push(...listings);
      logger.info(`[njuskalo] Found ${listings.length} ${type} listings`);

      await politeSleep();
    } catch (e) {
      logger.error(`[njuskalo] Error scraping ${type}: ${e.message}`);
    }
  }

  return results;
}

function parseListings(html, type) {
  const $ = cheerio.load(html);
  const listings = [];

  // Njuškalo uses EntityList items
  $(".EntityList--Regular .EntityList-item--Regular, .EntityList-item--VauVau, .EntityList-item--Featured").each(
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
        const location = extractLocation(title + " " + descText);

        const id = `${SOURCE}:${href.replace(/[^a-z0-9]/gi, "_")}`;

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
          description: descText.slice(0, 300),
        });
      } catch (e) {
        logger.warn(`[njuskalo] Failed to parse listing: ${e.message}`);
      }
    }
  );

  return listings;
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

function extractLocation(text) {
  const osijekAreas = [
    "gornji grad", "donji grad", "retfala", "sjenjak", "jug ii", "jug 2",
    "centar", "višnjevac", "visnjevac", "tvrđa", "tvrda", "čepin", "cepin",
    "josipovac", "briješće", "brijesce", "nemetinska", "industrijsko",
  ];

  const lower = text.toLowerCase();
  for (const area of osijekAreas) {
    if (lower.includes(area)) return area;
  }

  return "Osijek";
}
