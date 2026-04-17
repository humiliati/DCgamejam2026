// ═══════════════════════════════════════════════════════════════
//  tools/cli/commands-bake.js — Pass 6: bo bake / bo bake-all
// ═══════════════════════════════════════════════════════════════
// Recipe-to-IIFE bake pipeline. Generates a floor from a procgen
// recipe and writes the engine/floor-blockout-*.js IIFE file
// directly to disk — pre-baking procgen floors at build time so
// the game never needs a runtime generator.
//
// Usage:
//   bo bake --recipe recipes/cobweb-cellar.json --id 3.1
//   bo bake --recipe recipes/cobweb-cellar.json --id 3.1 --seed 42
//   bo bake --recipe recipes/cobweb-cellar.json --id 3.1 --dry-run
//   bo bake --recipe recipes/cobweb-cellar.json --id 3.1 --ascii
//   bo bake-all [--dry-run]
//
// bo bake:     single recipe → single IIFE file + floor-data.json entry.
// bo bake-all: scan tools/recipes/*.json, bake any recipe whose floor
//              ID doesn't already have an engine/floor-blockout-*.js.
// ═══════════════════════════════════════════════════════════════
'use strict';

var S       = require('./shared');
var emit    = require('./emit-iife');
var fs      = require('fs');
var path    = require('path');
var procgen = require('../procgen');

var ENGINE_DIR = path.resolve(S.paths.TOOLS_DIR, '..', 'engine');

// ── help metadata (Slice C3 convention) ────────────────────────
var _help = {
  bake: {
    summary: 'Generate a floor from a recipe and write the engine IIFE file + floor-data.json entry.',
    args: [
      { name: '--recipe <path>', required: true,  desc: 'Path to recipe JSON file (relative to tools/ or absolute).' },
      { name: '--id <floorId>',  required: true,  desc: 'Floor ID for the baked floor (e.g. "3.1").' },
      { name: '--seed <N>',      required: false, desc: 'RNG seed for deterministic output.' },
      { name: '--ascii',         required: false, desc: 'Also print ASCII render to stderr after baking.' },
      { name: '--dry-run',       required: false, desc: 'Preview what would be written without touching disk.' },
      { name: '--no-data',       required: false, desc: 'Skip writing to floor-data.json (IIFE only).' }
    ],
    examples: [
      'bo bake --recipe recipes/cobweb-cellar.json --id 3.1',
      'bo bake --recipe recipes/cobweb-cellar.json --id 3.1 --seed 42 --ascii',
      'bo bake --recipe recipes/cobweb-cellar.json --id 3.1 --dry-run'
    ]
  },
  'bake-all': {
    summary: 'Batch-bake all recipes in tools/recipes/ that lack a corresponding floor-blockout IIFE.',
    args: [
      { name: '--dry-run',       required: false, desc: 'Preview what would be baked without writing files.' },
      { name: '--force',         required: false, desc: 'Re-bake even if the IIFE already exists on disk.' },
      { name: '--ascii',         required: false, desc: 'Print ASCII renders to stderr for each baked floor.' }
    ],
    examples: [
      'bo bake-all',
      'bo bake-all --dry-run',
      'bo bake-all --force --ascii'
    ]
  }
};

// ── Resolve recipe path ────────────────────────────────────────
function resolveRecipePath(recipePath) {
  var abs = path.resolve(S.paths.TOOLS_DIR, recipePath);
  if (fs.existsSync(abs)) return abs;
  abs = path.resolve(recipePath);
  if (fs.existsSync(abs)) return abs;
  return null;
}

