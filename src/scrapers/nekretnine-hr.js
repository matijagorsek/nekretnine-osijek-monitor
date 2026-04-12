import * as cheerio from "cheerio";
import { fetchPage, politeSleep } from "../http.js";
import { logger } from "../logger.js";

const SOURCE = "nekretnine_hr";

const COUNTY_MAP = {
  osijek: "osjecko-baranjska-zupanija",
  zagreb: "grad-zagreb",
  split: "splitsko-dalmatinska-zupanija",
  rijeka: "primorsko-goranska-zupanija",
  zadar: "zadarska-zupanija",
  pula: "istarska-zupanija",
};

function getUrls(city) {
  const county = COUNTY_MAP[city] || city;
  return {
    stan: `https://www.nekretnine.hr/prodaja/stanovi/${county}/${city}/`,
    kuca: `https://www.nekretnine.hr/prodaja/kuce/${county}/${city}/`,
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

      logger.info(`[nekretnine.hr] Scraping ${type} in ${city}: ${url}`);
      const html = await fetchPage(url);
      if (!html) {
        logger.warn(`[nekretnine.hr] Failed to fetch ${type}`);
        continue;
      }

      const listings = parseListings(html, type, city);
      results.push(...listings);
      logger.info(`[nekretnine.hr] Found ${listings.length} ${type} listings`);

      await politeSleep();
    } catch (e) {
      logger.error(`[nekretnine.hr] Error scraping ${type}: ${e.message}`);
    }

    const { listings, containerCount } = parseListings(html, type);
    results.push(...listings);
    totalContainerCount += containerCount;
    console.log(`[nekretnine.hr] Found ${listings.length} ${type} listings`);

    await politeSleep();
  }

  return { listings: results, containerCount: totalContainerCount };
}

function parseListings(html, type, city) {
  const $ = cheerio.load(html);
  const listings = [];

  // Nekretnine.hr uses card-based layout
  const containers = $(".property-card, .entity-body, [class*='oglas'], .card-listing, .advert-list .advert");
  const containerCount = containers.length;
  containers.each(
    (_, el) => {
      try {
        const $el = $(el);

        const $link = $el.find("a[href*='/prodaja/']").first();
        const title = $el.find(".property-title, .card-title, h3, h2").first().text().trim() ||
          $link.text().trim();
        const href = $link.attr("href");
        if (!href) return;

        const url = href.startsWith("http") ? href : `https://www.nekretnine.hr${href}`;

        const priceText = $el.find(".price, [class*='price'], [class*='cijena']").first().text().trim();
        const price = parsePrice(priceText);

        const infoText = $el.text();
        const size = extractSize(infoText);
        const rooms = extractRooms(infoText);
        const location = extractLocation(infoText, city);

        const imgEl = $el.find(".property-image img, .card-image img, img").first();
        const imgSrc = imgEl.attr("src") || imgEl.attr("data-src") || null;
        const rawImgUrl = imgSrc && !imgSrc.startsWith("data:") ? imgSrc : null;
        const image_url = rawImgUrl && !rawImgUrl.startsWith("http") ? `https://www.nekretnine.hr${rawImgUrl}` : rawImgUrl;

        const id = `${SOURCE}:${href.replace(/[^a-z0-9]/gi, "_")}`;

        listings.push({
          id,
          source: SOURCE,
          url,
          title: (title || `Nekretnina u ${city.charAt(0).toUpperCase() + city.slice(1)}`).slice(0, 200),
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
        logger.warn(`[nekretnine.hr] Failed to parse listing: ${e.message}`);
      }
    }
  );

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
    "centar", "višnjevac", "tvrđa", "čepin", "josipovac",
  ];
  const lower = text.toLowerCase();
  if (city === "osijek") {
    for (const a of areas) if (lower.includes(a)) return a;
  }
  return city.charAt(0).toUpperCase() + city.slice(1);
}
