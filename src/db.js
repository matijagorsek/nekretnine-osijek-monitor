import Database from "better-sqlite3";
import { resolve } from "path";

const DB_PATH = resolve(process.env.DB_PATH || "./data/listings.db");

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    migrate();
  }
  return db;
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      price REAL,
      size REAL,
      rooms INTEGER,
      location TEXT,
      type TEXT,
      city TEXT,
      description TEXT,
      image_url TEXT,
      fingerprint TEXT,
      first_seen TEXT DEFAULT (datetime('now')),
      notified INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS favorites (
      listing_id TEXT PRIMARY KEY,
      saved_price REAL,
      added_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_filters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('include', 'exclude')),
      keyword TEXT NOT NULL,
      UNIQUE(type, keyword)
    );

    CREATE TABLE IF NOT EXISTS run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      scrapers_ok INTEGER DEFAULT 0,
      scrapers_failed INTEGER DEFAULT 0,
      total_raw INTEGER DEFAULT 0,
      after_filters INTEGER DEFAULT 0,
      new_listings INTEGER DEFAULT 0,
      scraper_errors TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_fingerprint ON listings(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_image_url ON listings(image_url);
    CREATE INDEX IF NOT EXISTS idx_notified ON listings(notified);
    CREATE INDEX IF NOT EXISTS idx_first_seen ON listings(first_seen);
    CREATE INDEX IF NOT EXISTS idx_city ON listings(city);

    CREATE TABLE IF NOT EXISTS scraper_health (
      key TEXT PRIMARY KEY,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      last_failure TEXT,
      first_failure TEXT,
      last_success TEXT
    );

    CREATE TABLE IF NOT EXISTS listing_price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id TEXT NOT NULL,
      price REAL NOT NULL,
      observed_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_price_history_listing ON listing_price_history(listing_id, observed_at);
    CREATE TABLE IF NOT EXISTS filter_overrides (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    CREATE TABLE IF NOT EXISTS settings (
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Additive migrations — ignore errors if columns already exist
  for (const sql of [
    "ALTER TABLE listings ADD COLUMN amenities TEXT",
    "ALTER TABLE listings ADD COLUMN orientation TEXT",
    "ALTER TABLE listings ADD COLUMN last_seen_at TEXT",
    "ALTER TABLE listings ADD COLUMN status TEXT DEFAULT 'active'",
    "ALTER TABLE listings ADD COLUMN days_on_market REAL",
  ]) {
    try { db.exec(sql); } catch (_) { /* column already exists */ }
  // Migrate existing databases that don't have image_url yet
  try {
    db.exec("ALTER TABLE listings ADD COLUMN image_url TEXT");
  // Migrate existing DBs: add city column if missing
  try {
    db.exec("ALTER TABLE listings ADD COLUMN city TEXT");
  } catch (_) {
    // Column already exists
  // Safe migrations for new tracking columns
  const listingCols = db.prepare("PRAGMA table_info(listings)").all().map(c => c.name);
  if (!listingCols.includes('last_seen')) {
    db.exec("ALTER TABLE listings ADD COLUMN last_seen TEXT");
  }
  if (!listingCols.includes('seen_count')) {
    db.exec("ALTER TABLE listings ADD COLUMN seen_count INTEGER DEFAULT 1");
  }
  try {
    db.exec("ALTER TABLE scraper_health ADD COLUMN last_listing_count INTEGER DEFAULT 0");
  } catch (_) {}
}

/**
 * Record a scraper selector failure. Returns the new consecutive failure count.
 */
export function recordScraperFailure(key, listingCount = 0) {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT * FROM scraper_health WHERE key = ?").get(key);
  if (!existing) {
    db.prepare(
      "INSERT INTO scraper_health (key, consecutive_failures, last_failure, first_failure, last_listing_count) VALUES (?, 1, ?, ?, ?)"
    ).run(key, now, now, listingCount);
    return 1;
  }
  const newCount = existing.consecutive_failures + 1;
  db.prepare(
    "UPDATE scraper_health SET consecutive_failures = ?, last_failure = ?, first_failure = COALESCE(first_failure, ?), last_listing_count = ? WHERE key = ?"
  ).run(newCount, now, now, listingCount, key);
  return newCount;
}

/**
 * Record a scraper success. Returns true if it was previously failing (recovered).
 */
export function recordScraperSuccess(key, listingCount = 0) {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT consecutive_failures FROM scraper_health WHERE key = ?").get(key);
  const wasFailing = !!(existing && existing.consecutive_failures > 0);
  db.prepare(
    `INSERT INTO scraper_health (key, consecutive_failures, last_success, first_failure, last_listing_count)
     VALUES (?, 0, ?, NULL, ?)
     ON CONFLICT(key) DO UPDATE SET consecutive_failures = 0, last_success = ?, first_failure = NULL, last_listing_count = ?`
  ).run(key, now, now, listingCount, now, listingCount);
  return wasFailing;
}

/**
 * Get health record for a single scraper key
 */
export function getScraperHealth(key) {
  const db = getDb();
  return db.prepare("SELECT * FROM scraper_health WHERE key = ?").get(key) || null;
}

/**
 * Get health records for all scrapers
 */
export function getAllScraperHealth() {
 * Get all scraper health rows
 */
export function getScraperHealth() {
  const db = getDb();
  return db.prepare("SELECT * FROM scraper_health ORDER BY key").all();
}

/**
 * Check if a listing already exists (by source+id or by fingerprint for cross-site dedup)
 */
export function listingExists(id, fingerprint) {
  const db = getDb();
  const byId = db.prepare("SELECT 1 FROM listings WHERE id = ?").get(id);
  if (byId) return true;

  if (fingerprint) {
    const byFp = db
      .prepare("SELECT 1 FROM listings WHERE fingerprint = ?")
      .get(fingerprint);
    if (byFp) return true;
  }

  return false;
}

/**
 * Insert a new listing
 */
export function insertListing(listing) {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO listings (id, source, url, title, price, size, rooms, location, type, description, fingerprint, amenities, orientation)
     VALUES (@id, @source, @url, @title, @price, @size, @rooms, @location, @type, @description, @fingerprint, @amenities, @orientation)`
    `INSERT OR IGNORE INTO listings (id, source, url, title, price, size, rooms, location, type, description, image_url, fingerprint)
     VALUES (@id, @source, @url, @title, @price, @size, @rooms, @location, @type, @description, @image_url, @fingerprint)`
    `INSERT OR IGNORE INTO listings (id, source, url, title, price, size, rooms, location, type, city, description, fingerprint)
     VALUES (@id, @source, @url, @title, @price, @size, @rooms, @location, @type, @city, @description, @fingerprint)`
    `INSERT OR IGNORE INTO listings (id, source, url, title, price, size, rooms, location, type, description, fingerprint, first_seen, last_seen)
     VALUES (@id, @source, @url, @title, @price, @size, @rooms, @location, @type, @description, @fingerprint, @first_seen, @last_seen)`
    `INSERT OR IGNORE INTO listings (id, source, url, title, price, size, rooms, location, type, description, fingerprint, amenities, orientation, last_seen_at, status)
     VALUES (@id, @source, @url, @title, @price, @size, @rooms, @location, @type, @description, @fingerprint, @amenities, @orientation, datetime('now'), 'active')`
  ).run(listing);
}

/**
 * Update last_seen and increment seen_count for an existing listing.
 * Returns the previous last_seen value (to detect relisting gaps).
 */
export function updateListingTracking(id) {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT last_seen FROM listings WHERE id = ?").get(id);
  const oldLastSeen = existing?.last_seen ?? null;
  db.prepare(
    "UPDATE listings SET last_seen = ?, seen_count = COALESCE(seen_count, 0) + 1 WHERE id = ?"
  ).run(now, id);
  return oldLastSeen;
}

/**
 * Mark listings as notified
 */
export function markNotified(ids) {
  const db = getDb();
  const stmt = db.prepare("UPDATE listings SET notified = 1 WHERE id = ?");
  const tx = db.transaction(() => {
    for (const id of ids) stmt.run(id);
  });
  tx();
}

/**
 * Get all un-notified listings
 */
export function getUnnotified() {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM listings WHERE notified = 0 ORDER BY first_seen DESC"
    )
    .all();
}

/**
 * Get a single listing by id
 */
export function getListingById(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM listings WHERE id = ?").get(id);
}

/**
 * Update the stored price of an existing listing
 */
export function updateListingPrice(id, newPrice) {
  const db = getDb();
  db.prepare("UPDATE listings SET price = ? WHERE id = ?").run(newPrice, id);
}

/**
 * Record a price observation for a listing
 */
export function insertPriceHistory(listingId, price) {
  const db = getDb();
  db.prepare(
    "INSERT INTO listing_price_history (listing_id, price) VALUES (?, ?)"
  ).run(listingId, price);
}

/**
 * Get all price history entries for a listing, oldest first
 */
export function getPriceHistory(listingId) {
  const db = getDb();
  return db
    .prepare(
      "SELECT price, observed_at FROM listing_price_history WHERE listing_id = ? ORDER BY observed_at ASC"
    )
    .all(listingId);
}

/**
 * Add a listing to favorites
 */
export function addFavorite(listingId, price) {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO favorites (listing_id, saved_price) VALUES (?, ?)"
  ).run(listingId, price ?? null);
}

/**
 * Remove a listing from favorites
 */
export function removeFavorite(listingId) {
  const db = getDb();
  db.prepare("DELETE FROM favorites WHERE listing_id = ?").run(listingId);
}

/**
 * Check if a listing is a favorite
 */
export function isFavorite(listingId) {
  const db = getDb();
  return !!db.prepare("SELECT 1 FROM favorites WHERE listing_id = ?").get(listingId);
}

/**
 * Add a user-defined keyword filter
 */
export function addUserFilter(type, keyword) {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO user_filters (type, keyword) VALUES (?, ?)").run(type, keyword.toLowerCase().trim());
}

/**
 * Remove a user-defined keyword filter
 */
export function removeUserFilter(type, keyword) {
  const db = getDb();
  db.prepare("DELETE FROM user_filters WHERE type = ? AND keyword = ?").run(type, keyword.toLowerCase().trim());
}

/**
 * Get all user-defined keyword filters, optionally by type
 */
export function getUserFilters(type) {
  const db = getDb();
  return db.prepare("SELECT * FROM user_filters WHERE type = ? ORDER BY keyword").all(type);
}

/**
 * Set a numeric filter override (priceMin, priceMax, sizeMin, sizeMax, roomsMin, roomsMax)
 */
export function setFilterOverride(key, value) {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO filter_overrides (key, value) VALUES (?, ?)").run(key, String(value));
}

/**
 * Get all filter overrides as an array of {key, value}
 */
export function getAllFilterOverrides() {
  const db = getDb();
  return db.prepare("SELECT key, value FROM filter_overrides").all();
}

/**
 * Clear all filter overrides (revert to env-var defaults)
 */
export function clearAllFilterOverrides() {
  const db = getDb();
  db.prepare("DELETE FROM filter_overrides").run();
}

/**
 * Record a pipeline run's statistics
 */
export function recordRunLog(log) {
  const db = getDb();
  db.prepare(
    `INSERT INTO run_logs (started_at, finished_at, scrapers_ok, scrapers_failed, total_raw, after_filters, new_listings, scraper_errors)
     VALUES (@startedAt, @finishedAt, @scrapersOk, @scrapersFailed, @totalRaw, @afterFilters, @newListings, @scraperErrors)`
  ).run(log);
}

/**
 * Get the most recent pipeline run logs
 */
export function getRecentRunLogs(limit = 10) {
  const db = getDb();
  return db.prepare("SELECT * FROM run_logs ORDER BY id DESC LIMIT ?").all(limit);
}

/**
 * Get health status for all scrapers
 */
export function getScraperHealth() {
  const db = getDb();
  return db.prepare("SELECT * FROM scraper_health ORDER BY key").all();
 * Get or set a persistent setting value
 */
export function getSetting(key) {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  const db = getDb();
  if (value === null || value === undefined) {
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  } else {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, String(value));
  }
}

/**
 * Get the most recently seen listings
 */
export function getRecentListings(limit = 5) {
  const db = getDb();
  return db.prepare("SELECT * FROM listings ORDER BY first_seen DESC LIMIT ?").all(limit);
 * Get aggregate market statistics for the trailing 7 days (weekly digest)
 */
export function getWeeklyDigestStats() {
  const db = getDb();
  const overall = db.prepare(`
    SELECT COUNT(*) AS total,
           AVG(price) AS avgPrice,
           MIN(price) AS minPrice,
           MAX(price) AS maxPrice,
           SUM(CASE WHEN notified = 1 THEN 1 ELSE 0 END) AS notifiedCount
    FROM listings
    WHERE first_seen >= datetime('now', '-7 days')
  `).get();

  const bySource = db.prepare(`
    SELECT source, COUNT(*) AS count, AVG(price) AS avgPrice
    FROM listings
    WHERE first_seen >= datetime('now', '-7 days')
    GROUP BY source
    ORDER BY count DESC
  `).all();

  const byLocation = db.prepare(`
    SELECT location, COUNT(*) AS count, AVG(price) AS avgPrice
    FROM listings
    WHERE first_seen >= datetime('now', '-7 days')
      AND location IS NOT NULL AND location != ''
    GROUP BY location
    ORDER BY count DESC
    LIMIT 10
  `).all();

  return { ...overall, bySource, byLocation };
 * Get the snoozed_until ISO timestamp (or null if not set / expired)
 */
export function getSnoozedUntil() {
  const db = getDb();
  const row = db.prepare("SELECT value FROM app_config WHERE key = 'snoozed_until'").get();
  return row ? row.value : null;
}

/**
 * Persist a snoozed_until ISO timestamp
 */
export function setSnoozedUntil(isoString) {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO app_config (key, value) VALUES ('snoozed_until', ?)").run(isoString);
}

/**
 * Get all favorited listings with their full data
 */
export function getFavorites() {
  const db = getDb();
  return db
    .prepare(
      `SELECT l.*, f.saved_price AS fav_saved_price, f.added_at AS fav_added_at
       FROM favorites f
       JOIN listings l ON l.id = f.listing_id`
    )
    .all();
}

/**
 * Search the listings archive by keyword, price, and rooms filters.
 * Returns { rows, total } for pagination.
 */
export function searchListings({ keywords = [], priceMin, priceMax, rooms } = {}, limit = 5, offset = 0) {
  const db = getDb();
  const conditions = [];
  const bindings = [];

  if (priceMin != null) { conditions.push("price >= ?"); bindings.push(priceMin); }
  if (priceMax != null) { conditions.push("price <= ?"); bindings.push(priceMax); }
  if (rooms != null) { conditions.push("rooms = ?"); bindings.push(rooms); }

  for (const kw of keywords) {
    conditions.push("(LOWER(title) LIKE ? OR LOWER(location) LIKE ?)");
    bindings.push(`%${kw}%`, `%${kw}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM listings ${where} ORDER BY first_seen DESC LIMIT ? OFFSET ?`).all(...bindings, limit, offset);
  const { cnt } = db.prepare(`SELECT COUNT(*) as cnt FROM listings ${where}`).get(...bindings);
  return { rows, total: cnt };
 * Update last_seen_at to now for all given listing ids
 */
export function updateLastSeen(ids) {
  if (!ids.length) return;
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare("UPDATE listings SET last_seen_at = ? WHERE id = ?");
  const tx = db.transaction(() => {
    for (const id of ids) stmt.run(now, id);
  });
  tx();
}

/**
 * Mark active listings from successful sources that were not seen in the current run as sold.
 * Records days_on_market = days between first_seen and last_seen_at.
 * Returns the number of tombstoned listings.
 */
export function tombstoneExpiredListings(seenIds, successfulSources) {
  if (!successfulSources.length) return 0;
  const db = getDb();
  const seenSet = new Set(seenIds);
  const placeholders = successfulSources.map(() => "?").join(",");
  const active = db.prepare(
    `SELECT id, first_seen, last_seen_at FROM listings WHERE (status = 'active' OR status IS NULL) AND source IN (${placeholders})`
  ).all(...successfulSources);
  const toTombstone = active.filter(l => !seenSet.has(l.id));
  if (!toTombstone.length) return 0;
  const stmt = db.prepare(
    "UPDATE listings SET status = 'sold', days_on_market = ? WHERE id = ?"
  );
  const tx = db.transaction(() => {
    for (const l of toTombstone) {
      const lastSeen = l.last_seen_at || l.first_seen;
      const dom = lastSeen
        ? Math.round((new Date(lastSeen) - new Date(l.first_seen)) / (1000 * 60 * 60 * 24))
        : 0;
      stmt.run(dom, l.id);
    }
  });
  tx();
  return toTombstone.length;
}

/**
 * Return average days-on-market per neighbourhood for sold listings.
 * Ordered by fastest-selling first.
 */
export function getMarketVelocityStats() {
  const db = getDb();
  return db.prepare(
    `SELECT location, COUNT(*) AS sold_count, ROUND(AVG(days_on_market), 1) AS avg_days
     FROM listings
     WHERE status = 'sold' AND days_on_market IS NOT NULL AND location IS NOT NULL
     GROUP BY location
     ORDER BY avg_days ASC`
  ).all();
}
