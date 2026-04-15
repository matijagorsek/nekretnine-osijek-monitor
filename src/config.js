import "dotenv/config";

const REQUIRED_ENV_VARS = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"];
const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(`[config] Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const RENAMED_ENV_VARS = [
  ["FILTER_KEYWORDS", "FILTER_NEIGHBORHOODS"],
  ["NOTIFY_ON_NEW", "NOTIFICATION_TRIGGERS"],
  ["NOTIFY_ON_PRICE_DROP", "NOTIFICATION_TRIGGERS"],
  ["NOTIFY_CHANNELS", "NOTIFICATION_CHANNELS"],
];
const renamedFound = RENAMED_ENV_VARS.filter(([oldKey]) => process.env[oldKey] !== undefined);
if (renamedFound.length > 0) {
  for (const [oldKey, newKey] of renamedFound) {
    console.error(`[config] FATAL: env var "${oldKey}" has been renamed to "${newKey}". Update your deployment and restart.`);
  }
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

  alertThresholds: {
    priceDropMinPct: Number(process.env.ALERT_PRICE_DROP_MIN_PCT) || 0,
    priceDropMinEur: Number(process.env.ALERT_PRICE_DROP_MIN_EUR) || 0,
  },
  notifyMode: (() => {
    const mode = process.env.NOTIFY_MODE || "instant";
    if (!["instant", "digest"].includes(mode)) {
      console.error(`[config] NOTIFY_MODE must be "instant" or "digest", got "${mode}"`);
      process.exit(1);
    }
    return mode;
  })(),

  digestHour: (() => {
    const h = Number(process.env.DIGEST_HOUR ?? 8);
    if (isNaN(h) || h < 0 || h > 23) {
      console.error(`[config] DIGEST_HOUR must be 0–23, got "${process.env.DIGEST_HOUR}"`);
      process.exit(1);
    }
    return h;
  })(),

  triggers: (() => {
    const raw = process.env.NOTIFICATION_TRIGGERS;
    if (!raw) {
      console.error("[config] Missing required environment variable: NOTIFICATION_TRIGGERS");
      process.exit(1);
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("must be a JSON array");
      if (parsed.length === 0) {
        console.error("[config] NOTIFICATION_TRIGGERS must not be empty");
        process.exit(1);
      }
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

  searchProfiles: (() => {
    const raw = process.env.SEARCH_PROFILES;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("must be a JSON array");
      return parsed;
    } catch (err) {
      console.error(`[config] Invalid SEARCH_PROFILES JSON: ${err.message}`);
      process.exit(1);
    }
  })(),
};
