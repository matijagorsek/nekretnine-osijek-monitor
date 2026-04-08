import { config } from "./config.js";
import { getUserFilters } from "./db.js";

/**
 * Apply all configured filters to a list of listings.
 * Returns only listings matching ALL criteria.
 */
export function applyFilters(listings) {
  const { filters } = config;

  return listings.filter((l) => {
    // Type filter
    if (filters.type !== "all" && l.type && l.type !== filters.type) return false;

    // Price range
    if (l.price) {
      if (filters.priceMin && l.price < filters.priceMin) return false;
      if (filters.priceMax && l.price > filters.priceMax) return false;
    }

    // Size range
    if (l.size) {
      if (filters.sizeMin && l.size < filters.sizeMin) return false;
      if (filters.sizeMax && l.size > filters.sizeMax) return false;
    }

    // Rooms range
    if (l.rooms) {
      if (filters.roomsMin && l.rooms < filters.roomsMin) return false;
      if (filters.roomsMax && l.rooms > filters.roomsMax) return false;
    }

    // Floor range
    if (l.floor != null) {
      if (filters.floorMin != null && l.floor < filters.floorMin) return false;
      if (filters.floorMax != null && l.floor > filters.floorMax) return false;
    }

    // Location filter (if specific locations are set)
    if (filters.locations.length > 0 && l.location) {
      const locLower = l.location.toLowerCase();
      const matches = filters.locations.some(
        (fl) => locLower.includes(fl) || fl.includes(locLower)
      );
      if (!matches) return false;
    }

    // Keyword include filters (at least one must match if any defined)
    const includeKeywords = [
      ...filters.keywords,
      ...getUserFilters("include").map((f) => f.keyword),
    ];
    if (includeKeywords.length > 0) {
      const searchText = `${l.title || ""} ${l.description || ""}`.toLowerCase();
      if (!includeKeywords.some((kw) => searchText.includes(kw))) return false;
    }

    // Keyword exclude filters (none must match)
    const excludeKeywords = [
      ...filters.excludeKeywords,
      ...getUserFilters("exclude").map((f) => f.keyword),
    ];
    if (excludeKeywords.length > 0) {
      const searchText = `${l.title || ""} ${l.description || ""}`.toLowerCase();
      if (excludeKeywords.some((kw) => searchText.includes(kw))) return false;
    }

    return true;
  });
}

/**
 * Sort listings by the configured sort field and order.
 */
export function applySorting(listings) {
  const { by, order } = config.sort;
  const dir = order === "asc" ? 1 : -1;

  return [...listings].sort((a, b) => {
    let aVal, bVal;

    if (by === "price") {
      aVal = a.price ?? -Infinity;
      bVal = b.price ?? -Infinity;
    } else if (by === "size") {
      aVal = a.size ?? -Infinity;
      bVal = b.size ?? -Infinity;
    } else {
      // date — use dateAdded if present, fall back to insertion order (stable)
      aVal = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
      bVal = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
    }

    if (aVal < bVal) return -dir;
    if (aVal > bVal) return dir;
    return 0;
  });
}
