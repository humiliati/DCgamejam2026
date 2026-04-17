#!/usr/bin/env node
// ============================================================
// npc-cli.js — NPC/Enemy authoring CLI (DOC-110 Phase 0 scaffold)
// ============================================================
// Agent- and author-facing CLI for NPC + enemy actor manipulation.
// Mirrors the shape of tools/blockout-cli.js: a top-level dispatcher
// with per-topic commands. Scaffold delivers:
//
//   npc list              — print every NPC + enemy, optionally filtered
//   npc validate          — run coherence checks (DOC-110 §9)
//   npc schema            — print schema summary
//   npc help              — usage
//
// Phase 1+ will expand with `npc create`, `bark orphans`,
// `enemy hydrate`, `population report` (see DOC-110 §5.3).
//
// Exit codes: 0 ok, 1 usage error, 2 validation failure,
//             3 runtime error.
// ============================================================
'use strict';

var fs   = require('fs');
var path = require('path');

// ── Paths ────────────────────────────────────────────────────

var REPO_ROOT = path.resolve(__dirname, '..');
var PATHS = {
  SCHEMA:      path.join(REPO_ROOT, 'tools', 'actor-schema.json'),
  NPCS:        path.join(REPO_ROOT, 'data', 'npcs.json'),           // generated in Phase 0 step 3
  ENEMIES:     path.join(REPO_ROOT, 'data', 'enemies.json'),
  ENEMY_DECKS: path.join(REPO_ROOT, 'data', 'enemy-decks.json'),
  BARKS:       path.join(REPO_ROOT, 'data', 'barks', 'en.js'),
  QUESTS:      path.join(REPO_ROOT, 'data', 'quests.json')
};

// ── Shared helpers ───────────────────────────────────────────

function readJson(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { die(3, 'Failed to parse ' + p + ': ' + e.message); }
}

function die(code, msg) {
  process.stderr.write('[npc-cli] ' + msg + '\n');
  process.exit(code);
}

function parseFlags(argv) {
  var flags = { _rest: [] };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a.slice(0, 2) === '--') {
      var key = a.slice(2);
      var val = true;
      if (i + 1 < argv.length && argv[i + 1].slice(0, 2) !== '--') {
        val = argv[++i];
      }
      flags[key] = val;
    } else {
      flags._rest.push(a);
    }
  }
  return flags;
}

// ── Data loaders ─────────────────────────────────────────────

function loadAllActors() {
  var actors = [];

  // NPCs — DOC-110 Phase 0 Ch.5 (2026-04-17): data/npcs.json is the
  // sole source of truth. The legacy scanNpcSystemJs() regex fallback
  // was removed along with the inline _registerBuiltinPopulations()
  // block in engine/npc-system.js. If the JSON is missing, bail
  // loudly — there is no longer an inline snapshot to fall back on.
  if (!fs.existsSync(PATHS.NPCS)) {
    die(3, 'data/npcs.json not found. Run `node tools/extract-npcs.js` '
         + 'or author NPCs via tools/npc-designer.html first.');
  }
  var npcData = readJson(PATHS.NPCS);
  if (npcData) {
    if (Array.isArray(npcData.npcs)) {
      npcData.npcs.forEach(function (n) { actors.push(normaliseNpc(n)); });
    } else if (npcData.npcsByFloor && typeof npcData.npcsByFloor === 'object') {
      Object.keys(npcData.npcsByFloor).forEach(function (f) {
        (npcData.npcsByFloor[f] || []).forEach(function (n) {
          actors.push(normaliseNpc(Object.assign({ floorId: f }, n)));
        });
      });
    }
  }

  // Enemies — always JSON.
  var enemies = readJson(PATHS.ENEMIES) || [];
  enemies.forEach(function (e) {
    if (e && e.id && !e._comment) actors.push(normaliseEnemy(e));
  });

  return actors;
}

