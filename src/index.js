import 'dotenv/config';
const REQUIRED = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`FATAL: missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

import cron from "node-cron";
import { mkdirSync } from "fs";
import { config } from "./config.js";
import { getDb, listingExists, insertListing, markNotified, getUnnotified, recordScraperFailure, recordScraperSuccess, getListingById, updateListingPrice, isFavorite, getFavorites, addFavorite, removeFavorite, addUserFilter, removeUserFilter, getUserFilters, recordRunLog, getRecentRunLogs } from "./db.js";
import { generateFingerprint, isDuplicate } from "./dedupe.js";
import { applyFilters, applySort } from "./filters.js";
import { notifyNewListings, notifyPriceDrop, notifySimilarListing, sendTestMessage, sendMessage, sendStats, sendFilterStatus, answerCallbackQuery, startPolling } from "./telegram.js";
import { logger } from "./logger.js";
import { logger } from "./logger.js";
import { getDb, listingExists, insertListing, markNotified, getUnnotified, recordScraperFailure, recordScraperSuccess, getListingById, updateListingPrice, addFavorite, removeFavorite, isFavorite, getFavorites, addUserFilter, removeUserFilter, getUserFilters, getRecentRunLogs, recordRunLog } from "./db.js";
import { generateFingerprint, isDuplicate } from "./dedupe.js";
import { applyFilters, applySort } from "./filters.js";
import { notifyNewListings, sendTestMessage, sendMessage, notifyPriceDrop, notifySimilarListing, sendStats, sendFilterStatus, answerCallbackQuery, startPolling } from "./telegram.js";
import { getDb, listingExists, insertListing, markNotified, getUnnotified, recordScraperFailure, recordScraperSuccess, getListingById, updateListingPrice, isFavorite, getFavorites } from "./db.js";
import { generateFingerprint, isDuplicate } from "./dedupe.js";
import { applyFilters, applySort, matchesTrigger } from "./filters.js";
import { notifyNewListings, notifyPriceDrop, notifyTriggerMatch, sendTestMessage } from "./notifier.js";
import { sendMessage } from "./telegram.js";

// Scrapers
import * as njuskalo from "./scrapers/njuskalo.js";
import * as indexOglasi from "./scrapers/index-oglasi.js";
import * as nekretnineHr from "./scrapers/nekretnine-hr.js";
import * as localAgencies from "./scrapers/local-agencies.js";
import * as oglasnik from "./scrapers/oglasnik.js";
import * as zida from "./scrapers/4zida.js";
import * as custom from "./scrapers/custom.js";

const SCRAPERS = [
  { name: "Njuškalo", module: njuskalo },
  { name: "Index", module: indexOglasi },
  { name: "Nekretnine.hr", module: nekretnineHr },
  { name: "Lokalne agencije", module: localAgencies },
  { name: "Oglasnik", module: oglasnik },
  { name: "4zida", module: zida },
  { name: "Custom", module: custom },
];

// ─── Main scraping pipeline ───

async function runPipeline() {
  const startedAt = new Date().toISOString();
  logger.info(`${"=".repeat(60)}`);
  logger.info(`🏠 Nekretnine Monitor — ${new Date().toLocaleString("hr-HR")}`);
  logger.info(`${"=".repeat(60)}`);

  // 1. Scrape all sources for each configured city
  let allListings = [];
  let scrapersOk = 0;
  let scrapersFailed = 0;
  const scraperErrors = [];
  for (const scraper of SCRAPERS) {
    try {
      console.log(`\n📡 Scraping: ${scraper.name}...`);
      const { listings, containerCount } = await scraper.module.scrape(config.filters.type);
      if (listings.length === 0 && containerCount === 0) {
        await sendMessage(`⚠️ ${scraper.name}: 0 container elements — possible selector failure`);
        console.warn(`[${scraper.name}] 0 containers found — selector may be broken`);
        recordScraperFailure(scraper.name);
        scrapersFailed++;
        scraperErrors.push(`${scraper.name}: 0 containers`);
      } else {
        recordScraperSuccess(scraper.name);
        scrapersOk++;
      }
      allListings.push(...listings);
      scrapersOk++;
    } catch (err) {
      console.error(`❌ ${scraper.name} error:`, err.message);
      await sendMessage(`❌ ${scraper.name} scrape failed: ${err.message}`);
      recordScraperFailure(scraper.name);
      scrapersFailed++;
      scraperErrors.push(`${scraper.name}: ${err.message}`);
    }
  }

  logger.info(`📊 Total raw listings: ${allListings.length}`);

  // 2. Apply filters and sort
  const filtered = applySort(applyFilters(allListings));
  console.log(`🔍 After filters: ${filtered.length}`);

  // 3. Deduplicate and check for new ones
  const newListings = [];
  const existingForDedup = [];

  for (const listing of filtered) {
    const fingerprint = generateFingerprint(listing);
    listing.fingerprint = fingerprint;

    // Check DB for exact match
    if (listingExists(listing.id, fingerprint)) {
      // Check for price drop on all existing listings
      if (listing.price != null) {
        const existing = getListingById(listing.id);
        if (existing && existing.price != null && listing.price < existing.price) {
          const drop = existing.price - listing.price;
          const dropPct = (drop / existing.price) * 100;
          const { priceDropMinPct, priceDropMinEur } = config.alertThresholds;
          if (drop >= priceDropMinEur && dropPct >= priceDropMinPct) {
            await notifyPriceDrop(listing, existing.price, isFavorite(listing.id));
            await new Promise((r) => setTimeout(r, 100));
          }
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
    try {
      insertListing(listing);
    } catch (err) {
      console.error(`[db] Failed to insert listing "${listing.id}":`, err.message);
    }
  }

  logger.info(`✨ New unique listings: ${newListings.length}`);

  // 4. Notify via configured channels
  if (newListings.length > 0) {
    try {
      await notifyNewListings(newListings);
    } catch (err) {
      console.error("[telegram] Failed to send notifications:", err.message);
    }
    try {
      markNotified(newListings.map((l) => l.id));
    } catch (err) {
      console.error("[db] Failed to mark listings as notified:", err.message);
    }
    console.log(`📨 Telegram notification sent!`);
  } else {
    logger.info(`😴 Nema novih nekretnina danas.`);
  }

  // 5. Check new listings against user-defined triggers
  if (config.triggers.length > 0 && newListings.length > 0) {
    for (const trigger of config.triggers) {
      const matched = newListings.filter((l) => matchesTrigger(l, trigger));
      if (matched.length > 0) {
        try {
          await notifyTriggerMatch(trigger.name || "Trigger", matched);
        } catch (err) {
          console.error(`[triggers] Failed to notify trigger "${trigger.name}":`, err.message);
        }
      }
    }
  }

  // 6. Check new listings for similarity to favorites
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
    console.log("🚀 Running immediately (--run-now)...");
    try {
      await runPipeline();
    } catch (err) {
      console.error("💥 Pipeline error:", err);
      process.exit(1);
    }
    process.exit(0);
  }

  // Start polling for Telegram button callbacks (fav/unfav) and /filter commands
  if (!config.channels.includes("telegram")) {
  let currentTask;
  if (!channels.includes("telegram")) {
    logger.info("📡 Telegram polling skipped (telegram not in NOTIFICATION_CHANNELS)");
  } else startPolling(
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

      if (text.startsWith("/schedule")) {
        const expr = text.trim().slice("/schedule".length).trim();
        if (!expr) {
          await sendMessage(`⏰ Trenutni raspored: \`${config.cron}\`\nKoristi: /schedule <cron izraz>\nPrimjer: /schedule 0 8,20 * * *`);
          return;
        }
        if (!cron.validate(expr)) {
          await sendMessage(`❌ Neispravan cron izraz: \`${expr}\``);
          return;
        }
        if (currentTask) currentTask.stop();
        config.cron = expr;
        currentTask = cron.schedule(expr, async () => {
          try {
            await runPipeline();
          } catch (err) {
            logger.error(`💥 Pipeline error: ${err.message}`, err.stack);
          }
        }, { timezone: "Europe/Zagreb" });
        await sendMessage(`✅ Raspored ažuriran na: \`${expr}\``);
        logger.info(`[schedule] Cron updated to: ${expr}`);
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
  if (!cron.validate(config.cron)) {
    logger.error(`Invalid CRON_SCHEDULE: "${config.cron}"`);
    process.exit(1);
  }
  logger.info(`⏰ Scheduled: "${config.cron}" (Default: every day at 12:00)`);

  currentTask = cron.schedule(config.cron, async () => {
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

process.on("uncaughtException", (err) => {
  logger.error(`Uncaught exception: ${err.message}`, err.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logger.error(`Unhandled rejection: ${msg}`, stack);
  process.exit(1);
});

main().catch((err) => {
  logger.error(`Fatal error: ${err.message}`, err.stack);
  process.exit(1);
});
