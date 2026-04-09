import * as cheerio from "cheerio";
import { fetchPage, politeSleep } from "../http.js";

const SOURCE = "crozilla";

const SEARCH_URLS = {
  stan: "https://www.crozilla.com/prodaja/stanovi/grad-osijek/",
  kuca: "https://www.crozilla.com/prodaja/kuce/grad-osijek/",
};

export async function scrape(filterType = "all") {
  const results = [];
  const types = filterType === "all" ? ["stan", "kuca"] : [filterType];

  for (const type of types) {
    try {
      const url = SEARCH_URLS[type];
      if (!url) continue;

      console.log(`[crozilla] Scraping ${type}: ${url}`);
      const html = await fetchPage(url);
      if (!html) {
        console.warn(`[crozilla] Failed to fetch ${type}`);
        continue;
      }

      const listings = parseListings(html, type);
      results.push(...listings);
      console.log(`[crozilla] Found ${listings.length} ${type} listings`);

      await politeSleep();
    } catch (e) {
      console.error(`[crozilla] Error scraping ${type}: ${e.message}`);
    }
  }

  return results;
}

function parseListings(html, type) {
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
      console.warn(`[crozilla] Failed to parse listing: ${e.message}`);
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
