import fetch from "node-fetch";
import { config } from "./config.js";

const API_BASE = `https://api.telegram.org/bot${config.telegram.botToken}`;

/**
 * Send a single Telegram message (Markdown V2)
 */
async function sendMessage(text, parseMode = "HTML") {
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
      console.error("[telegram] Send failed:", data.description);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[telegram] Error:", err.message);
    return false;
  }
}

/**
 * Format and send new listings as Telegram notifications.
 * Groups them nicely, respects Telegram's 4096 char limit.
 */
export async function notifyNewListings(listings) {
  if (!listings.length) {
    console.log("[telegram] No new listings to notify.");
    return;
  }

  if (!config.telegram.botToken || !config.telegram.chatId) {
    console.error("[telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return;
  }

  // Header message
  const headerTitle = config.notification.customHeader || "🏠 <b>Nove nekretnine u Osijeku</b>";
  const header = `${headerTitle}\n📅 ${new Date().toLocaleDateString("hr-HR")}\n🔍 Pronađeno: <b>${listings.length}</b> novih oglasa\n${"─".repeat(30)}`;

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
  if (current.trim()) messages.push(current);

  // Send all chunks
  let success = 0;
  for (const msg of messages) {
    const ok = await sendMessage(msg);
    if (ok) success++;
    // Rate limit: max 30 msgs/sec
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`[telegram] Sent ${success}/${messages.length} messages for ${listings.length} listings`);
}

function formatListing(l) {
  const n = config.notification;
  const icon = l.type === "kuca" ? "🏡" : "🏢";
  const source = formatSource(l.source);
  const price = n.showPrice ? (l.price ? `💰 ${l.price.toLocaleString("hr-HR")} €` : "💰 Cijena na upit") : null;
  const size = n.showSize && l.size ? `📐 ${l.size} m²` : null;
  const rooms = n.showRooms && l.rooms ? `🛏 ${l.rooms} sob${l.rooms === 1 ? "a" : l.rooms < 5 ? "e" : "a"}` : null;
  const location = n.showLocation && l.location ? `📍 ${capitalize(l.location)}` : null;

  const details = [price, size, rooms, location].filter(Boolean).join(" • ");
  const sourceTag = n.showSource ? ` <i>(${source})</i>` : "";

  return [
    `${icon} <b>${escapeHtml(l.title)}</b>`,
    details,
    `🔗 <a href="${l.url}">Otvori oglas</a>${sourceTag}`,
  ].filter(Boolean).join("\n");
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
 * Send a test/status message
 */
export async function sendTestMessage() {
  return sendMessage(
    "✅ <b>Nekretnine Monitor — Aktivan!</b>\n\n" +
      `⏰ Raspored: svaki dan u 12:00\n` +
      `🏙 Grad: Osijek\n` +
      `💰 Cijena: ${config.filters.priceMin.toLocaleString()} - ${config.filters.priceMax.toLocaleString()} €\n` +
      `📐 Veličina: ${config.filters.sizeMin} - ${config.filters.sizeMax} m²\n` +
      `🔍 Tip: ${config.filters.type === "all" ? "Stanovi + Kuće" : config.filters.type}\n` +
      `📡 Izvori: Njuškalo, Index, Nekretnine.hr + lokalne agencije`
  );
}
