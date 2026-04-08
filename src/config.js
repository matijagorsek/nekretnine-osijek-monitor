import "dotenv/config";

const REQUIRED_ENV_VARS = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"];
const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(`[config] Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

export const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },

  cron: process.env.CRON_SCHEDULE || "0 12 * * *",

  cities: process.env.CITIES
    ? process.env.CITIES.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [process.env.FILTER_CITY || "osijek"],

  filters: {
    city: process.env.FILTER_CITY || "osijek",
    type: process.env.FILTER_TYPE || "all", // all | stan | kuca
    priceMin: Number(process.env.FILTER_PRICE_MIN) || 0,
    priceMax: Number(process.env.FILTER_PRICE_MAX) || 200000,
    sizeMin: Number(process.env.FILTER_SIZE_MIN) || 0,
    sizeMax: Number(process.env.FILTER_SIZE_MAX) || 500,
    roomsMin: Number(process.env.FILTER_ROOMS_MIN) || 0,
    roomsMax: Number(process.env.FILTER_ROOMS_MAX) || 10,
    locations: process.env.FILTER_LOCATIONS
      ? process.env.FILTER_LOCATIONS.split(",").map((s) => s.trim().toLowerCase())
      : [],
    neighborhoods: process.env.FILTER_NEIGHBORHOODS
      ? process.env.FILTER_NEIGHBORHOODS.split(",").map((s) => s.trim().toLowerCase())
      : [],
    sortBy: process.env.FILTER_SORT_BY || "price", // price | size | rooms | none
    sortOrder: process.env.FILTER_SORT_ORDER || "asc", // asc | desc
  },

  dedupeThreshold: Number(process.env.DEDUPE_THRESHOLD) || 0.85,

  triggers: (() => {
    const raw = process.env.NOTIFICATION_TRIGGERS;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("must be a JSON array");
      return parsed;
    } catch (err) {
      console.error(`[config] Invalid NOTIFICATION_TRIGGERS JSON: ${err.message}`);
      process.exit(1);
    }
  })(),
};
