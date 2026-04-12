import * as cheerio from "cheerio";
import { fetchPage, politeSleep } from "../http.js";

const SOURCE = "oglasnik";

const SEARCH_URLS = {
  stan: "https://www.oglasnik.hr/nekretnine/stambeni-prostori/stanovi/prodaja/?location=osijek",
  kuca: "https://www.oglasnik.hr/nekretnine/kuce/prodaja/?location=osijek",
};

export async function scrape(filterType = "all") {
  const results = [];
  const types = filterType === "all" ? ["stan", "kuca"] : [filterType];

  for (const type of types) {
    const url = SEARCH_URLS[type];
    if (!url) continue;

    console.log(`[oglasnik] Scraping ${type}: ${url}`);
    const html = await fetchPage(url);
    if (!html) {
      console.warn(`[oglasnik] Failed to fetch ${type}`);
      continue;
    }

    const listings = parseListings(html, type);
    results.push(...listings);
    console.log(`[oglasnik] Found ${listings.length} ${type} listings`);

    await politeSleep();
  }

  return results;
}

function parseListings(html, type) {
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
      const location = extractLocation(infoText);

      const imgEl = $el.find(".oglas-slika img, .ad-image img, img").first();
      const imgSrc = imgEl.attr("src") || imgEl.attr("data-src") || null;
      const rawImgUrl = imgSrc && !imgSrc.startsWith("data:") ? imgSrc : null;
      const image_url = rawImgUrl && !rawImgUrl.startsWith("http") ? `https://www.oglasnik.hr${rawImgUrl}` : rawImgUrl;

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
        image_url,
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
}
