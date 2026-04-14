import "dotenv/config";

const REQUIRED_ENV_VARS = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"];
const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(`[config] Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

export const config = {
  channels: (process.env.NOTIFICATION_CHANNELS || "telegram")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },

  email: {
    host: process.env.EMAIL_SMTP_HOST,
    port: Number(process.env.EMAIL_SMTP_PORT) || 587,
    secure: process.env.EMAIL_SMTP_SECURE === "true",
    user: process.env.EMAIL_SMTP_USER,
    pass: process.env.EMAIL_SMTP_PASS,
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
  },

  webhook: {
    url: process.env.WEBHOOK_URL,
    secret: process.env.WEBHOOK_SECRET || null,
  },

  cron: process.env.CRON_SCHEDULE || "0 12 * * *",

  cities: process.env.CITIES
    ? process.env.CITIES.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [process.env.FILTER_CITY || "osijek"],

  filters: {
    cities: process.env.FILTER_CITIES
      ? process.env.FILTER_CITIES.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [(process.env.FILTER_CITY || "osijek").toLowerCase()],
    city: process.env.FILTER_CITY || "osijek",
    type: process.env.FILTER_TYPE || "all", // all | stan | kuca
    priceMin: Number(process.env.FILTER_PRICE_MIN) || 0,
    priceMax: Number(process.env.FILTER_PRICE_MAX) || 200000,
    sizeMin: Number(process.env.FILTER_SIZE_MIN) || 0,
    sizeMax: Number(process.env.FILTER_SIZE_MAX) || 500,
    roomsMin: Number(process.env.FILTER_ROOMS_MIN) || 0,
    roomsMax: Number(process.env.FILTER_ROOMS_MAX) || 10,
    floorMin: process.env.FILTER_FLOOR_MIN !== undefined ? Number(process.env.FILTER_FLOOR_MIN) : null,
    floorMax: process.env.FILTER_FLOOR_MAX !== undefined ? Number(process.env.FILTER_FLOOR_MAX) : null,
    locations: process.env.FILTER_LOCATIONS
      ? process.env.FILTER_LOCATIONS.split(",").map((s) => s.trim().toLowerCase())
      : [],
    neighborhoods: process.env.FILTER_NEIGHBORHOODS
      ? process.env.FILTER_NEIGHBORHOODS.split(",").map((s) => s.trim().toLowerCase())
      : [],
    sortBy: process.env.FILTER_SORT_BY || "price", // price | size | rooms | none
    sortOrder: process.env.FILTER_SORT_ORDER || "asc", // asc | desc
    amenities: process.env.FILTER_AMENITIES
      ? process.env.FILTER_AMENITIES.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [],
    orientations: process.env.FILTER_ORIENTATIONS
      ? process.env.FILTER_ORIENTATIONS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [],
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

  customScrapers: (() => {
    const raw = process.env.CUSTOM_SCRAPERS;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("must be a JSON array");
      return parsed;
    } catch (err) {
      console.error(`[config] Invalid CUSTOM_SCRAPERS JSON: ${err.message}`);
      process.exit(1);
    }
  })(),
};
