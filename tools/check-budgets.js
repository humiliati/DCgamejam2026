#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  tools/check-budgets.js — Pass 0.6
//
//  Zero-dependency file-size budget checker for the Blockout
//  Visualizer and CLI. Prints a report and exits non-zero if any
//  file exceeds its hard cap.
//
//  Usage:
//    node tools/check-budgets.js              # report + exit code
//    node tools/check-budgets.js --json       # machine-readable
//    node tools/check-budgets.js --verbose    # list every file
//
//  LOC is measured as line count (wc -l semantics) — good enough
//  for "did this file balloon?" signal without tokenizing.
// ═══════════════════════════════════════════════════════════════
'use strict';

var fs   = require('fs');
var path = require('path');

var REPO_ROOT = path.resolve(__dirname, '..');

// First match wins. Keep most specific rules at the top.
var BUDGETS = [
  // --- Pass 0 scope: tools/ (tight) ---
  { glob: 'tools/js/bv-bo-router.js',    warn: 900,  fail: 1200, note: 'Pass 0.1: DDA/stamp router. Split deferred.' },
  { glob: 'tools/js/world-designer.js',  warn: 800,  fail: 1100, note: 'Standalone designer — separate entry.' },
  { glob: 'tools/js/bv-meta-editor.js',  warn: 450,  fail: 600,  note: 'Tier 3 metadata panel.' },
  { glob: 'tools/js/bv-validation.js',   warn: 450,  fail: 600,  note: 'Tier 2 validation.' },
  { glob: 'tools/js/bv-verb-nodes.js',   warn: 750,  fail: 950,  note: 'DOC-110 P3 Ch.2 verb-node layer (render + state + template stamper + faction palette + export).' },
  { glob: 'tools/js/bv-scenes.js',       warn: 400,  fail: 500,  note: 'Tier 4 window-scene editor.' },
  { glob: 'tools/js/bv-*.js',            warn: 300,  fail: 450,  note: 'Pass 0 target: < 300 LOC per bv-* module.' },
  { glob: 'tools/cli/commands-*.js',     warn: 200,  fail: 300,  note: 'CLI command module (topic-scoped).' },
  { glob: 'tools/cli/shared.js',         warn: 250,  fail: 350,  note: 'CLI shared helpers.' },
  { glob: 'tools/blockout-cli.js',       warn: 150,  fail: 250,  note: 'Dispatcher only — command bodies live in cli/.' },
  { glob: 'tools/check-budgets.js',      warn: 250,  fail: 400,  note: 'This checker.' },

  // CSS
  { glob: 'tools/css/blockout-visualizer.css', warn: 500, fail: 700, note: 'Extracted Pass 0.2.' },
  { glob: 'tools/css/*.css',             warn: 600,  fail: 900,  note: 'Designer stylesheet.' },

  // --- Engine (ratcheted to current-value + headroom; drop post-jam) ---
  { glob: 'engine/texture-atlas.js',     warn: 6500, fail: 7500, note: 'Procedural texture gen; sprite list ballooned.' },
  { glob: 'engine/menu-faces.js',        warn: 4800, fail: 5500, note: 'Menu face assets — art data.' },
  { glob: 'engine/game.js',              warn: 4000, fail: 4500, note: 'Post Layer 3.5 extraction target: drop cap to 600/900.' },
  { glob: 'engine/floor-manager.js',     warn: 3200, fail: 3600, note: 'Floor lifecycle + blockout loading.' },
  { glob: 'engine/raycaster.js',         warn: 3200, fail: 3700, note: 'Raycaster core. Phase 4 DDA split deferred post-jam.' },
  { glob: 'engine/npc-system.js',        warn: 2200, fail: 2600, note: 'NPC system.' },
  { glob: 'engine/title-screen.js',      warn: 2000, fail: 2400, note: 'Title screen + character creation flow.' },
  { glob: 'engine/card-fan.js',          warn: 1900, fail: 2200, note: 'Card fan UI.' },
  { glob: 'engine/*.js',                 warn: 1400, fail: 2000, note: 'Engine module (default cap).' }
];

