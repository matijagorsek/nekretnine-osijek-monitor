import "dotenv/config";
import { logger } from "./logger.js";

const REQUIRED = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  logger.error(`FATAL: missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

import cron from "node-cron";
import { mkdirSync } from "fs";
import { config } from "./config.js";
import {
  getDb, listingExists, insertListing, markNotified, getUnnotified,
  getListingById, updateListingPrice, addFavorite, removeFavorite, isFavorite, getFavorites,
  addUserFilter, removeUserFilter, getUserFilters, recordRunLog, getRecentRunLogs,
} from "./db.js";
import { generateFingerprint, isDuplicate } from "./dedupe.js";
import { applyFilters, applySorting } from "./filters.js";
import {
  notifyNewListings, sendTestMessage, notifyPriceDrop, notifySimilarListing,
  startPolling, answerCallbackQuery, sendFilterStatus, sendStats,
} from "./telegram.js";

// Scrapers
import * as njuskalo from "./scrapers/njuskalo.js";
import * as indexOglasi from "./scrapers/index-oglasi.js";
import * as nekretnineHr from "./scrapers/nekretnine-hr.js";
import * as localAgencies from "./scrapers/local-agencies.js";
import * as oglasnik from "./scrapers/oglasnik.js";
import * as crozilla from "./scrapers/crozilla.js";

const SCRAPERS = [
  { name: "Njuškalo", module: njuskalo },
  { name: "Index", module: indexOglasi },
  { name: "Nekretnine.hr", module: nekretnineHr },
  { name: "Lokalne agencije", module: localAgencies },
  { name: "Oglasnik", module: oglasnik },
  { name: "Crozilla", module: crozilla },
];

// ─── Main scraping pipeline ───

async function runPipeline() {
  const startedAt = new Date().toISOString();
  logger.info(`${"=".repeat(60)}`);
  logger.info(`🏠 Nekretnine Monitor — ${new Date().toLocaleString("hr-HR")}`);
  logger.info(`${"=".repeat(60)}`);

  // 1. Scrape all sources
  let allListings = [];
  let scrapersOk = 0;
  let scrapersFailed = 0;
  const scraperErrors = [];

  for (const scraper of SCRAPERS) {
    for (const city of config.filters.cities) {
      try {
        logger.info(`📡 Scraping: ${scraper.name} (${city})...`);
        const listings = await scraper.module.scrape(config.filters.type, city);
        listings.forEach((l) => { if (!l.city) l.city = city; });
        allListings.push(...listings);
        scrapersOk++;
        logger.info(`✅ ${scraper.name} (${city}): ${listings.length} listings`);
      } catch (err) {
        scrapersFailed++;
        scraperErrors.push(`${scraper.name}(${city}): ${err.message}`);
        logger.error(`❌ ${scraper.name} (${city}) error: ${err.message}`, err.stack);
      }
    }
  }

  logger.info(`📊 Total raw listings: ${allListings.length}`);

  // 2. Apply filters and sort
  const filtered = applySorting(applyFilters(allListings));
  logger.info(`🔍 After filters: ${filtered.length}`);

  // 3. Deduplicate and check for new ones
  const newListings = [];
  const existingForDedup = [];

  for (const listing of filtered) {
    const fingerprint = generateFingerprint(listing);
    listing.fingerprint = fingerprint;

    // Check DB for exact match
    if (listingExists(listing.id, fingerprint)) {
      // Check for price drop on favorited listings
      if (listing.price != null && isFavorite(listing.id)) {
        const existing = getListingById(listing.id);
        if (existing && existing.price != null && listing.price < existing.price) {
          await notifyPriceDrop(listing, existing.price);
          await new Promise((r) => setTimeout(r, 100));
        }
        if (existing && existing.price !== listing.price) {
          updateListingPrice(listing.id, listing.price);
        }
      }
      continue;
    }

    // Check against other new listings in this batch (cross-site dedup)
    const { isDupe } = isDuplicate(listing, existingForDedup, config.dedupeThreshold);
    if (isDupe) {
      logger.info(`🔄 Duplikat preskočen: "${listing.title}" (${listing.source})`);
      continue;
    }

    // It's new!
    newListings.push(listing);
    existingForDedup.push(listing);

    // Save to DB
    insertListing(listing);
  }

  logger.info(`✨ New unique listings: ${newListings.length}`);

  // 4. Notify via Telegram
  if (newListings.length > 0) {
    await notifyNewListings(newListings);
    markNotified(newListings.map((l) => l.id));
    logger.info(`📨 Telegram notification sent!`);
  } else {
    logger.info(`😴 Nema novih nekretnina danas.`);
  }

  // 5. Check new listings for similarity to favorites
  const favorites = getFavorites();
  if (favorites.length > 0 && newListings.length > 0) {
    for (const newListing of newListings) {
      for (const fav of favorites) {
        if (newListing.id === fav.id) continue;
        const { isDupe, matchedWith } = isDuplicate(newListing, [fav], config.dedupeThreshold);
        if (isDupe) {
          await notifySimilarListing(newListing, matchedWith);
          await new Promise((r) => setTimeout(r, 100));
          break;
        }
      }
    }
  }

  const finishedAt = new Date().toISOString();
  recordRunLog({
    startedAt,
    finishedAt,
    scrapersOk,
    scrapersFailed,
    totalRaw: allListings.length,
    afterFilters: filtered.length,
    newListings: newListings.length,
    scraperErrors: scraperErrors.length > 0 ? scraperErrors.join("; ") : null,
  });

  logger.info(`📊 Run stats: ${scrapersOk} scrapers ok, ${scrapersFailed} failed`);
  if (scraperErrors.length > 0) {
    logger.warn(`Errors: ${scraperErrors.join(" | ")}`);
  }
  logger.info(`Raw: ${allListings.length} → Filtered: ${filtered.length} → New: ${newListings.length}`);
  logger.info(`✅ Pipeline done at ${new Date().toLocaleString("hr-HR")}`);
}

// ─── Startup ───

async function main() {
  // Ensure data directory exists
  mkdirSync("./data", { recursive: true });

  // Initialize DB
  getDb();
  logger.info("💾 Database initialized");

  // Check if --run-now flag
  const runNow = process.argv.includes("--run-now");

  if (runNow) {
    logger.info("🚀 Running immediately (--run-now)...");
    await runPipeline();
    process.exit(0);
  }

  // Start polling for Telegram button callbacks (fav/unfav) and /filter commands
  startPolling(
    async (callbackQuery) => {
      const { id, data } = callbackQuery;
      if (!data) return;

      if (data.startsWith("fav:")) {
        const listingId = data.slice(4);
        const listing = getListingById(listingId);
        if (listing) {
          addFavorite(listingId, listing.price);
          await answerCallbackQuery(id, "⭐ Dodano u favorite!");
          logger.info(`[favorites] Saved: ${listingId}`);
        }
      } else if (data.startsWith("unfav:")) {
        const listingId = data.slice(6);
        removeFavorite(listingId);
        await answerCallbackQuery(id, "💔 Uklonjeno iz favorita!");
        logger.info(`[favorites] Removed: ${listingId}`);
      }
    },
    async (message) => {
      const text = message.text || "";
      const chatId = String(message.chat?.id);

      // Only respond to the configured chat
      if (chatId !== config.telegram.chatId) return;

      if (text === "/stats") {
        const logs = getRecentRunLogs(5);
        await sendStats(logs);
        return;
      }

      if (!text.startsWith("/filter")) return;

      const parts = text.trim().split(/\s+/);
      const sub = parts[1]; // add | remove | exclude | unexclude | list
      const keyword = parts.slice(2).join(" ").toLowerCase().trim();

      if (sub === "list") {
        const includes = getUserFilters("include").map((f) => f.keyword);
        const excludes = getUserFilters("exclude").map((f) => f.keyword);
        await sendFilterStatus(includes, excludes);
      } else if (sub === "add" && keyword) {
        addUserFilter("include", keyword);
        logger.info(`[filters] Include keyword added: "${keyword}"`);
        await sendFilterStatus(
          getUserFilters("include").map((f) => f.keyword),
          getUserFilters("exclude").map((f) => f.keyword)
        );
      } else if (sub === "remove" && keyword) {
        removeUserFilter("include", keyword);
        logger.info(`[filters] Include keyword removed: "${keyword}"`);
        await sendFilterStatus(
          getUserFilters("include").map((f) => f.keyword),
          getUserFilters("exclude").map((f) => f.keyword)
        );
      } else if (sub === "exclude" && keyword) {
        addUserFilter("exclude", keyword);
        logger.info(`[filters] Exclude keyword added: "${keyword}"`);
        await sendFilterStatus(
          getUserFilters("include").map((f) => f.keyword),
          getUserFilters("exclude").map((f) => f.keyword)
        );
      } else if (sub === "unexclude" && keyword) {
        removeUserFilter("exclude", keyword);
        logger.info(`[filters] Exclude keyword removed: "${keyword}"`);
        await sendFilterStatus(
          getUserFilters("include").map((f) => f.keyword),
          getUserFilters("exclude").map((f) => f.keyword)
        );
      }
    }
  );

  // Send test message on startup
  logger.info("📡 Sending startup test message...");
  await sendTestMessage();

  // Schedule cron job
  logger.info(`⏰ Scheduled: "${config.cron}" (Default: every day at 12:00)`);

  cron.schedule(config.cron, async () => {
    try {
      await runPipeline();
    } catch (err) {
      logger.error(`💥 Pipeline error: ${err.message}`, err.stack);
    }
  }, {
    timezone: "Europe/Zagreb",
  });

  logger.info("🟢 Nekretnine Monitor is running. Waiting for next scheduled run...");
  logger.info("   Tip: use 'npm run scrape' to run immediately.");
}

main().catch((err) => {
  logger.error(`Fatal error: ${err.message}`, err.stack);
  process.exit(1);
});
