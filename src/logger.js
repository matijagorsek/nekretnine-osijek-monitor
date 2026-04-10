const LEVEL = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const MIN_LEVEL = LEVEL[process.env.LOG_LEVEL?.toUpperCase()] ?? LEVEL.INFO;

function ts() {
  return new Date().toISOString();
}

function fmt(level, msg, ...args) {
  const extra = args.length ? " " + args.map((a) => (a instanceof Error ? a.stack : String(a))).join(" ") : "";
  return `[${ts()}] [${level}] ${msg}${extra}`;
}

export const logger = {
  debug(msg, ...args) {
    if (MIN_LEVEL <= LEVEL.DEBUG) process.stdout.write(fmt("DEBUG", msg, ...args) + "\n");
  },
  info(msg, ...args) {
    if (MIN_LEVEL <= LEVEL.INFO) process.stdout.write(fmt("INFO", msg, ...args) + "\n");
  },
  warn(msg, ...args) {
    if (MIN_LEVEL <= LEVEL.WARN) process.stderr.write(fmt("WARN", msg, ...args) + "\n");
  },
  error(msg, ...args) {
    if (MIN_LEVEL <= LEVEL.ERROR) process.stderr.write(fmt("ERROR", msg, ...args) + "\n");
  },
};
