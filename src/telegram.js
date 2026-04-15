import fetch from "node-fetch";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { getAllFilterOverrides } from "./db.js";

const API_BASE = `https://api.telegram.org/bot${config.telegram.botToken}`;

/**
 * Send a single Telegram message (HTML)
 */
export async function sendMessage(text, parseMode = "HTML") {
  try {
    const resp = await fetch(`${API_BASE}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegram.chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: config.notification.disablePreview,
      }),
    });

    const data = await resp.json();
    if (!data.ok) {
      logger.error(`[telegram] Send failed: ${data.description}`);
      return false;
    }
    return true;
  } catch (err) {
    logger.error(`[telegram] Error: ${err.message}`);
    return false;
  }
}

/**
 * Send a message with an inline keyboard
 */
async function sendMessageWithKeyboard(text, inlineKeyboard, parseMode = "HTML") {
  try {
    const resp = await fetch(`${API_BASE}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegram.chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: config.notification.disablePreview,
        reply_markup: { inline_keyboard: inlineKeyboard },
      }),
    });

    const data = await resp.json();
    if (!data.ok) {
      logger.error(`[telegram] Send failed: ${data.description}`);
      return false;
    }
    return true;
  } catch (err) {
    logger.error(`[telegram] Error: ${err.message}`);
    return false;
  }
}

/**
 * Send a photo with a caption and inline keyboard
 */
