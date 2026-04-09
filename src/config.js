import "dotenv/config";

export const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },

  cron: process.env.CRON_SCHEDULE || "0 12 * * *",

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
    keywords: process.env.FILTER_KEYWORDS
      ? process.env.FILTER_KEYWORDS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [],
    excludeKeywords: process.env.FILTER_EXCLUDE_KEYWORDS
      ? process.env.FILTER_EXCLUDE_KEYWORDS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [],
  },

  sort: {
    by: process.env.SORT_BY || "date", // date | price | size
    order: process.env.SORT_ORDER || "desc", // asc | desc
  },

  dedupeThreshold: Number(process.env.DEDUPE_THRESHOLD) || 0.85,

  notification: {
    showPrice: process.env.NOTIFY_SHOW_PRICE !== "false",
    showSize: process.env.NOTIFY_SHOW_SIZE !== "false",
    showRooms: process.env.NOTIFY_SHOW_ROOMS !== "false",
    showLocation: process.env.NOTIFY_SHOW_LOCATION !== "false",
    showSource: process.env.NOTIFY_SHOW_SOURCE !== "false",
    showDescription: process.env.NOTIFY_SHOW_DESCRIPTION !== "false",
    disablePreview: process.env.NOTIFY_DISABLE_PREVIEW === "true",
    customHeader: process.env.NOTIFY_CUSTOM_HEADER || "",
  },
};
