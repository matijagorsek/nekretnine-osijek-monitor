import fetch from "node-fetch";
import { config } from "./config.js";
import { logger } from "./logger.js";

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
  const header = `🏠 <b>Nove nekretnine u Osijeku</b>\n📅 ${new Date().toLocaleDateString("hr-HR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n🔍 Pronađeno: <b>${listings.length}</b> novih oglasa\n${"═".repeat(28)}`;

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
    const ok = await sendMessageWithKeyboard(text, keyboard);
    if (ok) success++;
    await new Promise((r) => setTimeout(r, 100));
  }

  logger.info(`[telegram] Sent ${success}/${listings.length} listing messages`);
}

/**
 * Notify user that a listing has dropped in price.
 * Pass isFav=true if the listing is a favorite (shows remove-from-favorites button).
 */
export async function notifyPriceDrop(listing, oldPrice, isFav = false) {
  const drop = oldPrice - listing.price;
  const pct = ((drop / oldPrice) * 100).toFixed(1);
  const label = isFav ? "📉 <b>Pad cijene — omiljeni oglas!</b>" : "📉 <b>Pad cijene!</b>";
  const text =
    `${label}\n\n${formatListing(listing)}\n\n` +
    `💰 Stara cijena: <b>${oldPrice.toLocaleString("hr-HR")} €</b>\n` +
    `💰 Nova cijena: <b>${listing.price.toLocaleString("hr-HR")} €</b>\n` +
    `📉 Uštedite: <b>-${drop.toLocaleString("hr-HR")} € (-${pct}%)</b>`;
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
  const n = config.notification;
  const icon = l.type === "kuca" ? "🏡" : "🏢";
  const source = formatSource(l.source);
  const price = l.price ? `💰 <b>${l.price.toLocaleString("hr-HR")} €</b>` : "💰 <i>Cijena na upit</i>";
  const size = l.size ? `📐 ${l.size} m²` : "";
  const rooms = l.rooms ? `🛏️ ${l.rooms} sob${l.rooms === 1 ? "a" : l.rooms < 5 ? "e" : "a"}` : "";
  const location = l.location ? `📍 ${capitalize(l.location)}` : "";

  const details = [size, rooms, location].filter(Boolean).join("  •  ");

  const lines = [
    `${icon} <b>${escapeHtml(l.title)}</b>`,
    price,
  ];
  if (details) lines.push(details);
  lines.push(`🔗 <a href="${l.url}">Otvori oglas</a>  <i>(${source})</i>`);
  lines.push(`${"─".repeat(26)}`);

  return lines.join("\n");
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
