// ═══════════════════════════════════════════════════════════════
//  tools/cli/commands-gates.js — Gate authoring CLI (DOC-116)
//  set-gate, clear-gate, set-edge-gate, show-gates, validate-gates
// ═══════════════════════════════════════════════════════════════
'use strict';

var S = require('./shared');

// ── Constants ─────────────────────────────────────────────────
var GATE_TYPES = ['key', 'quest', 'faction', 'schedule', 'breakable', 'composite'];
var FACTION_IDS = ['mss', 'pinkerton', 'jesuit', 'bprd'];
var FACTION_TIERS = [
  'hated', 'unfriendly', 'neutral',
  'friendly', 'allied', 'exalted'
];

// ── Helpers ───────────────────────────────────────────────────

function parseGateFromArgs(args) {
  var type = args.type;
  if (!type) S.fail(1, '--type is required (one of: ' + GATE_TYPES.join(', ') + ')');
  if (GATE_TYPES.indexOf(type) === -1) S.fail(1, 'unknown gate type: ' + type + '. Valid: ' + GATE_TYPES.join(', '));

  var gate = { type: type };

  switch (type) {
    case 'key':
      gate.keyId = args.keyId || null;
      gate.keyName = args.keyName || args.keyId || 'Key';
      gate.consume = args['no-consume'] ? false : true;
      break;
    case 'quest':
      if (args.flag) {
        gate.flag = args.flag;
      } else if (args.questId) {
        gate.questId = args.questId;
        // Prefer stepId (string) over stepIdx (positional int) per §8a.2
        if (args.stepId) {
          gate.stepId = args.stepId;
        } else if (args.stepIdx != null) {
          gate.stepIdx = Number(args.stepIdx);
        }
      } else {
        S.fail(1, 'quest gate needs --flag or --questId');
      }
      break;
    case 'faction':
      if (!args.factionId) S.fail(1, 'faction gate needs --factionId');
      if (FACTION_IDS.indexOf(args.factionId) === -1) {
        S.fail(1, 'unknown faction: ' + args.factionId + '. Valid: ' + FACTION_IDS.join(', '));
      }
      gate.factionId = args.factionId;
      gate.minTier = args.minTier || 'neutral';
      if (FACTION_TIERS.indexOf(gate.minTier) === -1) {
        S.fail(1, 'unknown tier: ' + gate.minTier + '. Valid: ' + FACTION_TIERS.join(', '));
      }
      break;
    case 'schedule':
      gate.openHour = args.openHour != null ? Number(args.openHour) : 8;
      gate.closeHour = args.closeHour != null ? Number(args.closeHour) : 20;
      gate.days = args.days ? String(args.days).split(',').map(function(d) { return d.trim(); }) : null;
      break;
    case 'breakable':
      gate.suit = args.suit || null;
      gate.hits = args.hits != null ? Number(args.hits) : 1;
      break;
    case 'composite':
      S.fail(1, 'composite gates cannot be set via CLI — use the World Designer editor');
      break;
  }

  if (!args.rejectHint) S.fail(1, '--rejectHint is required (i18n key for rejection dialog)');
  gate.rejectHint = args.rejectHint;

  return gate;
}

// Find all door-like tiles on a floor grid (tile IDs for DOOR variants + LOCKED_DOOR + BOSS_DOOR)
function isDoorLike(tileId) {
  // DOOR=2, DOOR_BACK=3, DOOR_EXIT=4, STAIRS_DN=5, STAIRS_UP=6, BOSS_DOOR=14, LOCKED_DOOR=24
  return [2, 3, 4, 5, 6, 14, 24].indexOf(tileId) !== -1;
}

function findDoorCells(floor) {
  var cells = [];
  var grid = floor.grid;
  if (!grid) return cells;
  for (var y = 0; y < grid.length; y++) {
    for (var x = 0; x < (grid[y] ? grid[y].length : 0); x++) {
      if (isDoorLike(grid[y][x])) {
        cells.push({ x: x, y: y, tileId: grid[y][x] });
      }
    }
  }
  return cells;
}

// Resolve gate for a tile position using DOC-116 3-tier pipeline
function resolveGate(floor, floorId, x, y, raw) {
  var key = x + ',' + y;

  // Tier 1: Tile gate (explicit override)
  var gates = floor.gates || {};
  if (gates[key] && gates[key].override === true) {
    return { tier: 'tile', gate: gates[key], source: 'gates["' + key + '"]' };
  }

  // Tier 2: Edge gate (from doorTargets connection)
  var dt = floor.doorTargets || {};
  var targetFloorId = dt[key];
  if (targetFloorId) {
    var edgeGates = floor.edgeGates || {};
    if (edgeGates[targetFloorId]) {
      return { tier: 'edge', gate: edgeGates[targetFloorId], source: 'edgeGates["' + targetFloorId + '"]' };
    }
  }

  // Tier 3: Floor gate (whole-floor fallback)
  if (floor.floorGate) {
    return { tier: 'floor', gate: floor.floorGate, source: 'floorGate' };
  }

  // Tier 4: No gate
  return null;
}

// ── Commands ──────────────────────────────────────────────────

