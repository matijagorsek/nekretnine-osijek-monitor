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
import { getDb, listingExists, insertListing, markNotified, getUnnotified } from "./db.js";
import { generateFingerprint, isDuplicate } from "./dedupe.js";
import { applyFilters, applySort } from "./filters.js";
import { notifyNewListings, sendTestMessage, sendMessage } from "./telegram.js";

// Scrapers
import * as njuskalo from "./scrapers/njuskalo.js";
import * as indexOglasi from "./scrapers/index-oglasi.js";
import * as nekretnineHr from "./scrapers/nekretnine-hr.js";
import * as localAgencies from "./scrapers/local-agencies.js";

const SCRAPERS = [
  { name: "Njuškalo", module: njuskalo },
  { name: "Index", module: indexOglasi },
  { name: "Nekretnine.hr", module: nekretnineHr },
  { name: "Lokalne agencije", module: localAgencies },
];

// ─── Main scraping pipeline ───

async function runPipeline() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🏠 Nekretnine Monitor — ${new Date().toLocaleString("hr-HR")}`);
  console.log(`${"=".repeat(60)}\n`);

  // 1. Scrape all sources
  let allListings = [];
  for (const scraper of SCRAPERS) {
    try {
      console.log(`\n📡 Scraping: ${scraper.name}...`);
      const { listings, containerCount } = await scraper.module.scrape(config.filters.type);
      if (listings.length === 0 && containerCount === 0) {
        await sendMessage(`⚠️ ${scraper.name}: 0 container elements — possible selector failure`);
        console.warn(`[${scraper.name}] 0 containers found — selector may be broken`);
      }
      allListings.push(...listings);
    } catch (err) {
      console.error(`❌ ${scraper.name} error:`, err.message);
      await sendMessage(`❌ ${scraper.name} scrape failed: ${err.message}`);
    }
  }

  console.log(`\n📊 Total raw listings: ${allListings.length}`);

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
      continue;
    }

    // Check against other new listings in this batch (cross-site dedup)
    const { isDupe } = isDuplicate(listing, existingForDedup, config.dedupeThreshold);
    if (isDupe) {
      console.log(`  🔄 Duplikat preskočen: "${listing.title}" (${listing.source})`);
      continue;
    }

    // It's new!
    newListings.push(listing);
    existingForDedup.push(listing);

    // Save to DB
    insertListing(listing);
  }

  console.log(`✨ New unique listings: ${newListings.length}`);

  // 4. Notify via Telegram
  if (newListings.length > 0) {
    await notifyNewListings(newListings);
    markNotified(newListings.map((l) => l.id));
    console.log(`📨 Telegram notification sent!`);
  } else {
    console.log(`😴 Nema novih nekretnina danas.`);
  }

  console.log(`\n✅ Pipeline done at ${new Date().toLocaleString("hr-HR")}`);
}

// ─── Startup ───

async function main() {
  // Ensure data directory exists
  mkdirSync("./data", { recursive: true });

  // Initialize DB
  getDb();
  console.log("💾 Database initialized");

  // Check if --run-now flag
  const runNow = process.argv.includes("--run-now");

  if (runNow) {
    console.log("🚀 Running immediately (--run-now)...");
    await runPipeline();
    process.exit(0);
  }

  // Send test message on startup
  console.log("📡 Sending startup test message...");
  await sendTestMessage();

  // Schedule cron job
  console.log(`⏰ Scheduled: "${config.cron}"`);
  console.log(`   (Default: every day at 12:00)\n`);

  cron.schedule(config.cron, async () => {
    try {
      await runPipeline();
    } catch (err) {
      console.error("💥 Pipeline error:", err);
    }
  }, {
    timezone: "Europe/Zagreb",
  });

  console.log("🟢 Nekretnine Monitor is running. Waiting for next scheduled run...");
  console.log("   Tip: use 'npm run scrape' to run immediately.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