// ── Core: bake one recipe → IIFE + optional floor-data.json ────
function bakeOne(recipe, floorId, opts) {
  var genOpts = {};
  if (opts.seed != null) genOpts.seed = parseInt(opts.seed, 10);

  var result = procgen.generate(recipe, genOpts);

  // Build the floor entry (same shape as commands-procgen.js inject mode)
  var floorEntry = {
    id: floorId,
    biome: recipe.biome,
    grid: result.grid,
    gridW: result.gridW,
    gridH: result.gridH,
    spawn: result.spawn,
    doorTargets: result.doorTargets || {},
    entities: result.entities || [],
    rooms: result.rooms || [],
    shops: [],
    meta: result.meta
  };

  // Generate the IIFE source
  var iifeSource = emit.scaffoldFloorBlockoutSource(floorId, floorEntry);
  if (!iifeSource) {
    return { ok: false, error: 'scaffoldFloorBlockoutSource returned null (empty grid?)' };
  }

  // Determine output path
  var fileName = emit.floorBlockoutFileName(floorId);
  var iifePath = path.join(ENGINE_DIR, fileName);

  var dryRun = !!(S.isDryRun && S.isDryRun());

  // Write IIFE file
  if (!dryRun) {
    fs.writeFileSync(iifePath, iifeSource);
  }

  return {
    ok: true,
    floorId: floorId,
    biome: recipe.biome,
    strategy: result.meta.strategy,
    gridSize: result.gridW + 'x' + result.gridH,
    stats: result.meta.stats,
    seed: result.meta.seed,
    iifePath: iifePath,
    iifeBytes: iifeSource.length,
    dryRun: dryRun,
    floorEntry: floorEntry,
    grid: result.grid,
    spawn: result.spawn,
    doors: result.doors
  };
}

// ── bo bake ────────────────────────────────────────────────────
function cmdBake(args, raw) {
  var recipePath = args.recipe;
  if (!recipePath) S.fail(1, 'bake: missing --recipe <path>');
  var floorId = args.id;
  if (!floorId) S.fail(1, 'bake: missing --id <floorId>');

  var absPath = resolveRecipePath(recipePath);
  if (!absPath) S.fail(1, 'bake: recipe not found: ' + recipePath);

  var recipe = JSON.parse(fs.readFileSync(absPath, 'utf8'));

  // Check for existing IIFE
  var existingIife = path.join(ENGINE_DIR, emit.floorBlockoutFileName(floorId));
  if (fs.existsSync(existingIife)) {
    process.stderr.write('[bake] overwriting existing IIFE: ' + existingIife + '\n');
  }

  // Check for existing floor in floor-data.json
  if (raw.floors[floorId]) {
    process.stderr.write('[bake] overwriting existing floor-data.json entry: ' + floorId + '\n');
  }

  var result = bakeOne(recipe, floorId, { seed: args.seed });
  if (!result.ok) S.fail(2, 'bake: ' + result.error);

  // Also update floor-data.json unless --no-data
  if (!args['no-data']) {
    raw.floors[floorId] = result.floorEntry;
    if (!result.dryRun) {
      S.saveFloors(raw);
    }
  }

  // ASCII preview if requested
  if (args.ascii) {
    process.stderr.write('\n' + procgen._renderAscii(result.grid, result.spawn, result.doors) + '\n');
  }

  // Summary
  process.stderr.write(
    '[bake] ' + (result.dryRun ? '(dry-run) would write' : 'wrote') + ' ' +
    result.iifePath + ' (' + result.iifeBytes + ' bytes)\n'
  );
  if (!args['no-data']) {
    process.stderr.write(
      '[bake] ' + (result.dryRun ? '(dry-run) would update' : 'updated') +
      ' floor-data.json: ' + floorId + '\n'
    );
  }

  // Machine-readable output
  process.stdout.write(JSON.stringify({
    ok: true,
    action: 'bake',
    floorId: floorId,
    biome: result.biome,
    strategy: result.strategy,
    gridSize: result.gridSize,
    stats: result.stats,
    seed: result.seed,
    iifePath: result.iifePath,
    iifeBytes: result.iifeBytes,
    floorDataUpdated: !args['no-data'],
    dryRun: result.dryRun
  }, null, 2) + '\n');
}

