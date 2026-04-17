#!/usr/bin/env node
// ============================================================
// extract-npcs.js — DOC-110 Phase 0 Chapter 5 (2026-04-17)
// ============================================================
// JSON → sidecar normaliser.
//
// Since the inline `_registerBuiltinPopulations()` block was
// retired from engine/npc-system.js (Phase 0 Ch.5), data/npcs.json
// is the sole source of truth. This script no longer VM-evals the
// engine module; instead it:
//
//   1. Reads data/npcs.json
//   2. Runs every NPC through a field whitelist (cleanDef) that
//      preserves the full authoring schema including the optional
//      `stack` (emoji stack override) and `sprites` (per-intent PNG
//      commission manifest) fields shipped by the NPC Designer
//      (DOC-110 Phase 1.2).
//   3. Rewrites data/npcs.json with deterministic ordering +
//      refreshed _meta
//   4. Rewrites the data/npcs.js sidecar so tools/npc-designer.html
//      can still load via a <script> tag under file://.
//
// This is idempotent: running it on a clean JSON leaves the file
// unchanged aside from a refreshed generatedAt timestamp.
//
// Usage:  node tools/extract-npcs.js [--dry-run]
// Output: data/npcs.json (rewritten) + data/npcs.js (sidecar)
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');

var REPO_ROOT     = path.resolve(__dirname, '..');
var NPCS_JSON     = path.join(REPO_ROOT, 'data', 'npcs.json');
var NPCS_SIDECAR  = path.join(REPO_ROOT, 'data', 'npcs.js');

var DRY_RUN = process.argv.includes('--dry-run');

// ── Load current JSON ────────────────────────────────────────

if (!fs.existsSync(NPCS_JSON)) {
  console.error('[extract-npcs] data/npcs.json not found at ' + NPCS_JSON);
  console.error('[extract-npcs] This tool is a JSON normaliser — author NPCs via');
  console.error('[extract-npcs] tools/npc-designer.html and save them first.');
  process.exit(2);
}

var raw;
try {
  raw = JSON.parse(fs.readFileSync(NPCS_JSON, 'utf8'));
} catch (e) {
  console.error('[extract-npcs] Failed to parse data/npcs.json: ' + e.message);
  process.exit(3);
}

if (!raw || typeof raw !== 'object' || !raw.npcsByFloor) {
  console.error('[extract-npcs] data/npcs.json is missing `npcsByFloor` root.');
  process.exit(3);
}

// ── Normalise + sort for deterministic output ────────────────

var npcsByFloor = {};
var total = 0;
Object.keys(raw.npcsByFloor).sort(sortFloorIds).forEach(function (floorId) {
  var list = (raw.npcsByFloor[floorId] || []).slice().sort(function (a, b) {
    return (a.id || '').localeCompare(b.id || '');
  });
  npcsByFloor[floorId] = list.map(function (d) {
    return cleanDef(d, floorId);
  });
  total += list.length;
});

/**
 * Produce a deterministic NPC envelope matching tools/actor-schema.json,
 * extended with the optional `stack` and `sprites` fields added in
 * DOC-110 Phase 1.2. Unknown keys are dropped so hand-edits cannot
 * silently smuggle new fields into the runtime.
 *
 * Missing optional fields default to the schema default (null / false /
 * unchanged). We do NOT synthesise values for missing `x`, `y`, `type`
 * etc. — those are caller bugs and should round-trip as-is so the
 * author sees the problem in the Designer.
 */
function cleanDef(d, floorId) {
  var clean = {
    kind:           'npc',
    id:             d.id,
    type:           d.type,
    floorId:        floorId,
    x:              d.x,
    y:              d.y,
    facing:         d.facing,
    name:           d.name,
    emoji:          d.emoji,
    role:           d.role || null,
    patrolPoints:   d.patrolPoints || null,
    stepInterval:   d.stepInterval,
    barkPool:       d.barkPool,
    barkRadius:     d.barkRadius,
    barkInterval:   d.barkInterval,
    talkable:       !!d.talkable,
    dialoguePool:   d.dialoguePool,
    dialogueTreeId: d.dialogueTreeId || (d.dialogueTree ? '__inline__' : null),
    factionId:      d.factionId,
    blocksMovement: !!d.blocksMovement,
    gateCheck:      d.gateCheck || null,
    verbArchetype:  d.verbArchetype || null,
    verbSet:        d.verbSet || null,
    verbFaction:    d.verbFaction || null
  };

  // ── Optional: pinned emoji stack (SPRITE_STACK_ROADMAP §3) ──
  // Composer mode leaves stack null — runtime generates from seed.
  // Pinned mode materialises the 7-slot object hand-tuned by an
  // author; we persist it verbatim.
  if (d.stack && typeof d.stack === 'object') {
    clean.stack = normaliseStack(d.stack);
  } else {
    clean.stack = null;
  }

  // ── Optional: sprite commission manifest (DOC-110 Phase 1.2) ──
  // A 6×4 grid of asset-id series keyed by `<slot>_<intent>`, e.g.
  // { "head_talk": [{ assetId, path }, ...] }. Empty series are
  // dropped; absent `sprites` stays null so authoring can be
  // incremental (commission head_walk first, torso_walk later).
  if (d.sprites && typeof d.sprites === 'object') {
    clean.sprites = normaliseSprites(d.sprites);
    if (!Object.keys(clean.sprites).length) clean.sprites = null;
  } else {
    clean.sprites = null;
  }

  return clean;
}