// ── Helpers ────────────────────────────────────────────────────
function globToRegex(g) {
  // small glob: '*' matches anything-not-slash, '**' matches anything.
  var re = '^' + g
    .replace(/[.+^${}()|\[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DS::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DS::/g, '.*')
    + '$';
  return new RegExp(re);
}
var BUDGET_RES = BUDGETS.map(function(b) {
  return { re: globToRegex(b.glob), warn: b.warn, fail: b.fail, glob: b.glob, note: b.note };
});

function matchBudget(relPath) {
  for (var i = 0; i < BUDGET_RES.length; i++) {
    if (BUDGET_RES[i].re.test(relPath)) return BUDGET_RES[i];
  }
  return null;
}

function countLines(absPath) {
  var buf = fs.readFileSync(absPath);
  var n = 0;
  for (var i = 0; i < buf.length; i++) if (buf[i] === 0x0A) n++;
  if (buf.length && buf[buf.length - 1] !== 0x0A) n++;
  return n;
}

function walk(dir, out, skip) {
  var entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { return; }
  entries.forEach(function(e) {
    if (skip.indexOf(e.name) !== -1) return;
    var abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out, skip);
    else out.push(abs);
  });
}

// ── Main ───────────────────────────────────────────────────────
var args = process.argv.slice(2);
var asJson = args.indexOf('--json') !== -1;
var verbose = args.indexOf('--verbose') !== -1 || args.indexOf('-v') !== -1;

var skip = ['.git', 'node_modules', '.code-review-graph', '__pycache__',
            'EyesOnly', 'raycast.js-master', 'dcexjam2025'];
var files = [];
walk(REPO_ROOT, files, skip);

var results = [];
files.forEach(function(abs) {
  var rel = path.relative(REPO_ROOT, abs).replace(/\\/g, '/');
  if (!/\.(js|css)$/.test(rel)) return;
  var b = matchBudget(rel);
  if (!b) return;
  var loc = countLines(abs);
  var status = 'ok';
  if (loc >= b.fail) status = 'fail';
  else if (loc >= b.warn) status = 'warn';
  results.push({ path: rel, loc: loc, warn: b.warn, fail: b.fail, status: status, glob: b.glob, note: b.note });
});

var rank = { fail: 0, warn: 1, ok: 2 };
results.sort(function(a, b) {
  if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
  return b.loc - a.loc;
});

function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

if (asJson) {
  process.stdout.write(JSON.stringify({
    total: results.length,
    fails: results.filter(function(r){return r.status==='fail';}).length,
    warns: results.filter(function(r){return r.status==='warn';}).length,
    results: results
  }, null, 2) + '\n');
} else {
  var fails = results.filter(function(r){return r.status==='fail';});
  var warns = results.filter(function(r){return r.status==='warn';});
  process.stdout.write('== File-size budgets ==\n');
  process.stdout.write('  matched: ' + results.length + '    warn: ' + warns.length + '    fail: ' + fails.length + '\n\n');
  if (fails.length) {
    process.stdout.write('FAIL (>= fail cap):\n');
    fails.forEach(function(r) {
      process.stdout.write('  ' + pad(r.loc, 5) + ' ' + pad(r.path, 44) + ' (cap ' + r.fail + ')  ' + r.note + '\n');
    });
    process.stdout.write('\n');
  }
  if (warns.length) {
    process.stdout.write('WARN (>= warn cap):\n');
    warns.forEach(function(r) {
      process.stdout.write('  ' + pad(r.loc, 5) + ' ' + pad(r.path, 44) + ' (warn ' + r.warn + ', cap ' + r.fail + ')\n');
    });
    process.stdout.write('\n');
  }
  if (verbose) {
    process.stdout.write('OK:\n');
    results.filter(function(r){return r.status==='ok';}).forEach(function(r) {
      process.stdout.write('  ' + pad(r.loc, 5) + ' ' + pad(r.path, 44) + ' (warn ' + r.warn + ')\n');
    });
  }
}

process.exit(results.some(function(r){return r.status==='fail';}) ? 1 : 0);
