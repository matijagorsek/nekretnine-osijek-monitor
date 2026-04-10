import fetch from "node-fetch";
import { config } from "./config.js";

const API_BASE = `https://api.telegram.org/bot${config.telegram.botToken}`;

/**
 * Send a single Telegram message (Markdown V2)
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
        disable_web_page_preview: false,
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
  const citiesInBatch = [...new Set(listings.map((l) => l.city || "osijek"))];
  const citiesLabel = citiesInBatch.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(", ");
  const header = `🏠 <b>Nove nekretnine: ${citiesLabel}</b>\n📅 ${new Date().toLocaleDateString("hr-HR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n🔍 Pronađeno: <b>${listings.length}</b> novih oglasa\n${"═".repeat(28)}`;

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
  for (const msg of messages) {
    const ok = await sendMessage(msg);
    if (ok) success++;
    // Rate limit: max 30 msgs/sec
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`[telegram] Sent ${success}/${messages.length} messages for ${listings.length} listings`);
}

function formatListing(l) {
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
