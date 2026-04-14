import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Set up an isolated temp DB before importing db.js
const tmpDir = mkdtempSync(join(tmpdir(), "nekretnine-test-"));
process.env.DB_PATH = join(tmpDir, "test.db");

const { getDb, recordScraperSuccess, recordScraperFailure } = await import("./db.js");

import assert from "node:assert/strict";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

test("recordScraperSuccess inserts new row with consecutive_failures=0", () => {
  const key = "test-scraper-new";
  const result = recordScraperSuccess(key);

  const row = getDb().prepare("SELECT * FROM scraper_health WHERE key = ?").get(key);
  assert.ok(row, "row should exist");
  assert.equal(row.consecutive_failures, 0);
  assert.ok(row.last_success, "last_success should be set");
  assert.equal(row.first_failure, null);
  assert.equal(result, false, "should return false — was not previously failing");
});

test("recordScraperSuccess clears consecutive_failures and first_failure on recovery", () => {
  const key = "test-scraper-recover";

  recordScraperFailure(key);
  recordScraperFailure(key);

  const before = getDb().prepare("SELECT * FROM scraper_health WHERE key = ?").get(key);
  assert.equal(before.consecutive_failures, 2);
  assert.ok(before.first_failure);

  const result = recordScraperSuccess(key);

  const after = getDb().prepare("SELECT * FROM scraper_health WHERE key = ?").get(key);
  assert.equal(after.consecutive_failures, 0);
  assert.equal(after.first_failure, null);
  assert.ok(after.last_success);
  assert.equal(result, true, "should return true — was previously failing");
});

test("recordScraperSuccess called twice keeps row consistent", () => {
  const key = "test-scraper-double-success";

  recordScraperSuccess(key);
  const result = recordScraperSuccess(key);

  const row = getDb().prepare("SELECT * FROM scraper_health WHERE key = ?").get(key);
  assert.equal(row.consecutive_failures, 0);
  assert.equal(row.first_failure, null);
  assert.equal(result, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
rmSync(tmpDir, { recursive: true, force: true });
if (failed > 0) process.exit(1);
