// ═══════════════════════════════════════════════════════════════
//  tools/cli/commands-procgen.js — Pass 6: bo procgen
// ═══════════════════════════════════════════════════════════════
// Generates a floor from a recipe and optionally injects it into
// floor-data.json via the same primitives as createFloor + paintRect.
//
// Usage:
//   bo procgen --recipe recipes/cobweb-cellar.json --floor 3.1
//   bo procgen --recipe recipes/cobweb-cellar.json --floor 3.1 --seed 42
//   bo procgen --recipe recipes/cobweb-cellar.json --ascii
//   bo procgen --recipe recipes/cobweb-cellar.json --floor 3.1 --dry-run
//
// When --floor is given, the generated grid is written into floor-data.json.
// Without --floor, the result is printed to stdout (JSON or ASCII).
// ═══════════════════════════════════════════════════════════════
'use strict';

var S       = require('./shared');
var fs      = require('fs');
var path    = require('path');
var procgen = require('../procgen');

// ── help metadata (Slice C3 convention) ────────────────────────
var _help = {
  procgen: {
    summary: 'Generate a floor from a recipe JSON (Pass 6 procedural generation).',
    args: [
      { name: '--recipe <path>', required: true,  desc: 'Path to recipe JSON file.' },
      { name: '--floor <id>',    required: false, desc: 'Floor ID to create/overwrite in floor-data.json. Omit to preview only.' },
      { name: '--seed <N>',      required: false, desc: 'RNG seed for deterministic output.' },
      { name: '--ascii',         required: false, desc: 'Output ASCII render instead of JSON (preview only).' },
      { name: '--dry-run',       required: false, desc: 'Preview what would change without writing floor-data.json.' }
    ],
    examples: [
      'bo procgen --recipe recipes/cobweb-cellar.json --ascii',
      'bo procgen --recipe recipes/cobweb-cellar.json --floor 3.1 --seed 42',
      'bo procgen --recipe recipes/cobweb-cellar.json --floor 3.1 --dry-run'
    ]
  },
  'list-recipes': {
    summary: 'List available recipe files in tools/recipes/.',
    args: [],
    examples: ['bo list-recipes']
  }
};

// ── bo procgen ─────────────────────────────────────────────────
function cmdProcgen(args, raw, schema) {
  var recipePath = args.recipe;
  if (!recipePath) S.fail(1, 'missing --recipe <path>');

  var absPath = path.resolve(S.paths.TOOLS_DIR, recipePath);
  if (!fs.existsSync(absPath)) {
    // Try relative to CWD too
    absPath = path.resolve(recipePath);
  }
  if (!fs.existsSync(absPath)) S.fail(1, 'recipe not found: ' + recipePath);

  var recipe = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  var opts = {};
  if (args.seed != null) opts.seed = parseInt(args.seed, 10);

  var result = procgen.generate(recipe, opts);

  var floorId = args.floor;

  // ── Preview mode (no --floor) ────────────────────────────────
  if (!floorId) {
    if (args.ascii) {
      process.stdout.write(procgen._renderAscii(result.grid, result.spawn, result.doors) + '\n');
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
    process.stderr.write(
      '[procgen] preview: ' + result.meta.stats.roomCount + ' rooms, ' +
      result.meta.stats.corridorCells + ' corridor cells, ' +
      result.meta.stats.torches + ' torches, ' +
      result.meta.stats.traps + ' traps, ' +
      result.meta.stats.enemySpawns + ' enemies' +
      (opts.seed != null ? ' (seed ' + opts.seed + ')' : '') + '\n'
    );
    return;
  }

  // ── Inject mode (--floor given) ──────────────────────────────
  // Create or overwrite the floor in floor-data.json.
  var biomeMap = JSON.parse(fs.readFileSync(path.join(S.paths.TOOLS_DIR, 'biome-map.json'), 'utf8'));
  var biome = biomeMap.biomes[recipe.biome];

  // Build the floor entry
  var floorEntry = {
    id: floorId,
    biome: recipe.biome,
    grid: result.grid,
    gridW: result.gridW,
    gridH: result.gridH,
    spawn: result.spawn,
    doorTargets: {},
    entities: result.entities || [],
    rooms: result.rooms || [],
    meta: result.meta
  };

  // Resolve door targets: replace placeholders with conventional targets
  var doorTargets = result.doorTargets || {};
  var resolvedDT = {};
  var dtKeys = Object.keys(doorTargets);
  for (var i = 0; i < dtKeys.length; i++) {
    var target = doorTargets[dtKeys[i]];
    // Leave placeholders as-is — the user or agent wires them after
    resolvedDT[dtKeys[i]] = target;
  }
  floorEntry.doorTargets = resolvedDT;

  // Check for existing floor
  if (raw.floors[floorId]) {
    process.stderr.write('[procgen] overwriting existing floor ' + floorId + '\n');
  }

  raw.floors[floorId] = floorEntry;

  if (!S.isDryRun()) {
    S.saveFloors(raw);
    process.stderr.write(
      '[procgen] floor ' + floorId + ' written to floor-data.json (' +
      result.meta.stats.roomCount + ' rooms, ' +
      result.gridW + 'x' + result.gridH + ', strategy: ' +
      result.meta.strategy + ')\n'
    );
  }

  // Output the result JSON (useful for piping or agent consumption)
  if (args.ascii) {
    process.stdout.write(procgen._renderAscii(result.grid, result.spawn, result.doors) + '\n');
  } else {
    process.stdout.write(JSON.stringify({
      ok: true,
      floorId: floorId,
      biome: recipe.biome,
      strategy: result.meta.strategy,
      gridSize: result.gridW + 'x' + result.gridH,
      stats: result.meta.stats,
      seed: result.meta.seed
    }, null, 2) + '\n');
  }
}

// ── bo list-recipes ────────────────────────────────────────────
function cmdListRecipes(args) {
  var recipesDir = path.join(S.paths.TOOLS_DIR, 'recipes');
  if (!fs.existsSync(recipesDir)) {
    process.stdout.write(JSON.stringify({ recipes: [], dir: recipesDir }, null, 2) + '\n');
    return;
  }
  var files = fs.readdirSync(recipesDir).filter(function (f) {
    return f.endsWith('.json') && f !== 'recipe.schema.json';
  });
  var recipes = files.map(function (f) {
    try {
      var data = JSON.parse(fs.readFileSync(path.join(recipesDir, f), 'utf8'));
      return {
        file: f,
        id: data.id || f.replace('.json', ''),
        title: data.title || '(untitled)',
        biome: data.biome || '?',
        strategy: (data.strategy && data.strategy.primary) || '?',
        size: data.size ? (data.size.width + 'x' + data.size.height) : '?'
      };
    } catch (e) {
      return { file: f, error: String(e.message) };
    }
  });
  process.stdout.write(JSON.stringify({ recipes: recipes, dir: recipesDir }, null, 2) + '\n');
}

// ── Exports ────────────────────────────────────────────────────
module.exports = {
  'procgen':       cmdProcgen,
  'list-recipes':  cmdListRecipes,
  _help: _help
};
