import * as cheerio from "cheerio";
import { fetchPage, politeSleep } from "../http.js";

const SOURCE = "oglasnik";

function getUrls(city) {
  return {
    stan: `https://www.oglasnik.hr/nekretnine/stambeni-prostori/stanovi/prodaja/?location=${city}`,
    kuca: `https://www.oglasnik.hr/nekretnine/kuce/prodaja/?location=${city}`,
  };
}

export async function scrape(filterType = "all", city = "osijek") {
  const results = [];
  const types = filterType === "all" ? ["stan", "kuca"] : [filterType];
  const SEARCH_URLS = getUrls(city);

  for (const type of types) {
    const url = SEARCH_URLS[type];
    if (!url) continue;

    console.log(`[oglasnik] Scraping ${type}: ${url}`);
    const html = await fetchPage(url);
    if (!html) {
      console.warn(`[oglasnik] Failed to fetch ${type}`);
      continue;
    }

    const listings = parseListings(html, type, city);
    results.push(...listings);
    console.log(`[oglasnik] Found ${listings.length} ${type} listings`);

    await politeSleep();
  }

  return results;
}

function parseListings(html, type, city) {
  const $ = cheerio.load(html);
  const listings = [];

  $(".oglas-item, .listing-item, .ad-item, article.oglas, [class*='oglas-']").each((_, el) => {
    try {
      const $el = $(el);

      const $link = $el.find("a[href*='/oglas/'], a[href*='/nekretnin'], a.title-link, h2 a, h3 a").first();
      const href = $link.attr("href");
      if (!href) return;

      const title =
        $el.find(".oglas-title, .title, h2, h3").first().text().trim() ||
        $link.text().trim();
      if (!title || title.length < 5) return;

      const url = href.startsWith("http") ? href : `https://www.oglasnik.hr${href}`;

      const priceText = $el.find(".price, .cijena, [class*='price'], [class*='cijena']").first().text().trim();
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
        city,
        description: infoText.slice(0, 300),
      });
    } catch (e) {
      // Skip malformed listings
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

function extractLocation(text, city = "osijek") {
  const areas = [
    "gornji grad", "donji grad", "retfala", "sjenjak", "jug ii", "jug 2",
    "centar", "višnjevac", "visnjevac", "tvrđa", "tvrda", "čepin", "cepin",
    "josipovac", "briješće", "brijesce", "nemetinska",
  ];
  const lower = text.toLowerCase();
  if (city === "osijek") {
    for (const a of areas) if (lower.includes(a)) return a;
  }
  return city.charAt(0).toUpperCase() + city.slice(1);
}
