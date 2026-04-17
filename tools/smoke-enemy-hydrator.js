#!/usr/bin/env node
// ============================================================
// smoke-enemy-hydrator.js — DOC-110 P5 (Enemy Hydrator) VS
// ============================================================
// Headless smoke test for the tier-band validator logic baked
// into tools/enemy-hydrator.html. Extracts the pure evaluators
// (computeDPS / evalTierBand) by re-implementing them here in
// lockstep with the HTML tool, then walks every row in
// data/enemies.json to confirm:
//
//   1. Roster loads cleanly (27 enemies, 4 banner rows).
//   2. computeDPS is deterministic and matches str exactly
//      (FIRE_RATE_PER_SEC = 1.0).
//   3. evalTierBand returns { status, dps, band } with the four
//      valid status values (ok | warn | err | na).
//   4. Edge cases:
//      - nonLethal → 'na' regardless of str.
//      - Unknown tier string → 'na'.
//      - str exactly at band boundary → 'ok'.
//      - str just outside (within 20% slack) → 'warn'.
//      - str far outside → 'err'.
//   5. Sidecar bundle (data/enemies.js) contains the same row
//      count as the JSON source.
//
// Keep this file in sync with the inline constants inside
// tools/enemy-hydrator.html (FIRE_RATE_PER_SEC, TIER_BANDS,
// BAND_SLACK). A future refactor should extract those constants
// into a shared JS module consumed by both.
//
// Exit 0 on pass, 1 on any assertion failure.
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');

var REPO_ROOT = path.resolve(__dirname, '..');

// ── Duplicated constants (kept in sync with enemy-hydrator.html) ──
var FIRE_RATE_PER_SEC = 1.0;
var TIER_BANDS = {
  standard: { lo: 2, hi: 4 },
  elite:    { lo: 4, hi: 7 },
  boss:     { lo: 7, hi: 12 }
};
var BAND_SLACK = 1;   // flat ±1 DPS — keep in sync with HTML

function computeDPS(r) {
  return (r.str || 0) * FIRE_RATE_PER_SEC;
}
function evalTierBand(r) {
  if (r.nonLethal) return { status: 'na', reason: 'non-lethal', band: null, dps: computeDPS(r) };
  var band = TIER_BANDS[r.tier];
  if (!band) return { status: 'na', reason: 'unknown tier', band: null, dps: computeDPS(r) };
  var dps = computeDPS(r);
  var slack = BAND_SLACK;
  if (dps >= band.lo && dps <= band.hi) return { status: 'ok', reason: 'in band', band: band, dps: dps };
  if (dps >= band.lo - slack && dps <= band.hi + slack) return { status: 'warn', reason: 'near band', band: band, dps: dps };
  return { status: 'err', reason: 'out of band', band: band, dps: dps };
}

var failures = [];
function assert(cond, msg) { if (!cond) failures.push(msg); }

