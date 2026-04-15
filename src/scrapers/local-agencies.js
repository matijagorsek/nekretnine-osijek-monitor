import * as cheerio from "cheerio";
import { fetchPage, politeSleep } from "../http.js";
import { logger } from "../logger.js";

const SOURCE = "local_agency";

/**
 * List of local Osijek agencies with their search pages.
 * 
 * Add/remove agencies here as needed. Each needs:
 *   - name: display name
 *   - url: search results URL for Osijek properties
 *   - parseListings: custom parser function
 * 
 * If an agency changes their site layout, only the parser for that agency
 * needs updating.
 */
const AGENCIES = [
  {
    name: "Maestro nekretnine",
    url: "https://www.maestro-nekretnine.hr/nekretnine?grad=osijek&tip=prodaja",
    selectors: {
      item: ".property-item, .nekretnina-item, article, .card",
      link: "a[href*='nekretnin'], a[href*='property'], a",
      title: "h2, h3, .title, .name",
      price: ".price, .cijena, [class*='price']",
      image: ".property-image img, .card-image img, img",
    },
  },
  {
    name: "Apolonija nekretnine",
    url: "https://www.apolonija-nekretnine.hr/nekretnine/osijek/prodaja",
    selectors: {
      item: ".property-item, .nekretnina, article, .card, .oglas",
      link: "a[href*='nekretnin'], a[href*='property'], a",
      title: "h2, h3, .title",
      price: ".price, .cijena, [class*='price']",
      image: ".property-image img, .card-image img, img",
    },
  },
  {
    name: "Premia nekretnine",
    url: "https://www.premia.hr/nekretnine?lokacija=osijek&transakcija=prodaja",
    selectors: {
      item: ".property-item, .nekretnina, article, .listing-item, .card",
      link: "a[href*='nekretnin'], a",
      title: "h2, h3, .title",
      price: ".price, .cijena",
      image: ".property-image img, .card-image img, img",
    },
  },
];

export async function scrape(filterType = "all", city = "osijek") {
  if (city !== "osijek") return [];
  const results = [];
  let totalContainerCount = 0;

  for (const agency of AGENCIES) {
    try {
      logger.info(`[local:${agency.name}] Scraping: ${agency.url}`);
      const html = await fetchPage(agency.url);

      if (!html) {
        logger.warn(`[local:${agency.name}] Failed to fetch`);
        continue;
      }

      const { listings, containerCount } = parseGenericListings(html, agency);
      results.push(...listings);
      totalContainerCount += containerCount;
      console.log(`[local:${agency.name}] Found ${listings.length} listings`);

      await politeSleep(2000, 5000); // Extra polite with local agencies
    } catch (e) {
      logger.error(`[local:${agency.name}] Error: ${e.message}`);
    }
  }

  return { listings: results, containerCount: totalContainerCount };
}

function parseGenericListings(html, agency) {
  const $ = cheerio.load(html);
  const listings = [];
  const { selectors, name: agencyName } = agency;

  const containers = $(selectors.item);
  const containerCount = containers.length;
  containers.each((_, el) => {
    try {
      const $el = $(el);

      const $link = $el.find(selectors.link).first();
      const href = $link.attr("href");
      if (!href) return;

      const title =
        $el.find(selectors.title).first().text().trim() ||
        $link.text().trim();

      if (!title || title.length < 5) return;

      const baseUrl = new URL(agency.url).origin;
      const url = href.startsWith("http") ? href : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;

      const priceText = $el.find(selectors.price).first().text().trim();
      const price = parsePrice(priceText);

      const infoText = $el.text();
      const size = extractSize(infoText);
      const rooms = extractRooms(infoText);
      const location = extractLocation(infoText);
      const type = guessType(infoText);

      const imgSelector = selectors.image || "img";
      const imgEl = $el.find(imgSelector).first();
      const imgSrc = imgEl.attr("src") || imgEl.attr("data-src") || null;
      const rawImgUrl = imgSrc && !imgSrc.startsWith("data:") ? imgSrc : null;
      const baseUrl = new URL(agency.url).origin;
      const image_url = rawImgUrl && !rawImgUrl.startsWith("http") ? `${baseUrl}${rawImgUrl.startsWith("/") ? "" : "/"}${rawImgUrl}` : rawImgUrl;

      const id = `${SOURCE}:${agencyName.replace(/\s/g, "_")}:${href.replace(/[^a-z0-9]/gi, "_")}`;

      listings.push({
        id,
        source: `${SOURCE}:${agencyName}`,
        url,
        title: title.slice(0, 200),
        price,
        size,
        rooms,
        location,
        type,
        city: "osijek",
        description: infoText.slice(0, 300),
        amenities: extractAmenities(infoText),
        orientation: extractOrientation(infoText),
        image_url,
      });
    } catch (e) {
      logger.warn(`[local:${agencyName}] Failed to parse listing: ${e.message}`);
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

function extractLocation(text) {
  const areas = [
    "gornji grad", "donji grad", "retfala", "sjenjak", "jug ii", "jug 2",
    "centar", "višnjevac", "tvrđa", "čepin", "josipovac",
  ];
  const lower = text.toLowerCase();
  for (const a of areas) if (lower.includes(a)) return a;
  return "Osijek"; // local-agencies are always Osijek
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

function guessType(text) {
  const lower = text.toLowerCase();
  if (lower.includes("kuć") || lower.includes("kuc")) return "kuca";
  if (lower.includes("stan")) return "stan";
  return "unknown";
}
