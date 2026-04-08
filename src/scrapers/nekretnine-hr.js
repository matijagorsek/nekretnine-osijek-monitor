import * as cheerio from "cheerio";
import { fetchPage, politeSleep } from "../http.js";

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
    const url = SEARCH_URLS[type];
    if (!url) continue;

    console.log(`[nekretnine.hr] Scraping ${type}: ${url}`);
    const html = await fetchPage(url);
    if (!html) {
      console.warn(`[nekretnine.hr] Failed to fetch ${type}`);
      continue;
    }

    const { listings, containerCount } = parseListings(html, type, city);
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
        });
      } catch (e) {
        // Skip
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
