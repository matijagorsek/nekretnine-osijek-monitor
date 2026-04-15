import * as cheerio from "cheerio";
import { fetchPage, politeSleep } from "../http.js";

const SOURCE = "4zida";

function getUrls(city) {
  return {
    stan: `https://www.4zida.hr/prodaja-stanova/${city}`,
    kuca: `https://www.4zida.hr/prodaja-kuca/${city}`,
  };
}

export async function scrape(filterType = "all", city = "osijek") {
  const results = [];
  let totalContainerCount = 0;
  const types = filterType === "all" ? ["stan", "kuca"] : [filterType];
  const SEARCH_URLS = getUrls(city);

  for (const type of types) {
    const url = SEARCH_URLS[type];
    if (!url) continue;

    console.log(`[4zida] Scraping ${type} in ${city}: ${url}`);
    const html = await fetchPage(url);
    if (!html) {
      console.warn(`[4zida] Failed to fetch ${type}`);
      continue;
    }

    const { listings, containerCount } = parseListings(html, type, city);
    results.push(...listings);
    totalContainerCount += containerCount;
    console.log(`[4zida] Found ${listings.length} ${type} listings`);

    await politeSleep();
  }

  return { listings: results, containerCount: totalContainerCount };
}

function parseListings(html, type, city = "osijek") {
  const $ = cheerio.load(html);
  const listings = [];

  const containers = $(".property-card, .ad-card, .search-result-item, article[class*='property'], [class*='listing-card']");
  const containerCount = containers.length;
  containers.each((_, el) => {
    try {
      const $el = $(el);

      const $link = $el.find("a[href*='/prodaja/'], a[href*='/stan/'], a[href*='/kuca/'], a").first();
      const href = $link.attr("href");
      if (!href) return;

      const title =
        $el.find(".property-title, .ad-title, h2, h3, .title").first().text().trim() ||
        $link.text().trim();
      if (!title || title.length < 5) return;

      const url = href.startsWith("http") ? href : `https://www.4zida.hr${href}`;

      const priceText = $el.find(".price, [class*='price'], [class*='cijena']").first().text().trim();
      const price = parsePrice(priceText);

      const infoText = $el.text();
      const size = extractSize(infoText);
      const rooms = extractRooms(infoText);
      const location = extractLocation(infoText, city);

      const imgEl = $el.find(".property-image img, .ad-image img, img").first();
      const imgSrc = imgEl.attr("src") || imgEl.attr("data-src") || null;
      const rawImgUrl = imgSrc && !imgSrc.startsWith("data:") ? imgSrc : null;
      const image_url = rawImgUrl && !rawImgUrl.startsWith("http") ? `https://www.4zida.hr${rawImgUrl}` : rawImgUrl;

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
      // Skip malformed listings
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

function extractLocation(text) {
  const areas = [
    "gornji grad", "donji grad", "retfala", "sjenjak", "jug ii", "jug 2",
    "centar", "višnjevac", "visnjevac", "tvrđa", "tvrda", "čepin", "cepin",
    "josipovac", "briješće", "brijesce", "nemetinska",
  ];
  const lower = text.toLowerCase();
  for (const a of areas) if (lower.includes(a)) return a;
  return "Osijek";
function extractLocation(text, city = "osijek") {
  if (city === "osijek") {
    const areas = [
      "gornji grad", "donji grad", "retfala", "sjenjak", "jug ii", "jug 2",
      "centar", "višnjevac", "visnjevac", "tvrđa", "tvrda", "čepin", "cepin",
      "josipovac", "briješće", "brijesce", "nemetinska",
    ];
    const lower = text.toLowerCase();
    for (const a of areas) if (lower.includes(a)) return a;
  }
  return city.charAt(0).toUpperCase() + city.slice(1);
}