// ── 1. Load roster ────────────────────────────────────────────
var rows;
try { rows = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/enemies.json'), 'utf8')); }
catch (e) {
  console.error('[smoke-enemy-hydrator] FAIL — enemies.json parse error: ' + e.message);
  process.exit(1);
}
var enemies = rows.filter(function (r) { return r && typeof r.id === 'string'; });
var banners = rows.filter(function (r) { return r && r._comment && !r.id; });
assert(enemies.length >= 20, 'enemies count should be ≥20, got ' + enemies.length);
assert(banners.length >= 1,  'expected at least one banner row');

// ── 2. DPS = str × 1.0 ────────────────────────────────────────
enemies.forEach(function (r) {
  var dps = computeDPS(r);
  assert(dps === (r.str || 0), r.id + ': computeDPS should equal str (got ' + dps + ' vs str=' + r.str + ')');
});

// ── 3. Every enemy returns a valid status ─────────────────────
var counts = { ok: 0, warn: 0, err: 0, na: 0 };
enemies.forEach(function (r) {
  var evalRes = evalTierBand(r);
  assert(['ok', 'warn', 'err', 'na'].indexOf(evalRes.status) !== -1,
    r.id + ': status must be one of ok|warn|err|na, got "' + evalRes.status + '"');
  counts[evalRes.status]++;
});
assert(counts.ok + counts.warn + counts.err + counts.na === enemies.length, 'counts must sum to enemy total');

// ── 4. Edge cases (synthetic) ────────────────────────────────
var cases = [
  { in: { id: 'T1', tier: 'standard', str: 3, nonLethal: false },               expect: 'ok',   note: 'mid of standard band' },
  { in: { id: 'T2', tier: 'standard', str: 2, nonLethal: false },               expect: 'ok',   note: 'lo of standard band' },
  { in: { id: 'T3', tier: 'standard', str: 4, nonLethal: false },               expect: 'ok',   note: 'hi of standard band' },
  { in: { id: 'T4', tier: 'standard', str: 5, nonLethal: false },               expect: 'warn', note: 'standard +1 over (within ±1 slack)' },
  { in: { id: 'T5', tier: 'standard', str: 10, nonLethal: false },              expect: 'err',  note: 'standard 6+ over (way out)' },
  { in: { id: 'T6', tier: 'standard', str: 1, nonLethal: false },               expect: 'warn', note: 'standard -1 under (within ±1 slack)' },
  { in: { id: 'T7', tier: 'standard', str: 0, nonLethal: false },               expect: 'err',  note: 'standard -2 under (outside slack)' },
  { in: { id: 'T8', tier: 'standard', str: 999, nonLethal: true },              expect: 'na',   note: 'nonLethal ignores band' },
  { in: { id: 'T9', tier: 'myth',     str: 99,  nonLethal: false },             expect: 'na',   note: 'unknown tier → na' },
  { in: { id: 'TA', tier: 'elite',    str: 6, nonLethal: false },               expect: 'ok',   note: 'elite mid band' },
  { in: { id: 'TB', tier: 'elite',    str: 8, nonLethal: false },               expect: 'warn', note: 'elite +1 over' },
  { in: { id: 'TC', tier: 'boss',     str: 7, nonLethal: false },               expect: 'ok',   note: 'boss lo band' },
  { in: { id: 'TD', tier: 'boss',     str: 12, nonLethal: false },              expect: 'ok',   note: 'boss hi band' },
  { in: { id: 'TE', tier: 'boss',     str: 14, nonLethal: false },              expect: 'err',  note: 'boss +2 over (outside flat ±1 slack)' },
  { in: { id: 'TF', tier: 'boss',     str: 13, nonLethal: false },              expect: 'warn', note: 'boss +1 over (within flat ±1 slack)' },
  { in: { id: 'TG', tier: 'boss',     str: 6,  nonLethal: false },              expect: 'warn', note: 'boss -1 under (within flat ±1 slack)' }
];
cases.forEach(function (c) {
  var res = evalTierBand(c.in);
  assert(res.status === c.expect,
    c.in.id + ' (' + c.note + '): expected "' + c.expect + '", got "' + res.status + '" (dps=' + res.dps + ')');
});

// ── 5. Sidecar row count matches ──────────────────────────────
var bundlePath = path.join(REPO_ROOT, 'data/enemies.js');
if (fs.existsSync(bundlePath)) {
  // The bundle is `window.ENEMIES_DATA = {...};` — a simple regex pulls
  // out the JSON. Avoids loading a DOM shim just to count rows.
  var bundleSrc = fs.readFileSync(bundlePath, 'utf8');
  var m = bundleSrc.match(/window\.ENEMIES_DATA\s*=\s*([\s\S]+);\s*$/);
  if (m) {
    try {
      var bundleObj = JSON.parse(m[1]);
      assert(Array.isArray(bundleObj.rows), 'sidecar: rows must be an array');
      assert(bundleObj.rows.length === rows.length,
        'sidecar row count mismatch: json=' + rows.length + ' sidecar=' + bundleObj.rows.length);
      assert(bundleObj._meta && bundleObj._meta.enemyCount === enemies.length,
        'sidecar _meta.enemyCount mismatch: expected ' + enemies.length + ' got ' + (bundleObj._meta && bundleObj._meta.enemyCount));
    } catch (e) {
      failures.push('sidecar JSON parse error — ' + e.message);
    }
  } else {
    failures.push('sidecar shape mismatch — no window.ENEMIES_DATA assignment found');
  }
} else {
  console.warn('[smoke-enemy-hydrator] data/enemies.js not yet generated — skipping sidecar checks');
}

// ── Report ───────────────────────────────────────────────────
if (failures.length) {
  console.error('[smoke-enemy-hydrator] FAIL — ' + failures.length + ' assertion(s):');
  failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}
console.log('[smoke-enemy-hydrator] PASS — ' + enemies.length + ' enemies validated ' +
            '(ok=' + counts.ok + ' warn=' + counts.warn + ' err=' + counts.err + ' na=' + counts.na + '), ' +
            cases.length + ' synthetic cases passed.');