// ── bo bake-all ────────────────────────────────────────────────
function cmdBakeAll(args, raw) {
  var recipesDir = path.join(S.paths.TOOLS_DIR, 'recipes');
  if (!fs.existsSync(recipesDir)) {
    S.fail(2, 'bake-all: recipes directory not found: ' + recipesDir);
  }

  var files = fs.readdirSync(recipesDir).filter(function(f) {
    return f.endsWith('.json') && f !== 'recipe.schema.json';
  });

  if (files.length === 0) {
    process.stderr.write('[bake-all] no recipe files found in ' + recipesDir + '\n');
    process.stdout.write(JSON.stringify({ ok: true, baked: 0, skipped: 0, results: [] }, null, 2) + '\n');
    return;
  }

  var force = !!args.force;
  var results = [];
  var baked = 0;
  var skipped = 0;
  var errors = 0;

  files.forEach(function(f) {
    var fullPath = path.join(recipesDir, f);
    var recipe;
    try {
      recipe = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (e) {
      process.stderr.write('[bake-all] SKIP ' + f + ': parse error: ' + e.message + '\n');
      errors++;
      results.push({ file: f, status: 'error', error: e.message });
      return;
    }

    // Recipe must have an id to use as floor ID (if not, skip)
    var floorId = recipe.id;
    if (!floorId) {
      process.stderr.write('[bake-all] SKIP ' + f + ': no recipe.id\n');
      skipped++;
      results.push({ file: f, status: 'skipped', reason: 'no id' });
      return;
    }

    // Check if IIFE already exists (unless --force)
    var iifeName = emit.floorBlockoutFileName(floorId);
    var iifePath = path.join(ENGINE_DIR, iifeName);
    if (!force && fs.existsSync(iifePath)) {
      process.stderr.write('[bake-all] SKIP ' + f + ' → ' + floorId + ' (IIFE exists: ' + iifeName + ')\n');
      skipped++;
      results.push({ file: f, floorId: floorId, status: 'skipped', reason: 'iife exists' });
      return;
    }

    // Determine seed — use recipe.seed if set, otherwise null (random)
    var seedOpt = recipe.seed != null ? recipe.seed : null;

    var result = bakeOne(recipe, floorId, { seed: seedOpt });
    if (!result.ok) {
      process.stderr.write('[bake-all] ERROR ' + f + ' → ' + floorId + ': ' + result.error + '\n');
      errors++;
      results.push({ file: f, floorId: floorId, status: 'error', error: result.error });
      return;
    }

    // Update floor-data.json entry
    raw.floors[floorId] = result.floorEntry;

    baked++;
    results.push({
      file: f,
      floorId: floorId,
      status: 'baked',
      strategy: result.strategy,
      gridSize: result.gridSize,
      stats: result.stats,
      seed: result.seed,
      iifePath: result.iifePath,
      iifeBytes: result.iifeBytes
    });

    process.stderr.write(
      '[bake-all] ' + (result.dryRun ? '(dry-run)' : 'BAKED') + ' ' +
      f + ' → ' + floorId + ' (' + result.gridSize + ', ' +
      result.strategy + ', ' + result.stats.roomCount + ' rooms)\n'
    );

    if (args.ascii) {
      process.stderr.write(procgen._renderAscii(result.grid, result.spawn, result.doors) + '\n\n');
    }
  });

  // Save floor-data.json once (batched)
  if (baked > 0) {
    var dryRun = !!(S.isDryRun && S.isDryRun());
    if (!dryRun) {
      S.saveFloors(raw);
      process.stderr.write('[bake-all] floor-data.json updated with ' + baked + ' new floor(s)\n');
    } else {
      process.stderr.write('[bake-all] (dry-run) would update floor-data.json with ' + baked + ' floor(s)\n');
    }
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    action: 'bake-all',
    baked: baked,
    skipped: skipped,
    errors: errors,
    results: results,
    dryRun: !!(S.isDryRun && S.isDryRun())
  }, null, 2) + '\n');
}

