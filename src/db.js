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