/**
 * Deep-clone a stack object preserving only the schema 1-for-1 keys
 * (head/torso/legs/hat/frontWeapon/backWeapon/death + tintHue).
 * Silently drops unknown keys.
 */
function normaliseStack(s) {
  var out = {};
  var slots = ['head', 'torso', 'legs', 'hat', 'frontWeapon', 'backWeapon', 'death'];
  slots.forEach(function (slot) {
    if (s[slot] == null) return;
    if (typeof s[slot] === 'string') {
      out[slot] = s[slot];
      return;
    }
    if (typeof s[slot] === 'object') {
      var slotOut = {};
      if (typeof s[slot].glyph === 'string') slotOut.glyph = s[slot].glyph;
      if (typeof s[slot].scale === 'number') slotOut.scale = s[slot].scale;
      if (typeof s[slot].offsetX === 'number') slotOut.offsetX = s[slot].offsetX;
      if (typeof s[slot].behind === 'boolean') slotOut.behind = s[slot].behind;
      out[slot] = slotOut;
    }
  });
  if (s.tintHue === null) out.tintHue = null;
  else if (typeof s.tintHue === 'number') out.tintHue = s.tintHue;
  return out;
}

/**
 * Deep-clone a sprites manifest preserving only `<slot>_<intent>` keys
 * whose value is a non-empty array of `{ assetId, path }` entries.
 */
function normaliseSprites(sp) {
  var out = {};
  Object.keys(sp).forEach(function (key) {
    if (!/^(head|torso|legs|hat|frontWeapon|backWeapon)_(locomotion|interaction|dialogue|combat)$/.test(key)) return;
    var series = sp[key];
    if (!Array.isArray(series) || !series.length) return;
    var frames = series.map(function (f) {
      if (!f || typeof f !== 'object') return null;
      if (typeof f.assetId !== 'string' || !f.assetId) return null;
      return {
        assetId: f.assetId,
        path:    typeof f.path === 'string' ? f.path : null
      };
    }).filter(Boolean);
    if (frames.length) out[key] = frames;
  });
  return out;
}

function sortFloorIds(a, b) {
  var pa = a.split('.').map(Number);
  var pb = b.split('.').map(Number);
  for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
    var da = pa[i] == null ? -1 : pa[i];
    var db = pb[i] == null ? -1 : pb[i];
    if (da !== db) return da - db;
  }
  return 0;
}

// ── Write ────────────────────────────────────────────────────

var output = {
  _meta: {
    generatedFrom: 'data/npcs.json (authored via tools/npc-designer.html)',
    generatedAt:   new Date().toISOString(),
    generator:     'tools/extract-npcs.js (DOC-110 Ch.5 normaliser)',
    schemaRef:     'tools/actor-schema.json',
    note:          'Canonical NPC roster. Edit via tools/npc-designer.html (DOC-110 P1). The inline _registerBuiltinPopulations() fallback was retired in Phase 0 Ch.5 — this JSON is now the sole source of truth at runtime (loaded by engine/npc-seed.js).',
    floorCount:    Object.keys(npcsByFloor).length,
    npcCount:      total
  },
  npcsByFloor: npcsByFloor
};

if (DRY_RUN) {
  console.log('[extract-npcs] DRY RUN');
  console.log('  floors: ' + Object.keys(npcsByFloor).length);
  console.log('  npcs:   ' + total);
  console.log('  target: ' + NPCS_JSON);
  console.log('');
  Object.keys(npcsByFloor).forEach(function (f) {
    var withStack   = npcsByFloor[f].filter(function (n) { return n.stack;   }).length;
    var withSprites = npcsByFloor[f].filter(function (n) { return n.sprites; }).length;
    console.log('  [' + f + ']  ' + npcsByFloor[f].length + ' NPCs'
      + (withStack   ? '  stack:'   + withStack   : '')
      + (withSprites ? '  sprites:' + withSprites : ''));
  });
  process.exit(0);
}

var jsonText = JSON.stringify(output, null, 2);
fs.writeFileSync(NPCS_JSON, jsonText + '\n', 'utf8');
console.log('[extract-npcs] Wrote ' + total + ' NPCs across '
  + Object.keys(npcsByFloor).length + ' floor(s) to ' + NPCS_JSON);

// ── Sidecar .js wrapper for browser tools under file:// ─────────
// DOC-110 Phase 1 (NPC Designer) reads data/npcs.json under file://
// where Chromium-family browsers block JSON fetches. The sidecar
// exposes the same payload as window.NPCS_DATA so a regular
// <script> tag works without CORS friction. Mirrors the
// tools/floor-data.js pattern produced by extract-floors.js.
fs.writeFileSync(NPCS_SIDECAR,
  '// AUTO-GENERATED by tools/extract-npcs.js — do not edit by hand.\n' +
  '// Sidecar wrapper so tools/npc-designer.html works under file://\n' +
  '// (bypasses Chromium CORS fetch block). Keep in sync with data/npcs.json.\n' +
  'window.NPCS_DATA = ' + jsonText + ';\n', 'utf8');
console.log('[extract-npcs] Sidecar -> ' + NPCS_SIDECAR);