// ── bo bake-multi ─────────────────────────────────────────────
// Reads a recipe with `expansion` knobs, generates N sibling floors
// with per-level difficulty ramp, auto-wires stair door targets
// between them, and writes N IIFE files + floor-data.json entries.
// ───────────────────────────────────────────────────────────────
function cmdBakeMulti(args, raw) {
  var recipePath = args.recipe;
  if (!recipePath) S.fail(1, 'bake-multi: missing --recipe <path>');

  var absPath = resolveRecipePath(recipePath);
  if (!absPath) S.fail(1, 'bake-multi: recipe not found: ' + recipePath);

  var recipe = JSON.parse(fs.readFileSync(absPath, 'utf8'));

  // Expansion knobs — required for bake-multi
  var exp = recipe.expansion;
  if (!exp) S.fail(1, 'bake-multi: recipe has no "expansion" object');

  var floorCount = exp.floorCount || 3;
  if (floorCount < 2) S.fail(1, 'bake-multi: floorCount must be >= 2 (got ' + floorCount + ')');

  var idPattern  = exp.idPattern || '{parent}.{n}';
  var lastExit   = exp.lastFloorExit || 'none';
  var ramp       = exp.ramp || {};

  // Resolve parent floor ID — from --parent flag or recipe._parent or recipe.id
  var parentId = args.parent || recipe._parent || recipe.id;
  if (!parentId) S.fail(1, 'bake-multi: cannot determine parent floor ID (use --parent <id>)');

  // Build the list of floor IDs from idPattern
  var floorIds = [];
  for (var n = 1; n <= floorCount; n++) {
    var fid = idPattern
      .replace(/\{parent\}/g, parentId)
      .replace(/\{n\}/g, String(n));
    floorIds.push(fid);
  }

  // Check for duplicates
  var idSet = {};
  floorIds.forEach(function(fid) {
    if (idSet[fid]) S.fail(1, 'bake-multi: duplicate floor ID from pattern: ' + fid);
    idSet[fid] = true;
  });

  var dryRun = !!(S.isDryRun && S.isDryRun());
  var results = [];

  // ── Per-level generation loop ──────────────────────────────
  for (var i = 0; i < floorCount; i++) {
    var depth = i + 1;  // 1-indexed
    var fid   = floorIds[i];

    // Clone recipe and apply ramp multipliers
    var levelRecipe = JSON.parse(JSON.stringify(recipe));

    // Apply difficulty ramp: base × (1 + (depth-1) × factor)
    if (depth > 1) {
      var ent = levelRecipe.entities || {};

      if (ramp.enemyBudget != null && ent.enemyBudget) {
        var eFactor = 1 + (depth - 1) * ramp.enemyBudget;
        ent.enemyBudget = [
          Math.round(ent.enemyBudget[0] * eFactor),
          Math.round(ent.enemyBudget[1] * eFactor)
        ];
      }
      if (ramp.trapDensity != null && ent.trapDensity != null) {
        ent.trapDensity = Math.min(1, Math.max(0,
          ent.trapDensity * (1 + (depth - 1) * ramp.trapDensity)));
      }
      if (ramp.breakableDensity != null && ent.breakableDensity != null) {
        ent.breakableDensity = Math.min(1, Math.max(0,
          ent.breakableDensity * (1 + (depth - 1) * ramp.breakableDensity)));
      }
      if (ramp.chestCount != null && ent.chestCount) {
        var cFactor = 1 + (depth - 1) * ramp.chestCount;
        ent.chestCount = [
          Math.round(ent.chestCount[0] * cFactor),
          Math.round(ent.chestCount[1] * cFactor)
        ];
      }
      if (ramp.torchDensity != null && ent.torchDensity != null) {
        ent.torchDensity = Math.min(1, Math.max(0,
          ent.torchDensity * (1 + (depth - 1) * ramp.torchDensity)));
      }

      levelRecipe.entities = ent;
    }

    // Override exit door on last floor
    if (i === floorCount - 1) {
      levelRecipe.doors = levelRecipe.doors || {};
      if (lastExit === 'none') {
        levelRecipe.doors.exit = 'none';
      } else if (lastExit === 'boss') {
        levelRecipe.doors.bossGate = true;
      }
      // 'open' = leave doors as-is (normal STAIRS_DN for future extension)
    }

    // Unique seed per level if base recipe has a seed
    var seedOpt = null;
    if (recipe.seed != null) {
      seedOpt = recipe.seed + i;  // deterministic per-level offset
    }
    if (args.seed != null) {
      seedOpt = parseInt(args.seed, 10) + i;
    }

    var result = bakeOne(levelRecipe, fid, { seed: seedOpt });
    if (!result.ok) {
      process.stderr.write('[bake-multi] ERROR floor ' + fid + ': ' + result.error + '\n');
      results.push({ floorId: fid, status: 'error', error: result.error });
      continue;
    }

    results.push(result);
    raw.floors[fid] = result.floorEntry;

    process.stderr.write(
      '[bake-multi] ' + (dryRun ? '(dry-run)' : 'BAKED') +
      ' floor ' + depth + '/' + floorCount + ': ' + fid +
      ' (' + result.gridSize + ', ' + result.strategy + ')' +
      (depth > 1 ? ' [ramp x' + (1 + (depth - 1) * (ramp.enemyBudget || 0)).toFixed(1) + ' enemies]' : '') +
      '\n'
    );

    if (args.ascii) {
      process.stderr.write(procgen._renderAscii(result.grid, result.spawn, result.doors) + '\n\n');
    }
  }

  // ── Post-generation: resolve __parent__/__child__ placeholders ──
  // Floor N's __child__ → floor N+1's ID
  // Floor N+1's __parent__ → floor N's ID
  // Floor 1's __parent__ → parentId (the recipe's parent floor)
  // Last floor's __child__ → removed (if lastExit='none') or kept as placeholder
  for (var j = 0; j < results.length; j++) {
    if (results[j].status === 'error') continue;
    var entry = results[j].floorEntry;
    var dt = entry.doorTargets || {};
    var resolved = {};

    Object.keys(dt).forEach(function(coordKey) {
      var target = dt[coordKey];
      if (target === '__parent__') {
        // First floor connects back to the parent; deeper floors connect to previous sibling
        resolved[coordKey] = (j === 0) ? parentId : floorIds[j - 1];
      } else if (target === '__child__') {
        if (j < floorIds.length - 1) {
          // Connect to next sibling floor
          resolved[coordKey] = floorIds[j + 1];
        } else {
          // Last floor — depends on lastFloorExit setting
          if (lastExit === 'none') {
            // No exit — drop the placeholder entirely
          } else {
            // 'boss' or 'open' — keep a placeholder for future wiring
            resolved[coordKey] = '__child__';
          }
        }
      } else {
        resolved[coordKey] = target;
      }
    });

    entry.doorTargets = resolved;

    // Also update the IIFE file on disk with resolved doorTargets
    if (!dryRun) {
      var iifeSource = emit.scaffoldFloorBlockoutSource(floorIds[j], entry);
      if (iifeSource) {
        var iifePath = path.join(ENGINE_DIR, emit.floorBlockoutFileName(floorIds[j]));
        fs.writeFileSync(iifePath, iifeSource);
      }
    }
  }

  // ── Save floor-data.json (batched) ─────────────────────────
  var bakedCount = results.filter(function(r) { return r.status !== 'error'; }).length;
  if (bakedCount > 0 && !dryRun) {
    S.saveFloors(raw);
    process.stderr.write('[bake-multi] floor-data.json updated with ' + bakedCount + ' floor(s)\n');
  } else if (bakedCount > 0 && dryRun) {
    process.stderr.write('[bake-multi] (dry-run) would update floor-data.json with ' + bakedCount + ' floor(s)\n');
  }

  // ── Machine-readable summary ───────────────────────────────
  process.stdout.write(JSON.stringify({
    ok: true,
    action: 'bake-multi',
    parentId: parentId,
    floorCount: floorCount,
    floorIds: floorIds,
    idPattern: idPattern,
    lastFloorExit: lastExit,
    ramp: ramp,
    baked: bakedCount,
    errors: results.filter(function(r) { return r.status === 'error'; }).length,
    results: results.map(function(r) {
      if (r.status === 'error') return { floorId: r.floorId, status: 'error', error: r.error };
      return {
        floorId: r.floorId,
        status: 'baked',
        strategy: r.strategy,
        gridSize: r.gridSize,
        stats: r.stats,
        seed: r.seed,
        iifePath: r.iifePath,
        iifeBytes: r.iifeBytes,
        doorTargets: r.floorEntry.doorTargets
      };
    }),
    dryRun: dryRun
  }, null, 2) + '\n');
}

