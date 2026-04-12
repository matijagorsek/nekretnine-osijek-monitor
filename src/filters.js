import { config } from "./config.js";
import { getUserFilters } from "./db.js";

/**
 * Apply all configured filters to a list of listings.
 * Returns only listings matching ALL criteria.
 */
export function applyFilters(listings) {
  const { filters } = config;

  return listings.filter((l) => {
    // City filter - restrict to configured cities
    if (filters.cities.length > 0 && l.city) {
      if (!filters.cities.includes(l.city.toLowerCase())) return false;
    }

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

    // Location filter (if specific locations are set, only apply to primary city)
    if (filters.locations.length > 0 && l.location) {
      if (!l.city || l.city === filters.city) {
        const locLower = l.location.toLowerCase();
        const matches = filters.locations.some(
          (fl) => locLower.includes(fl) || fl.includes(locLower)
        );
        if (!matches) return false;
      }
    }

    // Neighborhood filter (only apply to primary city)
    if (filters.neighborhoods.length > 0 && l.location) {
      if (!l.city || l.city === filters.city) {
        const locLower = l.location.toLowerCase();
        const matches = filters.neighborhoods.some(
          (n) => locLower.includes(n) || n.includes(locLower)
        );
        if (!matches) return false;
      }
    }

    // Neighborhood filter
    if (filters.neighborhoods.length > 0 && l.location) {
      const locLower = l.location.toLowerCase();
      const matches = filters.neighborhoods.some(
        (n) => locLower.includes(n) || n.includes(locLower)
      );
      if (!matches) return false;
    }

    // Amenities filter — listing must mention all required amenities
    if (filters.amenities.length > 0) {
      const listingAmenities = l.amenities
        ? JSON.parse(l.amenities).map((a) => a.toLowerCase())
        : [];
      const hasAll = filters.amenities.every((required) =>
        listingAmenities.some((a) => a.includes(required) || required.includes(a))
      );
      if (!hasAll) return false;
    }

    // Orientation filter — listing orientation must be one of the allowed values
    if (filters.orientations.length > 0) {
      if (!l.orientation) return false;
      const orient = l.orientation.toLowerCase();
      if (!filters.orientations.some((o) => orient.includes(o) || o.includes(orient))) return false;
    }

    return true;
  });
}

/**
 * Check whether a listing matches a user-defined trigger's criteria.
 */
export function matchesTrigger(listing, trigger) {
  if (trigger.type && trigger.type !== "all" && listing.type && listing.type !== trigger.type) return false;
  if (listing.price != null) {
    if (trigger.priceMin != null && listing.price < trigger.priceMin) return false;
    if (trigger.priceMax != null && listing.price > trigger.priceMax) return false;
  }
  if (listing.size != null) {
    if (trigger.sizeMin != null && listing.size < trigger.sizeMin) return false;
    if (trigger.sizeMax != null && listing.size > trigger.sizeMax) return false;
  }
  if (listing.rooms != null) {
    if (trigger.roomsMin != null && listing.rooms < trigger.roomsMin) return false;
    if (trigger.roomsMax != null && listing.rooms > trigger.roomsMax) return false;
  }
  if (trigger.locations && trigger.locations.length > 0 && listing.location) {
    const locLower = listing.location.toLowerCase();
    if (!trigger.locations.some((tl) => locLower.includes(tl.toLowerCase()) || tl.toLowerCase().includes(locLower))) return false;
  }
  return true;
}

/**
 * Sort listings by the configured field and order.
 */
export function applySort(listings) {
  const { sortBy, sortOrder } = config.filters;

  if (!sortBy || sortBy === "none") return listings;

  return [...listings].sort((a, b) => {
    const aVal = a[sortBy] ?? 0;
    const bVal = b[sortBy] ?? 0;
    return sortOrder === "desc" ? bVal - aVal : aVal - bVal;
  });
}
