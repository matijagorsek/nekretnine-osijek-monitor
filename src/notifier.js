import fetch from "node-fetch";
import { createTransport } from "nodemailer";
import * as telegram from "./telegram.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

// ─── Email helpers ───

function buildListingsHtml(listings) {
  return listings.map((l) => {
    const price = l.price ? `${l.price.toLocaleString("hr-HR")} €` : "Cijena na upit";
    const size = l.size ? ` | ${l.size} m²` : "";
    const rooms = l.rooms ? ` | ${l.rooms} sobe` : "";
    const location = l.location ? ` | ${l.location}` : "";
    return (
      `<li style="margin-bottom:12px">` +
      `<b>${l.title}</b><br>${price}${size}${rooms}${location}<br>` +
      `<a href="${l.url}">${l.url}</a></li>`
    );
  }).join("");
}

async function sendEmailNotification(subject, html) {
  const { host, port, secure, user, pass, from, to } = config.email;
  if (!host || !user || !pass || !from || !to) {
    logger.error("[email] Missing required email configuration");
    return;
  }
  try {
    const transporter = createTransport({ host, port, secure, auth: { user, pass } });
    await transporter.sendMail({ from, to, subject, html });
    logger.info("[email] Notification sent");
  } catch (err) {
    logger.error(`[email] Send failed: ${err.message}`);
  }
}

// ─── Webhook helpers ───

async function sendWebhookNotification(event, payload) {
  const { url, secret } = config.webhook;
  if (!url) {
    logger.error("[webhook] Missing WEBHOOK_URL");
    return;
  }
  try {
    const headers = { "Content-Type": "application/json" };
    if (secret) headers["X-Webhook-Secret"] = secret;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload }),
    });
    if (!resp.ok) {
      logger.error(`[webhook] Request failed: ${resp.status} ${resp.statusText}`);
    } else {
      logger.info(`[webhook] Notification sent (${event})`);
    }
  } catch (err) {
    logger.error(`[webhook] Error: ${err.message}`);
  }
}

// ─── Dispatcher ───

const channels = config.channels;

export async function notifyNewListings(listings) {
  const tasks = [];
  if (channels.includes("telegram")) tasks.push(telegram.notifyNewListings(listings));
  if (channels.includes("email")) {
    const html =
      `<h2>🏠 Nove nekretnine u Osijeku</h2>` +
      `<p>Pronađeno: <b>${listings.length}</b> novih oglasa — ` +
      `${new Date().toLocaleDateString("hr-HR")}</p>` +
      `<ul>${buildListingsHtml(listings)}</ul>`;
    tasks.push(sendEmailNotification("🏠 Nove nekretnine u Osijeku", html));
  }
  if (channels.includes("webhook")) tasks.push(sendWebhookNotification("new_listings", listings));
  await Promise.allSettled(tasks);
}

export async function notifyPriceDrop(listing, oldPrice, isFav = false) {
  const tasks = [];
  if (channels.includes("telegram")) tasks.push(telegram.notifyPriceDrop(listing, oldPrice, isFav));
  if (channels.includes("email")) {
    const drop = oldPrice - listing.price;
    const pct = ((drop / oldPrice) * 100).toFixed(1);
    const html =
      `<h2>📉 Pad cijene${isFav ? " — omiljeni oglas!" : "!"}</h2>` +
      `<p><b>${listing.title}</b></p>` +
      `<p>Stara cijena: ${oldPrice.toLocaleString("hr-HR")} €<br>` +
      `Nova cijena: <b>${listing.price.toLocaleString("hr-HR")} €</b><br>` +
      `Uštedite: -${drop.toLocaleString("hr-HR")} € (-${pct}%)</p>` +
      `<p><a href="${listing.url}">${listing.url}</a></p>`;
    tasks.push(sendEmailNotification(`📉 Pad cijene: ${listing.title}`, html));
  }
  if (channels.includes("webhook")) tasks.push(sendWebhookNotification("price_drop", { listing, oldPrice }));
  await Promise.allSettled(tasks);
}

export async function notifySimilarListing(newListing, favListing) {
  const tasks = [];
  if (channels.includes("telegram")) tasks.push(telegram.notifySimilarListing(newListing, favListing));
  if (channels.includes("email")) {
    const html =
      `<h2>🔔 Novi oglas sličan omiljenom!</h2>` +
      `<p><b>${newListing.title}</b></p>` +
      `<p><a href="${newListing.url}">${newListing.url}</a></p>` +
      `<p><i>Slično s: ${favListing.title}</i></p>`;
    tasks.push(sendEmailNotification(`🔔 Sličan oglas: ${newListing.title}`, html));
  }
  if (channels.includes("webhook")) tasks.push(sendWebhookNotification("similar_listing", { newListing, favListing }));
  await Promise.allSettled(tasks);
}

export async function sendTestMessage() {
  const tasks = [];
  if (channels.includes("telegram")) tasks.push(telegram.sendTestMessage());
  if (channels.includes("email")) {
    const html =
      `<h2>✅ Nekretnine Monitor — Aktivan!</h2>` +
      `<p>Aktivni kanali: <b>${channels.join(", ")}</b></p>` +
      `<p>Raspored: ${config.cron}<br>` +
      `Gradovi: ${config.filters.cities.join(", ")}<br>` +
      `Cijena: ${config.filters.priceMin.toLocaleString()} – ${config.filters.priceMax.toLocaleString()} €</p>`;
    tasks.push(sendEmailNotification("✅ Nekretnine Monitor — Aktivan!", html));
  }
  if (channels.includes("webhook")) tasks.push(sendWebhookNotification("startup", { channels }));
  await Promise.allSettled(tasks);
}

// Telegram-only pass-throughs (interactive bot features)
export { sendStats, sendFilterStatus, startPolling, answerCallbackQuery } from "./telegram.js";