async function sendPhotoWithKeyboard(photoUrl, caption, inlineKeyboard, parseMode = "HTML") {
  try {
    const resp = await fetch(`${API_BASE}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegram.chatId,
        photo: photoUrl,
        caption,
        parse_mode: parseMode,
        reply_markup: { inline_keyboard: inlineKeyboard },
      }),
    });
    const data = await resp.json();
    if (!data.ok) {
      logger.error(`[telegram] sendPhoto failed: ${data.description}`);
      return sendMessageWithKeyboard(caption, inlineKeyboard, parseMode);
    }
    return true;
  } catch (err) {
    logger.error(`[telegram] sendPhoto error: ${err.message}`);
    return false;
  }
}

/**
 * Answer a callback query (clears the loading spinner on the button)
 */
export async function answerCallbackQuery(callbackQueryId, text) {
  try {
    await fetch(`${API_BASE}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch (err) {
    logger.error(`[telegram] answerCallbackQuery error: ${err.message}`);
  }
}

/**
 * Start long-polling for Telegram updates.
 * Calls onCallbackQuery(callbackQuery) for button presses.
 * Calls onMessage(message) for text messages (optional).
 */
export function startPolling(onCallbackQuery, onMessage = null) {
  let offset = 0;
  const allowedUpdates = ["callback_query", ...(onMessage ? ["message"] : [])];

  const poll = async () => {
    try {
      const resp = await fetch(`${API_BASE}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offset,
          timeout: 30,
          allowed_updates: allowedUpdates,
        }),
      });
      const data = await resp.json();
      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          if (update.callback_query) {
            await onCallbackQuery(update.callback_query).catch((err) =>
              logger.error(`[telegram] Callback handler error: ${err.message}`)
            );
          }
          if (update.message && onMessage) {
            await onMessage(update.message).catch((err) =>
              logger.error(`[telegram] Message handler error: ${err.message}`)
            );
          }
        }
      }
    } catch (err) {
      logger.error(`[telegram] Polling error: ${err.message}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
    setImmediate(poll);
  };

  poll();
  logger.info("[telegram] Polling started for callback queries and messages");
}

/**
 * Format and send new listings as Telegram notifications.
 * Each listing is sent as an individual message with a ⭐ Save button.
 */
export async function notifyNewListings(listings, triggerName = null) {
  if (!listings.length) {
    logger.info("[telegram] No new listings to notify.");
    return;
  }

  if (!config.telegram.botToken || !config.telegram.chatId) {
    logger.error("[telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return;
  }

  // Header message
  const profileLabel = triggerName ? ` — ${triggerName}` : "";
  const header = `🏠 <b>Nove nekretnine u Osijeku${profileLabel}</b>\n📅 ${new Date().toLocaleDateString("hr-HR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n🔍 Pronađeno: <b>${listings.length}</b> novih oglasa\n${"═".repeat(28)}`;

  // Format each listing
  const formatted = listings.map((l) => formatListing(l));

  // Split into chunks respecting Telegram's 4096 char limit
  const messages = [];
  let current = header + "\n\n";

  for (const item of formatted) {
    if (current.length + item.length + 2 > 4000) {
      messages.push(current);
      current = "";
    }
    current += item + "\n\n";
  }
  if (current.trim()) {
    const footer = `\n⏱ <i>Ažurirano: ${new Date().toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" })}</i>`;
    messages.push(current + footer);
  }

  // Send all chunks
  let success = 0;
  for (const listing of listings) {
    const text = formatListing(listing);
    const keyboard = [[{ text: "⭐ Spremi u favorite", callback_data: `fav:${listing.id}` }]];
    const ok = listing.image_url
      ? await sendPhotoWithKeyboard(listing.image_url, text, keyboard)
      : await sendMessageWithKeyboard(text, keyboard);
    if (ok) success++;
    await new Promise((r) => setTimeout(r, 100));
  }

  logger.info(`[telegram] Sent ${success}/${listings.length} listing messages`);
}

/**
 * Notify user that a listing has dropped in price.
 * Pass isFav=true if the listing is a favorite (shows remove-from-favorites button).
 */
export async function notifyPriceDrop(listing, oldPrice, isFav = false, priceHistory = []) {
  const drop = oldPrice - listing.price;
  const pct = ((drop / oldPrice) * 100).toFixed(1);
  const label = isFav ? "📉 <b>Pad cijene — omiljeni oglas!</b>" : "📉 <b>Pad cijene!</b>";
  const timelineLine = priceHistory.length >= 2
    ? `\n📊 Povijest: <i>${priceHistory.map((h) => `${Math.round(h.price / 1000)}k`).join(" → ")}</i>`
    : "";
  const text =
    `${label}\n\n${formatListing(listing)}\n\n` +
    `💰 Stara cijena: <b>${oldPrice.toLocaleString("hr-HR")} €</b>\n` +
    `💰 Nova cijena: <b>${listing.price.toLocaleString("hr-HR")} €</b>\n` +
    `📉 Uštedite: <b>-${drop.toLocaleString("hr-HR")} € (-${pct}%)</b>${timelineLine}`;
  const keyboard = isFav
    ? [[{ text: "💔 Ukloni iz favorita", callback_data: `unfav:${listing.id}` }]]
    : [[{ text: "⭐ Spremi u favorite", callback_data: `fav:${listing.id}` }]];
  return sendMessageWithKeyboard(text, keyboard);
}

/**
 * Notify user that a new listing is similar to one of their favorites.
 */
export async function notifySimilarListing(newListing, favListing) {
  const text =
    `🔔 <b>Novi oglas sličan omiljenom!</b>\n\n${formatListing(newListing)}\n\n` +
    `<i>Slično s: ${escapeHtml(favListing.title)}</i>`;
  const keyboard = [[{ text: "⭐ Spremi u favorite", callback_data: `fav:${newListing.id}` }]];
  return sendMessageWithKeyboard(text, keyboard);
}

function formatListing(l) {
  const icon = l.type === "kuca" ? "🏡" : "🏢";
  const source = formatSource(l.source);
  const price = l.price ? `💰 <b>${l.price.toLocaleString("hr-HR")} €</b>` : "💰 <i>Cijena na upit</i>";
  const size = l.size ? `📐 ${l.size} m²` : "";
  const rooms = l.rooms ? `🛏️ ${l.rooms} sob${l.rooms === 1 ? "a" : l.rooms < 5 ? "e" : "a"}` : "";
  const location = l.location ? `📍 ${capitalize(l.location)}` : "";

  const details = [size, rooms, location].filter(Boolean).join("  •  ");
  const amenitiesList = l.amenities ? JSON.parse(l.amenities).join(", ") : null;
  const amenitiesLine = amenitiesList ? `🏷️ ${amenitiesList}` : null;
  const orientationLine = l.orientation ? `🧭 ${capitalize(l.orientation)}` : null;

  let daysOnMarket = "";
  if (l.first_seen) {
    const days = Math.floor((Date.now() - new Date(l.first_seen).getTime()) / (1000 * 60 * 60 * 24));
    daysOnMarket = days === 0 ? "📅 Danas na tržištu" : `📅 Na tržištu: <b>${days} ${days === 1 ? "dan" : "dana"}</b>`;
  }

  const lines = [
    `${icon} <b>${escapeHtml(l.title)}</b>`,
    price,
  ];
  if (details) lines.push(details);
  if (amenitiesLine) lines.push(amenitiesLine);
  if (orientationLine) lines.push(orientationLine);
  if (daysOnMarket) lines.push(daysOnMarket);
  lines.push(`🔗 <a href="${l.url}">Otvori oglas</a>  <i>(${source})</i>`);
  lines.push(`${"─".repeat(26)}`);

  return lines.join("\n");
}

/**
 * Notify user that a previously seen listing has reappeared after a gap (possible relisting/price drop).
 */
export async function notifyRelisted(listing) {
  const text = `🔁 <b>Oglas se vratio na tržište!</b>\n\n${formatListing(listing)}`;
  const keyboard = [[{ text: "⭐ Spremi u favorite", callback_data: `fav:${listing.id}` }]];
  return sendMessageWithKeyboard(text, keyboard);
}

function formatSource(source) {
  if (source.startsWith("local_agency:")) return source.replace("local_agency:", "");
  const names = {
    njuskalo: "Njuškalo",
    index: "Index",
    nekretnine_hr: "Nekretnine.hr",
  };
  return names[source] || source;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Notify user that a user-defined trigger matched new listings.
 */
export async function notifyTriggerMatch(triggerName, listings) {
  const header = `🎯 <b>Trigger: ${escapeHtml(triggerName)}</b>\n📅 ${new Date().toLocaleDateString("hr-HR")}\n🔍 Pronađeno: <b>${listings.length}</b> novih oglasa\n${"═".repeat(28)}`;
  await sendMessage(header);
  let success = 0;
  for (const listing of listings) {
    const text = formatListing(listing);
    const keyboard = [[{ text: "⭐ Spremi u favorite", callback_data: `fav:${listing.id}` }]];
    const ok = await sendMessageWithKeyboard(text, keyboard);
    if (ok) success++;
    await new Promise((r) => setTimeout(r, 100));
  }
  logger.info(`[telegram] Trigger "${triggerName}": sent ${success}/${listings.length} listing messages`);
}

/**
 * Send the current user-defined filter list
 */
export async function sendFilterStatus(includeKeywords, excludeKeywords) {
  const inc = includeKeywords.length > 0 ? includeKeywords.map((k) => `  • ${k}`).join("\n") : "  (none)";
  const exc = excludeKeywords.length > 0 ? excludeKeywords.map((k) => `  • ${k}`).join("\n") : "  (none)";
  return sendMessage(
    `🔍 <b>Custom Filters</b>\n\n` +
    `<b>Include keywords</b> (at least one must match):\n${inc}\n\n` +
    `<b>Exclude keywords</b> (listing rejected if matched):\n${exc}\n\n` +
    `<i>Commands:\n/filter add &lt;keyword&gt;\n/filter remove &lt;keyword&gt;\n/filter exclude &lt;keyword&gt;\n/filter unexclude &lt;keyword&gt;\n/filter list</i>`
  );
}

/**
 * Send recent pipeline run statistics
 */
export async function sendStats(logs) {
  if (!logs.length) {
    return sendMessage("📊 <b>Run Statistics</b>\n\nNo runs recorded yet.");
  }

  const lines = logs.map((log) => {
    const date = new Date(log.started_at).toLocaleString("hr-HR");
    const durationMs = log.finished_at
      ? new Date(log.finished_at) - new Date(log.started_at)
      : null;
    const duration = durationMs != null ? `${Math.round(durationMs / 1000)}s` : "?";
    const status = log.scrapers_failed > 0 ? "⚠️" : "✅";
    const errorLine = log.scraper_errors
      ? `\n   ⚠️ <i>${escapeHtml(log.scraper_errors)}</i>`
      : "";
    return (
      `${status} <b>${date}</b> (${duration})\n` +
      `   Raw: ${log.total_raw} → Filtered: ${log.after_filters} → New: ${log.new_listings}\n` +
      `   Scrapers: ${log.scrapers_ok}✅ ${log.scrapers_failed}❌${errorLine}`
    );
  });

  return sendMessage(`📊 <b>Run Statistics (last ${logs.length})</b>\n\n${lines.join("\n\n")}`);
}

/**
 * Send a daily digest grouping new listings by neighbourhood with a best-value pick.
 */
export async function sendDigest(listings) {
  if (!listings.length) return;

  // Group by location
  const groups = {};
  for (const l of listings) {
    const key = l.location ? capitalize(l.location) : "Ostalo";
    if (!groups[key]) groups[key] = [];
    groups[key].push(l);
  }

  const date = new Date().toLocaleDateString("hr-HR", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  let text =
    `🏠 <b>Dnevni pregled nekretnina</b>\n` +
    `📅 ${date}\n` +
    `🔍 Ukupno novih: <b>${listings.length}</b>\n` +
    `${"═".repeat(28)}\n\n`;

  for (const [neighbourhood, items] of Object.entries(groups)) {
    const priced = items.filter((l) => l.price != null);
    const bestValue =
      priced.sort((a, b) => {
        if (a.size && b.size) return a.price / a.size - b.price / b.size;
        return a.price - b.price;
      })[0] || items[0];

    const suffix = items.length === 1 ? "oglas" : items.length < 5 ? "oglasa" : "oglasa";
    text += `📍 <b>${escapeHtml(neighbourhood)}</b> — ${items.length} ${suffix}\n`;

    if (bestValue) {
      const priceStr = bestValue.price
        ? `${bestValue.price.toLocaleString("hr-HR")} €`
        : "cijena na upit";
      const sizeStr = bestValue.size ? `, ${bestValue.size} m²` : "";
      text +=
        `   ⭐ <a href="${bestValue.url}">${escapeHtml(bestValue.title)}</a>` +
        ` — ${priceStr}${sizeStr}\n`;
    }
    text += "\n";
  }

  return sendMessage(text);
 * Send the current active filter state, showing both env-var defaults and DB overrides.
 */
export async function sendStatus() {
  const { filters } = config;
  const overrideRows = getAllFilterOverrides();
  const ov = {};
  for (const row of overrideRows) ov[row.key] = Number(row.value);

  const priceMin = ov.priceMin !== undefined ? ov.priceMin : filters.priceMin;
  const priceMax = ov.priceMax !== undefined ? ov.priceMax : filters.priceMax;
  const sizeMin = ov.sizeMin !== undefined ? ov.sizeMin : filters.sizeMin;
  const sizeMax = ov.sizeMax !== undefined ? ov.sizeMax : filters.sizeMax;
  const roomsMin = ov.roomsMin !== undefined ? ov.roomsMin : filters.roomsMin;
  const roomsMax = ov.roomsMax !== undefined ? ov.roomsMax : filters.roomsMax;

  const tag = (key1, key2) => (ov[key1] !== undefined || ov[key2] !== undefined) ? " ✏️" : "";

  return sendMessage(
    `📊 <b>Active Filters</b>\n\n` +
    `💰 Price: <b>${priceMin.toLocaleString("hr-HR")} – ${priceMax.toLocaleString("hr-HR")} €</b>${tag("priceMin", "priceMax")}\n` +
    `📐 Size: <b>${sizeMin} – ${sizeMax} m²</b>${tag("sizeMin", "sizeMax")}\n` +
    `🛏️ Rooms: <b>${roomsMin} – ${roomsMax}</b>${tag("roomsMin", "roomsMax")}\n` +
    `🏠 Type: <b>${filters.type}</b>\n\n` +
    `<i>✏️ = override active (DB value, not env var)\n\n` +
    `Commands:\n` +
    `/filter price &lt;min&gt; [max]\n` +
    `/filter size &lt;min&gt; [max]\n` +
    `/filter rooms &lt;min&gt; [max]\n` +
    `/clearfilter — revert to env defaults\n` +
    `/status — show this\n` +
    `/filter list — keyword filters</i>`
 * Send monitor status: last run summary + pause state
 */
export async function sendStatus(logs, pauseUntil) {
  const now = new Date();
  const paused = pauseUntil && new Date(pauseUntil) > now;

  let text = "📊 <b>Monitor Status</b>\n\n";

  if (paused) {
    const until = new Date(pauseUntil).toLocaleString("hr-HR");
    text += `⏸ <b>Paused until:</b> ${until}\n\n`;
  } else {
    text += "▶️ <b>Active</b> — notifications enabled\n\n";
  }

  const lastRun = logs.length > 0 ? logs[0] : null;
  if (lastRun) {
    const date = new Date(lastRun.started_at).toLocaleString("hr-HR");
    const durationMs = lastRun.finished_at
      ? new Date(lastRun.finished_at) - new Date(lastRun.started_at)
      : null;
    const duration = durationMs != null ? `${Math.round(durationMs / 1000)}s` : "?";
    text += `<b>Last run:</b> ${date} (${duration})\n`;
    text += `Raw: ${lastRun.total_raw} → Filtered: ${lastRun.after_filters} → New: ${lastRun.new_listings}\n`;
    text += `Scrapers: ${lastRun.scrapers_ok}✅ ${lastRun.scrapers_failed}❌`;
  } else {
    text += "<i>No runs recorded yet.</i>";
  }

  return sendMessage(text);
}

/**
 * Send the active filter configuration (from env/config)
 */
export async function sendFiltersConfig(cfg) {
  const type = cfg.filters.type === "all" ? "Stanovi + Kuće" : cfg.filters.type;
  const locations = cfg.filters.locations.length > 0 ? cfg.filters.locations.join(", ") : "(sve)";
  return sendMessage(
    `⚙️ <b>Active Filters</b>\n\n` +
    `🏙 City: ${cfg.filters.city}\n` +
    `🏠 Type: ${type}\n` +
    `💰 Price: ${cfg.filters.priceMin.toLocaleString()} – ${cfg.filters.priceMax.toLocaleString()} €\n` +
    `📐 Size: ${cfg.filters.sizeMin} – ${cfg.filters.sizeMax} m²\n` +
    `🛏️ Rooms: ${cfg.filters.roomsMin} – ${cfg.filters.roomsMax}\n` +
    `📍 Locations: ${locations}\n` +
    `⏰ Schedule: ${cfg.cron}`
  );
}

/**
 * Send a list of recent listings
 */
export async function sendListings(listings) {
  if (!listings.length) {
    return sendMessage("📋 <b>Recent Listings</b>\n\n<i>No listings found.</i>");
  }
  let text = `📋 <b>Recent Listings</b> (${listings.length})\n\n`;
  for (const l of listings) {
    const item = formatListing(l) + "\n\n";
    if (text.length + item.length > 4000) break;
    text += item;
  }
  return sendMessage(text);
}

/**
 * Confirm that notifications have been paused
 */
export async function sendPauseConfirmation(hours, until) {
  const untilStr = new Date(until).toLocaleString("hr-HR");
  return sendMessage(
    `⏸ <b>Notifications paused for ${hours}h</b>\n\nUntil: ${untilStr}\n\nUse /pause off to resume.`
  );
}

/**
 * Confirm that pause has been cancelled
 */
export async function sendPauseOff() {
  return sendMessage("▶️ <b>Notifications resumed.</b>");
 * Send per-scraper health dashboard
 */
export async function sendHealth(rows) {
  if (!rows.length) {
    return sendMessage("🩺 <b>Scraper Health</b>\n\nNema podataka.");
  }
  const lines = rows.map((r) => {
    const status = r.consecutive_failures === 0 ? "✅" : r.consecutive_failures >= 3 ? "🔴" : "⚠️";
    const lastSeen = r.last_success ? new Date(r.last_success).toLocaleString("hr-HR") : "nikad";
    const countInfo = r.last_listing_count != null ? ` • ${r.last_listing_count} oglasa` : "";
    const failInfo = r.consecutive_failures > 0 ? ` • <b>${r.consecutive_failures} uzastopnih grešaka</b>` : "";
    return `${status} <b>${escapeHtml(r.key)}</b>${failInfo}${countInfo}\n   Zadnji uspjeh: ${lastSeen}`;
  });
  return sendMessage(`🩺 <b>Scraper Health</b>\n\n${lines.join("\n\n")}`);
}

/**
 * Send a test/status message
 */
export async function sendTestMessage() {
  const citiesLabel = config.cities.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(", ");
  return sendMessage(
    "✅ <b>Nekretnine Monitor — Aktivan!</b>\n\n" +
      `⏰ Raspored: svaki dan u 12:00\n` +
      `🏙 Gradovi: ${citiesLabel}\n` +
      `💰 Cijena: ${config.filters.priceMin.toLocaleString()} - ${config.filters.priceMax.toLocaleString()} €\n` +
      `📐 Veličina: ${config.filters.sizeMin} - ${config.filters.sizeMax} m²\n` +
      `🔍 Tip: ${config.filters.type === "all" ? "Stanovi + Kuće" : config.filters.type}\n` +
      `📡 Izvori: Njuškalo, Index, Nekretnine.hr + lokalne agencije`
  );
}
