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
      description TEXT,
      fingerprint TEXT,
      first_seen TEXT DEFAULT (datetime('now')),
      notified INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS favorites (
      listing_id TEXT PRIMARY KEY,
      saved_price REAL,
      added_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_fingerprint ON listings(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_notified ON listings(notified);
    CREATE INDEX IF NOT EXISTS idx_first_seen ON listings(first_seen);
  `);
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
    `INSERT OR IGNORE INTO listings (id, source, url, title, price, size, rooms, location, type, description, fingerprint)
     VALUES (@id, @source, @url, @title, @price, @size, @rooms, @location, @type, @description, @fingerprint)`
  ).run(listing);
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