module.exports = {
  'set-gate': function(args, raw) {
    var f = S.requireFloor(raw, args.floor);
    var at = S.parseCoord(args.at, '--at');
    var key = at.x + ',' + at.y;
    var gate = parseGateFromArgs(args);

    // Mark as tile-level override
    gate.override = true;

    f.gates = f.gates || {};
    f.gates[key] = gate;
    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({ floor: args.floor, at: key, gate: gate }) + '\n');
  },

  'clear-gate': function(args, raw) {
    var f = S.requireFloor(raw, args.floor);
    var at = S.parseCoord(args.at, '--at');
    var key = at.x + ',' + at.y;

    f.gates = f.gates || {};
    var old = f.gates[key] || null;
    delete f.gates[key];

    // Clean up empty gates map
    if (Object.keys(f.gates).length === 0) delete f.gates;

    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({ floor: args.floor, at: key, cleared: old }) + '\n');
  },

  'set-edge-gate': function(args, raw) {
    var f = S.requireFloor(raw, args.floor);
    var target = args.target;
    if (!target) S.fail(1, '--target is required (destination floor ID)');
    var gate = parseGateFromArgs(args);

    f.edgeGates = f.edgeGates || {};
    f.edgeGates[target] = gate;
    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({ floor: args.floor, target: target, edgeGate: gate }) + '\n');
  },

  'clear-edge-gate': function(args, raw) {
    var f = S.requireFloor(raw, args.floor);
    var target = args.target;
    if (!target) S.fail(1, '--target is required (destination floor ID)');

    f.edgeGates = f.edgeGates || {};
    var old = f.edgeGates[target] || null;
    delete f.edgeGates[target];

    if (Object.keys(f.edgeGates).length === 0) delete f.edgeGates;

    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({ floor: args.floor, target: target, cleared: old }) + '\n');
  },

  'show-gates': function(args, raw) {
    var f = S.requireFloor(raw, args.floor);
    var doorCells = findDoorCells(f);

    var result = {
      floor: args.floor,
      tileGates: f.gates || {},
      edgeGates: f.edgeGates || {},
      floorGate: f.floorGate || null,
      doors: doorCells.map(function(d) {
        var resolved = resolveGate(f, args.floor, d.x, d.y, raw);
        return {
          at: d.x + ',' + d.y,
          tileId: d.tileId,
          resolved: resolved
        };
      })
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  },

  'validate-gates': function(args, raw) {
    var f = S.requireFloor(raw, args.floor);
    var issues = [];

    // Check tile gates
    var gates = f.gates || {};
    Object.keys(gates).forEach(function(key) {
      var g = gates[key];
      if (!g.override) {
        issues.push({ level: 'warn', at: key, msg: 'tile gate missing override:true — will be ignored by resolution pipeline' });
      }
      if (!g.rejectHint) {
        issues.push({ level: 'error', at: key, msg: 'tile gate missing rejectHint' });
      }
      if (g.type && GATE_TYPES.indexOf(g.type) === -1) {
        issues.push({ level: 'error', at: key, msg: 'unknown gate type: ' + g.type });
      }
      if (g.type === 'faction' && FACTION_IDS.indexOf(g.factionId) === -1) {
        issues.push({ level: 'error', at: key, msg: 'unknown factionId: ' + g.factionId });
      }
      if (g.type === 'faction' && FACTION_TIERS.indexOf(g.minTier) === -1) {
        issues.push({ level: 'error', at: key, msg: 'unknown faction tier: ' + g.minTier });
      }
    });

    // Check edge gates
    var edgeGates = f.edgeGates || {};
    Object.keys(edgeGates).forEach(function(target) {
      var g = edgeGates[target];
      if (!g.rejectHint) {
        issues.push({ level: 'error', edge: target, msg: 'edge gate missing rejectHint' });
      }
      if (g.type && GATE_TYPES.indexOf(g.type) === -1) {
        issues.push({ level: 'error', edge: target, msg: 'unknown gate type: ' + g.type });
      }
      // Verify target floor exists
      if (!raw.floors[target]) {
        issues.push({ level: 'warn', edge: target, msg: 'edge gate target floor does not exist: ' + target });
      }
    });

    // Check floor gate
    if (f.floorGate) {
      if (!f.floorGate.rejectHint) {
        issues.push({ level: 'error', msg: 'floorGate missing rejectHint' });
      }
    }

    // Check every LOCKED_DOOR has a resolvable gate
    var doorCells = findDoorCells(f);
    doorCells.forEach(function(d) {
      if (d.tileId !== 24) return; // only check LOCKED_DOOR tiles
      var resolved = resolveGate(f, args.floor, d.x, d.y, raw);
      if (!resolved) {
        issues.push({
          level: 'warn', at: d.x + ',' + d.y,
          msg: 'LOCKED_DOOR has no resolvable gate (no tile, edge, or floor gate)'
        });
      }
    });

    var result = {
      floor: args.floor,
      issues: issues,
      errors: issues.filter(function(i) { return i.level === 'error'; }).length,
      warnings: issues.filter(function(i) { return i.level === 'warn'; }).length
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.errors > 0) process.exit(2);
  }
};
