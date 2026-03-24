/**
 * Generate a fingerprint for cross-site deduplication.
 *
 * Strategy: normalize key attributes into a canonical string.
 * Two listings are considered the same if they share similar:
 *   - price (within 2% tolerance)
 *   - size (within 2m² tolerance)
 *   - location (normalized)
 *   - type
 *
 * The fingerprint is: `{type}|{priceRange}|{sizeRange}|{normalizedLocation}`
 */

const PRICE_BUCKET = 2000; // round to nearest 2k EUR
const SIZE_BUCKET = 3; // round to nearest 3 m²

export function generateFingerprint(listing) {
  const parts = [
    normalizeType(listing.type),
    bucketize(listing.price, PRICE_BUCKET),
    bucketize(listing.size, SIZE_BUCKET),
    normalizeLocation(listing.location),
  ];

  return parts.join("|");
}

/**
 * More advanced similarity check for listings that have similar but not identical fingerprints.
 * Returns a score 0-1.
 */
export function similarityScore(a, b) {
  let score = 0;
  let weights = 0;

  // Price similarity (weight: 3)
  if (a.price && b.price) {
    const priceDiff = Math.abs(a.price - b.price) / Math.max(a.price, b.price);
    score += (1 - Math.min(priceDiff, 1)) * 3;
    weights += 3;
  }

  // Size similarity (weight: 3)
  if (a.size && b.size) {
    const sizeDiff = Math.abs(a.size - b.size) / Math.max(a.size, b.size);
    score += (1 - Math.min(sizeDiff, 1)) * 3;
    weights += 3;
  }

  // Rooms match (weight: 2)
  if (a.rooms && b.rooms) {
    score += (a.rooms === b.rooms ? 1 : 0) * 2;
    weights += 2;
  }

  // Location similarity (weight: 2)
  if (a.location && b.location) {
    const locA = normalizeLocation(a.location);
    const locB = normalizeLocation(b.location);
    score += (locA === locB ? 1 : locA.includes(locB) || locB.includes(locA) ? 0.7 : 0) * 2;
    weights += 2;
  }

  // Title similarity via word overlap (weight: 1)
  if (a.title && b.title) {
    score += wordOverlap(a.title, b.title) * 1;
    weights += 1;
  }

  return weights > 0 ? score / weights : 0;
}

/**
 * Check a new listing against all existing for duplicates
 */
export function isDuplicate(newListing, existingListings, threshold = 0.85) {
  for (const existing of existingListings) {
    if (similarityScore(newListing, existing) >= threshold) {
      return { isDupe: true, matchedWith: existing };
    }
  }
  return { isDupe: false };
}

// ─── Helpers ───

function normalizeType(type) {
  if (!type) return "unknown";
  const t = type.toLowerCase().trim();
  if (t.includes("stan") || t.includes("apartm")) return "stan";
  if (t.includes("kuc") || t.includes("kući") || t.includes("house")) return "kuca";
  return t;
}

function normalizeLocation(loc) {
  if (!loc) return "";
  return loc
    .toLowerCase()
    .replace(/osijek/gi, "")
    .replace(/[,\-\/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Common variations
    .replace(/retfala nova/g, "retfala")
    .replace(/gornji grad/g, "gornji-grad")
    .replace(/donji grad/g, "donji-grad")
    .replace(/jug\s*ii/g, "jug2")
    .replace(/jug\s*2/g, "jug2");
}

function bucketize(value, bucket) {
  if (!value || isNaN(value)) return "0";
  return String(Math.round(value / bucket) * bucket);
}

function wordOverlap(a, b) {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  if (setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  for (const w of setA) if (setB.has(w)) overlap++;
  return overlap / Math.max(setA.size, setB.size);
}
