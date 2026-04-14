import 'dotenv/config';
const REQUIRED = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`FATAL: missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

import { createServer } from "http";
import cron from "node-cron";
import { createServer } from "http";
import { mkdirSync } from "fs";
import { config } from "./config.js";
import { getDb, listingExists, insertListing, markNotified, getUnnotified, recordScraperFailure, recordScraperSuccess, getListingById, updateListingPrice, isFavorite, getFavorites, addFavorite, removeFavorite, addUserFilter, removeUserFilter, getUserFilters, recordRunLog, getRecentRunLogs } from "./db.js";
import { getDb, listingExists, insertListing, markNotified, getUnnotified, recordScraperFailure, recordScraperSuccess, getListingById, updateListingPrice, insertPriceHistory, getPriceHistory, isFavorite } from "./db.js";
import { getDb, listingExists, insertListing, markNotified, getUnnotified, recordScraperFailure, recordScraperSuccess, getRecentRunLogs, getScraperHealth } from "./db.js";
import { getDb, listingExists, insertListing, markNotified, getUnnotified, recordScraperFailure, recordScraperSuccess, getScraperHealth, getAllScraperHealth } from "./db.js";
import { getDb, listingExists, insertListing, markNotified, getUnnotified, recordScraperFailure, recordScraperSuccess, updateListingTracking, getListingById } from "./db.js";
import { getDb, listingExists, insertListing, markNotified, getUnnotified, recordScraperFailure, recordScraperSuccess, getScraperHealth } from "./db.js";
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
import { applyFilters } from "./filters.js";
import { notifyNewListings, sendTestMessage, sendMessage } from "./telegram.js";
import { logger } from "./logger.js";
import { notifyNewListings, sendDigest, sendTestMessage, sendMessage } from "./telegram.js";
import { notifyNewListings, notifyPriceDrop, sendTestMessage, sendMessage } from "./telegram.js";
import { logger } from "./logger.js";
import {
  getDb, listingExists, insertListing, markNotified, getUnnotified,
  recordScraperFailure, recordScraperSuccess,
  getListingById, addFavorite, removeFavorite, isFavorite, getFavorites,
  addUserFilter, removeUserFilter, getUserFilters,
  getRecentRunLogs, recordRunLog, updateListingPrice,
  setFilterOverride, getAllFilterOverrides, clearAllFilterOverrides,
} from "./db.js";
import { generateFingerprint, isDuplicate } from "./dedupe.js";
import { applyFilters, applySort } from "./filters.js";
import {
  notifyNewListings, sendTestMessage, sendMessage,
  startPolling, answerCallbackQuery,
  sendStats, sendFilterStatus, sendStatus,
  notifyPriceDrop, notifySimilarListing,
} from "./telegram.js";
import { retry } from "./http.js";
import { logger } from "./logger.js";
import {
  getDb, listingExists, insertListing, markNotified, getUnnotified,
  recordScraperFailure, recordScraperSuccess,
  getListingById, updateListingPrice,
  addFavorite, removeFavorite, isFavorite, getFavorites,
  addUserFilter, removeUserFilter, getUserFilters,
  recordRunLog, getRecentRunLogs,
  getSetting, setSetting, getRecentListings,
} from "./db.js";
import { generateFingerprint, isDuplicate } from "./dedupe.js";
import { applyFilters, applySort } from "./filters.js";
import {
  notifyNewListings, sendTestMessage, sendMessage,
  answerCallbackQuery, startPolling,
  sendStats, sendFilterStatus,
  notifyPriceDrop, notifySimilarListing,
  sendStatus, sendFiltersConfig, sendListings,
  sendPauseConfirmation, sendPauseOff,
} from "./telegram.js";
import { notifyNewListings, notifyRelisted, sendTestMessage, sendMessage } from "./telegram.js";
import { notifyNewListings, sendTestMessage, sendMessage, sendHealth } from "./telegram.js";

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

const CIRCUIT_OPEN_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours

function isCircuitOpen(scraperName) {
  const health = getScraperHealth(scraperName);
  if (!health || health.consecutive_failures < CIRCUIT_OPEN_THRESHOLD) return false;
  return Date.now() - new Date(health.last_failure).getTime() < CIRCUIT_COOLDOWN_MS;
}

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
    if (isCircuitOpen(scraper.name)) {
      logger.warn(`[circuit] ${scraper.name} circuit open — skipping for ${CIRCUIT_COOLDOWN_MS / 3600000}h cooldown`);
      scrapersFailed++;
      scraperErrors.push(`${scraper.name}: circuit open`);
      continue;
    }
    try {
      logger.info(`\n📡 Scraping: ${scraper.name}...`);
      const { listings, containerCount } = await scraper.module.scrape(config.filters.type);
      console.log(`\n📡 Scraping: ${scraper.name}...`);
      const { listings, containerCount } = await retry(
        () => scraper.module.scrape(config.filters.type),
        { attempts: 3, baseDelay: 2000 }
      );
      if (listings.length === 0 && containerCount === 0) {
        await sendMessage(`⚠️ ${scraper.name}: 0 container elements — possible selector failure`);
        console.warn(`[${scraper.name}] 0 containers found — selector may be broken`);
        recordScraperFailure(scraper.name);
        scrapersFailed++;
        scraperErrors.push(`${scraper.name}: 0 containers`);
      } else {
        recordScraperSuccess(scraper.name);
        scrapersOk++;
        logger.warn(`[${scraper.name}] 0 containers found — selector may be broken`);
        recordScraperFailure(scraper.name, 0);
        scrapersFailed++;
        scraperErrors.push(`${scraper.name}: 0 containers`);
      } else {
        recordScraperSuccess(scraper.name, listings.length);
        scrapersOk++;
      }
      allListings.push(...listings);
      const recovered = recordScraperSuccess(scraper.name);
      if (recovered) logger.info(`[circuit] ${scraper.name} recovered after consecutive failures`);
      scrapersOk++;
    } catch (err) {
      logger.error(`❌ ${scraper.name} error: ${err.message}`);
      scrapersFailed++;
      scraperErrors.push(`${scraper.name}: ${err.message}`);
      console.error(`❌ ${scraper.name} error:`, err.message);
      await sendMessage(`❌ ${scraper.name} scrape failed: ${err.message}`);
      recordScraperFailure(scraper.name);
      scrapersFailed++;
      scraperErrors.push(`${scraper.name}: ${err.message}`);
    for (const city of config.cities) {
      try {
        console.log(`\n📡 Scraping: ${scraper.name} (${city})...`);
        const { listings, containerCount } = await scraper.module.scrape(config.filters.type, city);
        if (listings.length === 0 && containerCount === 0) {
          await sendMessage(`⚠️ ${scraper.name} (${city}): 0 container elements — possible selector failure`);
          console.warn(`[${scraper.name}] 0 containers found for ${city} — selector may be broken`);
        }
        allListings.push(...listings);
      } catch (err) {
        console.error(`❌ ${scraper.name} (${city}) error:`, err.message);
        await sendMessage(`❌ ${scraper.name} (${city}) scrape failed: ${err.message}`);
      }
      const failures = recordScraperFailure(scraper.name);
      if (failures >= CIRCUIT_OPEN_THRESHOLD) {
        logger.warn(`[circuit] ${scraper.name} circuit opened after ${failures} consecutive failures`);
      }
      recordScraperFailure(scraper.name, 0);
      scrapersFailed++;
      scraperErrors.push(`${scraper.name}: ${err.message}`);
    }
  }

  // Alert if any scraper has hit 3 consecutive failures
  const healthRows = getScraperHealth();
  const criticalFailures = healthRows.filter((r) => r.consecutive_failures >= 3);
  if (criticalFailures.length > 0) {
    const alertLines = criticalFailures
      .map((r) => `• ${r.key}: ${r.consecutive_failures} uzastopnih grešaka`)
      .join("\n");
    await sendMessage(`⚠️ <b>Upozorenje: scraper problem</b>\n\n${alertLines}`);
  }

  logger.info(`📊 Total raw listings: ${allListings.length}`);

  // 2. Apply filters and sort
  const filtered = applySort(applyFilters(allListings));
  logger.info(`🔍 After filters: ${filtered.length}`);
  // 2. Build search profiles from config (fall back to single default profile)
  const profiles = config.searchProfiles
    ? config.searchProfiles.map((p) => ({ ...config.filters, ...p }))
    : [{ name: null, ...config.filters }];

  // 3. Deduplicate across all profiles and collect new listings per profile
  const existingForDedup = [];
  const insertedIds = new Set();
  const priceDropChecked = new Set();
  const newListingsByProfile = [];
  let totalFiltered = 0;

  for (const profile of profiles) {
    const filtered = applySort(applyFilters(allListings, profile), profile);
    const profileLabel = profile.name ? ` [${profile.name}]` : "";
    console.log(`🔍 After filters${profileLabel}: ${filtered.length}`);
    totalFiltered += filtered.length;
    const profileNew = [];

    // Check DB for exact match
    if (listingExists(listing.id, fingerprint)) {
      // Update tracking: last_seen and seen_count
      const oldLastSeen = updateListingTracking(listing.id);

      // Detect relisting: gap of >2 days means absent for >2 runs (daily cron)
      if (oldLastSeen) {
        const gapMs = Date.now() - new Date(oldLastSeen).getTime();
        const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
        if (gapMs > TWO_DAYS_MS) {
          const dbListing = getListingById(listing.id);
          if (dbListing) {
            await notifyRelisted({ ...listing, first_seen: dbListing.first_seen, seen_count: dbListing.seen_count });
            await new Promise((r) => setTimeout(r, 100));
          }
        }
      }

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
          insertPriceHistory(listing.id, listing.price);
          updateListingPrice(listing.id, listing.price);
        }
        if (existing && existing.price != null && listing.price < existing.price) {
          const history = getPriceHistory(listing.id);
          await notifyPriceDrop(listing, existing.price, isFavorite(listing.id), history);
          await new Promise((r) => setTimeout(r, 100));
        }
    for (const listing of filtered) {
      const fingerprint = generateFingerprint(listing);
      listing.fingerprint = fingerprint;

      if (listingExists(listing.id, fingerprint)) {
        if (listing.price != null && !priceDropChecked.has(listing.id)) {
          priceDropChecked.add(listing.id);
          const existing = getListingById(listing.id);
          if (existing && existing.price != null && listing.price < existing.price) {
            await notifyPriceDrop(listing, existing.price, isFavorite(listing.id));
            await new Promise((r) => setTimeout(r, 100));
          }
          if (existing && existing.price !== listing.price) {
            updateListingPrice(listing.id, listing.price);
          }
        }
        continue;
      }

      if (insertedIds.has(listing.id)) {
        // Already inserted this run from another profile — still new for this profile
        profileNew.push(listing);
        continue;
      }

      const { isDupe } = isDuplicate(listing, existingForDedup, config.dedupeThreshold);
      if (isDupe) {
        logger.info(`🔄 Duplikat preskočen: "${listing.title}" (${listing.source})`);
        continue;
      }

      profileNew.push(listing);
      existingForDedup.push(listing);
      insertedIds.add(listing.id);

      try {
        insertListing(listing);
      } catch (err) {
        console.error(`[db] Failed to insert listing "${listing.id}":`, err.message);
      }
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
      const now = new Date().toISOString();
      listing.first_seen = now;
      listing.last_seen = now;
      insertListing(listing);
      if (listing.price != null) {
        insertPriceHistory(listing.id, listing.price);
      }
    } catch (err) {
      logger.error(`[db] Failed to insert listing "${listing.id}": ${err.message}`);
    }
    newListingsByProfile.push({ profile, listings: profileNew });
  }

  const totalNew = insertedIds.size;
  logger.info(`✨ New unique listings: ${totalNew}`);

  // 4. Notify via configured channels (skip if paused)
  const pauseUntil = getSetting('pause_until');
  const isPaused = pauseUntil && new Date(pauseUntil) > new Date();

  if (newListings.length > 0) {
  // 4. Notify per profile via configured channels
  let anyNew = false;
  for (const { profile, listings: profileNew } of newListingsByProfile) {
    if (profileNew.length === 0) continue;
    anyNew = true;
    const profileLabel = profile.name ? ` [${profile.name}]` : "";
    try {
      await notifyNewListings(profileNew, profile.name);
    } catch (err) {
      logger.error(`[telegram] Failed to send notifications: ${err.message}`);
      console.error(`[notifier] Failed to send notifications${profileLabel}:`, err.message);
    }
    try {
      markNotified(profileNew.map((l) => l.id));
    } catch (err) {
      logger.error(`[db] Failed to mark listings as notified: ${err.message}`);
    }
    logger.info(`📨 Telegram notification sent!`);
    if (config.notifyMode === "digest") {
      logger.info(`[digest] Accumulated ${newListings.length} listing(s) — will send at digest hour`);
    } else {
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
    }
    if (isPaused) {
      logger.info(`⏸ Notifications paused until ${pauseUntil} — skipping`);
    } else {
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
    }
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
      console.error(`[db] Failed to mark listings as notified${profileLabel}:`, err.message);
    }
    console.log(`📨 Notification sent${profileLabel}!`);
  }
  if (!anyNew) {
    logger.info(`😴 Nema novih nekretnina danas.`);
  }

  // 5. Check new listings for similarity to favorites
  const allNewListings = newListingsByProfile.flatMap(({ listings }) => listings);
  const favorites = getFavorites();
  if (favorites.length > 0 && allNewListings.length > 0) {
    for (const newListing of allNewListings) {
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
    afterFilters: totalFiltered,
    newListings: totalNew,
    scraperErrors: scraperErrors.length > 0 ? scraperErrors.join("; ") : null,
  });

  logger.info(`📊 Run stats: ${scrapersOk} scrapers ok, ${scrapersFailed} failed`);
  if (scraperErrors.length > 0) {
    logger.warn(`Errors: ${scraperErrors.join(" | ")}`);
  }
  logger.info(`Raw: ${allListings.length} → Filtered: ${filtered.length} → New: ${newListings.length}`);
  logger.info(`✅ Pipeline done at ${new Date().toLocaleString("hr-HR")}`);
}

// ─── Health server ───

function startHealthServer(port) {
  const server = createServer((req, res) => {
    if (req.url !== "/health" || req.method !== "GET") {
      res.writeHead(404);
      res.end();
      return;
    }
    const runs = getRecentRunLogs(1);
    const lastRun = runs[0] || null;
    const scrapers = getScraperHealth();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      lastRun: lastRun ? {
        startedAt: lastRun.started_at,
        finishedAt: lastRun.finished_at,
        scrapersOk: lastRun.scrapers_ok,
        scrapersFailed: lastRun.scrapers_failed,
        totalRaw: lastRun.total_raw,
        newListings: lastRun.new_listings,
      } : null,
      scrapers,
    }));
  });
  server.listen(port, () => {
    logger.info(`🩺 Health server listening on port ${port}`);
  });
}

// ─── Startup ───

async function main() {
  // Ensure data directory exists
  mkdirSync("./data", { recursive: true });

  // Initialize DB
  getDb();
  logger.info("💾 Database initialized");

  const healthPort = process.env.HEALTH_PORT ? parseInt(process.env.HEALTH_PORT, 10) : null;
  if (healthPort) startHealthServer(healthPort);
  // Health endpoint
  const healthPort = parseInt(process.env.HEALTH_PORT || "3000", 10);
  createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      const scraperHealth = getAllScraperHealth();
      const circuitOpen = scraperHealth
        .filter(h => h.consecutive_failures >= CIRCUIT_OPEN_THRESHOLD &&
          Date.now() - new Date(h.last_failure).getTime() < CIRCUIT_COOLDOWN_MS)
        .map(h => h.key);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: circuitOpen.length === 0 ? "ok" : "degraded",
        circuitOpen,
        scrapers: scraperHealth,
      }));
    } else {
      res.writeHead(404);
      res.end();
    }
  }).listen(healthPort, () => {
    logger.info(`🩺 Health endpoint listening on :${healthPort}/health`);
  });

  // Check if --run-now flag
  const runNow = process.argv.includes("--run-now");

  if (runNow) {
    logger.info("🚀 Running immediately (--run-now)...");
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
  // Start polling for Telegram button callbacks (fav/unfav) and commands
  if (!config.channels.includes("telegram")) {
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

      if (text === "/status") {
        const logs = getRecentRunLogs(1);
        const pauseUntil = getSetting('pause_until');
        await sendStatus(logs, pauseUntil);
        return;
      }

      if (text === "/filters") {
        await sendFiltersConfig(config);
        return;
      }

      if (text.startsWith("/pause")) {
        const arg = text.slice(6).trim();
        if (arg === "off") {
          setSetting('pause_until', null);
          await sendPauseOff();
        } else {
          const hours = parseFloat(arg);
          if (!isNaN(hours) && hours > 0) {
            const until = new Date(Date.now() + hours * 3600 * 1000).toISOString();
            setSetting('pause_until', until);
            await sendPauseConfirmation(hours, until);
          } else {
            await sendMessage("Usage: /pause &lt;hours&gt; or /pause off");
          }
        }
        return;
      }

      if (text === "/listings") {
        const recent = getRecentListings(5);
        await sendListings(recent);
        return;
      }

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
      if (text === "/status") {
        await sendStatus();
        return;
      }

      if (text.startsWith("/clearfilter")) {
        clearAllFilterOverrides();
        await sendMessage("✅ Filter overrides cleared. Using env-var defaults.");
      if (text === "/health") {
        const rows = getScraperHealth();
        await sendHealth(rows);
        return;
      }

      if (!text.startsWith("/filter")) return;

      const parts = text.trim().split(/\s+/);
      const sub = parts[1]; // add | remove | exclude | unexclude | list | price | size | rooms
      const keyword = parts.slice(2).join(" ").toLowerCase().trim();

      if (sub === "price") {
        const min = parseInt(parts[2], 10);
        const max = parseInt(parts[3], 10);
        if (!isNaN(min)) setFilterOverride("priceMin", min);
        if (!isNaN(max)) setFilterOverride("priceMax", max);
        await sendStatus();
      } else if (sub === "size") {
        const min = parseInt(parts[2], 10);
        const max = parseInt(parts[3], 10);
        if (!isNaN(min)) setFilterOverride("sizeMin", min);
        if (!isNaN(max)) setFilterOverride("sizeMax", max);
        await sendStatus();
      } else if (sub === "rooms") {
        const min = parseInt(parts[2], 10);
        const max = parseInt(parts[3], 10);
        if (!isNaN(min)) setFilterOverride("roomsMin", min);
        if (!isNaN(max)) setFilterOverride("roomsMax", max);
        await sendStatus();
      } else if (sub === "list") {
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

  if (config.notifyMode === "digest") {
    cron.schedule(`0 ${config.digestHour} * * *`, async () => {
      try {
        const pending = getUnnotified();
        if (pending.length > 0) {
          await sendDigest(pending);
          markNotified(pending.map((l) => l.id));
          logger.info(`[digest] Sent digest for ${pending.length} listing(s)`);
        } else {
          logger.info("[digest] No pending listings for digest");
        }
      } catch (err) {
        logger.error(`[digest] Error sending digest: ${err.message}`, err.stack);
      }
    }, {
      timezone: "Europe/Zagreb",
    });
    logger.info(`📋 Digest mode: summary will be sent daily at ${config.digestHour}:00`);
  }

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