// ── help metadata for bake-multi ──────────────────────────────
_help['bake-multi'] = {
  summary: 'Generate N sibling floors from a recipe with expansion knobs, with per-level difficulty ramp and auto-wired stair door targets.',
  args: [
    { name: '--recipe <path>', required: true,  desc: 'Path to recipe JSON file with "expansion" object.' },
    { name: '--parent <id>',   required: false, desc: 'Parent floor ID (overrides recipe._parent / recipe.id).' },
    { name: '--seed <N>',      required: false, desc: 'Base RNG seed (each level gets seed+N offset).' },
    { name: '--ascii',         required: false, desc: 'Print ASCII render of each floor to stderr.' },
    { name: '--dry-run',       required: false, desc: 'Preview without writing files.' }
  ],
  examples: [
    'bo bake-multi --recipe recipes/cellar-deep.json --parent 2.2',
    'bo bake-multi --recipe recipes/cellar-deep.json --parent 2.2 --seed 42 --ascii',
    'bo bake-multi --recipe recipes/cellar-deep.json --parent 2.2 --dry-run'
  ]
};

// ── Exports ────────────────────────────────────────────────────
module.exports = {
  'bake':       cmdBake,
  'bake-all':   cmdBakeAll,
  'bake-multi': cmdBakeMulti,
  _help: _help
};
