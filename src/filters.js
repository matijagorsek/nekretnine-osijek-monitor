import { config } from "./config.js";

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

    // Location filter (if specific locations are set)
    if (filters.locations.length > 0 && l.location) {
      const locLower = l.location.toLowerCase();
      const matches = filters.locations.some(
        (fl) => locLower.includes(fl) || fl.includes(locLower)
      );
      if (!matches) return false;
    }

    return true;
  });
}