function normaliseNpc(def) {
  return Object.assign({ kind: 'npc' }, def);
}

function normaliseEnemy(def) {
  return Object.assign({ kind: 'enemy' }, def);
}

// Parse data/barks/en.js for pool names (shallow regex — good enough
// for orphan detection).
function loadBarkPools() {
  if (!fs.existsSync(PATHS.BARKS)) return [];
  var src = fs.readFileSync(PATHS.BARKS, 'utf8');
  var pools = {};
  var re = /(['"])([a-z0-9_.]+)\1\s*:\s*\[/g;
  var m;
  while ((m = re.exec(src)) !== null) {
    var key = m[2];
    // Filter out fields that look like keys but aren't pools.
    if (/^(text|speaker|style|weight|oneShot|cooldownMs)$/.test(key)) continue;
    pools[key] = (pools[key] || 0) + 1;
  }
  return Object.keys(pools);
}

// ── Commands ─────────────────────────────────────────────────

function cmdList(flags) {
  var actors = loadAllActors();

  var filtered = actors.filter(function (a) {
    if (flags.kind    && a.kind      !== flags.kind)    return false;
    if (flags.floor   && a.floorId   !== flags.floor)   return false;
    if (flags.faction && a.factionId !== flags.faction) return false;
    if (flags.type    && a.type      !== flags.type)    return false;
    if (flags.biome   && a.kind === 'enemy'
        && (!a.biomes || a.biomes.indexOf(flags.biome) < 0)) return false;
    return true;
  });

  if (flags.json) {
    process.stdout.write(JSON.stringify(filtered, null, 2) + '\n');
    return;
  }

  process.stdout.write(
    'Actors: ' + filtered.length + ' (of ' + actors.length + ' total)\n\n');
  filtered.forEach(function (a) {
    if (a.kind === 'npc') {
      process.stdout.write(
        [ pad(a.id, 28),
          pad(a.type || '—', 12),
          pad(a.floorId || '—', 8),
          pad(a.factionId || '—', 10),
          pad('bark:' + (a.barkPool || '—'), 28),
          a.verbArchetype ? 'arch:' + a.verbArchetype : ''
        ].join(' ') + '\n');
    } else {
      process.stdout.write(
        [ pad(a.id, 10),
          pad(a.name, 28),
          pad(a.tier || '—', 10),
          pad((a.biomes || []).join(','), 16),
          'hp:' + pad(String(a.hp || '—'), 4),
          'str:' + pad(String(a.str || '—'), 3),
          a.suit ? 'suit:' + a.suit : ''
        ].join(' ') + '\n');
    }
  });
}

function cmdValidate(flags) {
  var actors = loadAllActors();
  var pools  = loadBarkPools();
  var issues = [];

  // orphan-bark-pool: pool defined, zero NPCs reference it.
  var referenced = {};
  actors.forEach(function (a) {
    if (a.barkPool)     referenced[a.barkPool] = true;
    if (a.dialoguePool) referenced[a.dialoguePool] = true;
  });
  pools.forEach(function (p) {
    if (!referenced[p]) {
      issues.push({ level: 'warn', check: 'orphan-bark-pool', pool: p });
    }
  });

  // empty-bark-pool: pool referenced, not defined.
  var poolSet = {};
  pools.forEach(function (p) { poolSet[p] = true; });
  actors.forEach(function (a) {
    if (a.barkPool && !poolSet[a.barkPool]) {
      issues.push({ level: 'error', check: 'empty-bark-pool',
                    actor: a.id, pool: a.barkPool });
    }
  });

  // missing-dialogue: talkable NPC with no dialogueTreeId + no dialoguePool.
  actors.forEach(function (a) {
    if (a.kind !== 'npc') return;
    if (a.talkable && !a.dialogueTreeId && !a.dialoguePool
        && a.type !== 'ambient') {
      issues.push({ level: 'error', check: 'missing-dialogue',
                    actor: a.id });
    }
  });

  // empty-floor: floors referenced by no NPC (inferred from TOC).
  // Placeholder: Phase 0 doesn't yet know which floors exist. Phase 1
  // will cross-ref tools/floor-data.json.

  // Report.
  var errors = issues.filter(function (i) { return i.level === 'error'; });
  var warns  = issues.filter(function (i) { return i.level === 'warn';  });

  if (flags.json) {
    process.stdout.write(JSON.stringify({
      errors: errors.length,
      warnings: warns.length,
      issues: issues
    }, null, 2) + '\n');
  } else {
    process.stdout.write(
      'Validation: ' + errors.length + ' error(s), '
      + warns.length + ' warning(s)\n\n');
    issues.forEach(function (i) {
      var tag = i.level === 'error' ? '[ERR]' : '[WRN]';
      var detail = [];
      if (i.actor) detail.push('actor=' + i.actor);
      if (i.pool)  detail.push('pool='  + i.pool);
      process.stdout.write(tag + ' ' + pad(i.check, 32) + ' '
                          + detail.join(' ') + '\n');
    });
  }

  if (errors.length > 0) process.exit(2);
}

function cmdSchema(flags) {
  var schema = readJson(PATHS.SCHEMA);
  if (!schema) die(3, 'actor-schema.json not found at ' + PATHS.SCHEMA);
  if (flags.json) {
    process.stdout.write(JSON.stringify(schema, null, 2) + '\n');
    return;
  }
  process.stdout.write('Schema: ' + schema.title + '\n');
  process.stdout.write('  $id:     ' + schema.$id + '\n');
  process.stdout.write('  version: ' + (schema._meta && schema._meta.version || '?') + '\n');
  process.stdout.write('  defs:    ' + Object.keys(schema.definitions).join(', ') + '\n');
  process.stdout.write('  oneOf:   npcActor | enemyActor\n');
}

function cmdHelp() {
  process.stdout.write([
    'npc-cli — DOC-110 Phase 0 scaffold',
    '',
    'Usage:  node tools/npc-cli.js <command> [flags]',
    '',
    'Commands:',
    '  list       List actors (NPCs + enemies).',
    '             Flags: --kind npc|enemy  --floor <id>  --faction <id>',
    '                    --type <npcType>  --biome <id>  --json',
    '  validate   Run DOC-110 §9 coherence checks.',
    '             Flags: --json   Exit 2 on error.',
    '  schema     Print actor-schema.json summary.',
    '             Flags: --json',
    '  help       Show this message.',
    '',
    'Examples:',
    '  node tools/npc-cli.js list --floor 0',
    '  node tools/npc-cli.js list --kind enemy --biome cellar',
    '  node tools/npc-cli.js validate',
    '  node tools/npc-cli.js validate --json',
    '  node tools/npc-cli.js schema',
    '',
    'See docs/NPC_TOOLING_ROADMAP.md (DOC-110) for the full suite.'
  ].join('\n') + '\n');
}

// ── Utilities ────────────────────────────────────────────────

function pad(s, n) {
  s = String(s || '');
  if (s.length >= n) return s;
  return s + new Array(n - s.length + 1).join(' ');
}

// ── Dispatcher ───────────────────────────────────────────────

var COMMANDS = {
  'list':     cmdList,
  'validate': cmdValidate,
  'schema':   cmdSchema,
  'help':     cmdHelp,
  '-h':       cmdHelp,
  '--help':   cmdHelp
};

function main() {
  var argv = process.argv.slice(2);
  if (argv.length === 0) { cmdHelp(); return; }

  var cmd = argv.shift();
  var flags = parseFlags(argv);
  var fn = COMMANDS[cmd];
  if (!fn) die(1, 'Unknown command: ' + cmd + ' (try `help`)');
  try {
    fn(flags);
  } catch (e) {
    die(3, e.stack || e.message);
  }
}

main();
