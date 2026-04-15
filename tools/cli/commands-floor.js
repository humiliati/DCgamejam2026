// ═══════════════════════════════════════════════════════════════
//  tools/cli/commands-floor.js — Pass 5a floor-semantics primitives
//
//  Commands:
//    create-floor   scaffold a new floor-data entry from a template
//                   + biome map (does NOT write engine/floor-blockout-
//                   *.js — that's the save patcher's job)
//    set-biome      change a floor's biome tag
//    place-entity   paint a semantic tile (DOOR/TORCH/CHEST/...) at
//                   a cell and optionally record it in floor.entities
//    git-snapshot   `git add` + `git commit` the floor-data + any
//                   engine/floor-blockout-*.js changes
//    git-diff       `git diff` on floor-data.json (+ blockout files)
//
//  Tile/biome references in templates are STRING names; they resolve
//  via tile-schema.json and biome-map.json at command-execution time.
// ═══════════════════════════════════════════════════════════════
'use strict';

var S = require('./shared');
var cp = require('child_process');

var BIOME_MAP_PATH  = S.path.join(S.paths.TOOLS_DIR, 'biome-map.json');
var TEMPLATES_DIR   = S.path.join(S.paths.TOOLS_DIR, 'templates');

function loadBiomeMap() {
  if (!S.fs.existsSync(BIOME_MAP_PATH)) S.fail(2, 'biome-map.json not found');
  var raw = JSON.parse(S.fs.readFileSync(BIOME_MAP_PATH, 'utf8'));
  return raw.biomes || raw;
}

function loadTemplate(name) {
  var p = S.path.join(TEMPLATES_DIR, name + '.json');
  if (!S.fs.existsSync(p)) S.fail(1, 'template not found: ' + name + ' (looked in ' + TEMPLATES_DIR + ')');
  return JSON.parse(S.fs.readFileSync(p, 'utf8'));
}

// ── Floor-ID tree helpers (mirror FloorManager) ────────────────
function parentId(id)         { var p=id.split('.'); if (p.length<=1) return null; p.pop(); return p.join('.'); }
function childId(id,sub)      { return id + '.' + (sub||'1'); }
function nextSiblingId(id)    { var p=id.split('.'); p[p.length-1]=String((+p[p.length-1]||0)+1); return p.join('.'); }

function resolveDoorTarget(floorId, marker) {
  if (marker === '__parent__')        return parentId(floorId) || '';
  if (marker === '__child1__')        return childId(floorId, '1');
  if (marker === '__sibling_next__')  return nextSiblingId(floorId);
  return String(marker || '');
}

// ── Template → grid materialization ────────────────────────────
function materialize(tpl, biome, schema, floorId) {
  var W = (tpl.defaults && tpl.defaults.width)  || tpl.grid[0].length;
  var H = (tpl.defaults && tpl.defaults.height) || tpl.grid.length;
  var grid = [];
  for (var y = 0; y < H; y++) { var r=[]; for (var x = 0; x < W; x++) r.push(0); grid.push(r); }

  var legend = tpl.legend || {};
  var spawn  = tpl.spawn ? { x: tpl.spawn.x, y: tpl.spawn.y, dir: tpl.spawn.dir|0 } : null;
  var doorTargets = {};

  // 1) Paint grid from legend
  for (var gy = 0; gy < tpl.grid.length && gy < H; gy++) {
    var row = tpl.grid[gy];
    for (var gx = 0; gx < row.length && gx < W; gx++) {
      var ch = row.charAt(gx);
      var role = legend[ch];
      if (role == null) continue;
      if (role === '__spawn__') {
        // spawn marker sits on the floor tile
        grid[gy][gx] = S.resolveTile(biome.floorTile || 'EMPTY', schema);
        if (!spawn) spawn = { x: gx, y: gy, dir: 0 };
        continue;
      }
      // Biome-keyed role tokens
      var tileName;
      if      (role === 'wallTile')    tileName = biome.wallTile    || 'WALL';
      else if (role === 'floorTile')   tileName = biome.floorTile   || 'EMPTY';
      else if (role === 'ceilingTile') tileName = biome.ceilingTile || null;
      else if (role === 'torchTile')   tileName = biome.torchTile   || 'TORCH_LIT';
      else                             tileName = role;  // literal name, e.g. "DOOR", "CHEST"
      if (tileName == null) continue;
      grid[gy][gx] = S.resolveTile(tileName, schema);
    }
  }

  // 2) Resolve door targets
  (tpl.doors || []).forEach(function(d) {
    var tgt = resolveDoorTarget(floorId, d.target);
    if (tgt) doorTargets[d.x + ',' + d.y] = tgt;
  });

  return { grid: grid, W: W, H: H, spawn: spawn, doorTargets: doorTargets };
}

// ── Commands ───────────────────────────────────────────────────
module.exports = {

  'create-floor': function(args, raw, schema) {
    var id = args.id;
    if (!id) S.fail(1, 'create-floor needs --id');
    if (raw.floors[id] && !args.force) S.fail(1, 'floor exists: ' + id + ' (use --force to overwrite)');

    var biomeMap = loadBiomeMap();
    var biomeName = args.biome;
    if (!biomeName) S.fail(1, 'create-floor needs --biome');
    var biome = biomeMap[biomeName];
    if (!biome) S.fail(1, 'unknown biome: ' + biomeName + ' (see tools/biome-map.json)');

    var tpl;
    if (args.template) {
      tpl = loadTemplate(args.template);
    } else {
      // Synthesize an empty W x H slab if no template is given
      var size = args.size ? String(args.size).match(/^(\d+)x(\d+)$/i) : null;
      var w = size ? +size[1] : 16, h = size ? +size[2] : 16;
      var rows = [];
      for (var y = 0; y < h; y++) {
        var r = '';
        for (var x = 0; x < w; x++) {
          if (x === 0 || y === 0 || x === w-1 || y === h-1) r += '#';
          else                                              r += '.';
        }
        rows.push(r);
      }
      tpl = {
        defaults: { width: w, height: h },
        legend:   { '#': 'wallTile', '.': 'floorTile' },
        grid:     rows,
        spawn:    { x: (w>>1), y: (h>>1), dir: 0 },
        doors:    []
      };
    }

    var m = materialize(tpl, biome, schema, id);
    raw.floors[id] = {
      floorId: id,
      grid: m.grid, gridW: m.W, gridH: m.H,
      rooms: [], doors: [], doorTargets: m.doorTargets, doorFaces: {},
      spawn: m.spawn || { x: 1, y: 1, dir: 0 },
      biome: biomeName,
      shops: [],
      entities: []
    };
    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({
      created: id, biome: biomeName, w: m.W, h: m.H,
      spawn: raw.floors[id].spawn, doorTargets: m.doorTargets
    }, null, 2) + '\n');
  },

  'set-biome': function(args, raw) {
    var f = S.requireFloor(raw, args.floor);
    var biomeMap = loadBiomeMap();
    if (!biomeMap[args.biome]) S.fail(1, 'unknown biome: ' + args.biome);
    f.biome = args.biome;
    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({ floor: args.floor, biome: f.biome }) + '\n');
  },

  'place-entity': function(args, raw, schema) {
    var f = S.requireFloor(raw, args.floor);
    var at = S.parseCoord(args.at, '--at');
    if (!args.kind) S.fail(1, 'place-entity needs --kind');
    var tileId = S.resolveTile(args.kind, schema);
    if (at.y < 0 || at.y >= f.grid.length || at.x < 0 || at.x >= f.grid[at.y].length) {
      S.fail(1, 'out of bounds: ' + at.x + ',' + at.y);
    }
    var oldTile = f.grid[at.y][at.x];
    f.grid[at.y][at.x] = tileId;
    f.entities = f.entities || [];
    // Deduplicate same-cell entries, then append.
    f.entities = f.entities.filter(function(e){ return !(e.x===at.x && e.y===at.y); });
    f.entities.push({
      x: at.x, y: at.y, kind: String(args.kind).toUpperCase(),
      key: args.key || null, tileId: tileId
    });
    S.saveFloors(raw);
    process.stdout.write(JSON.stringify({
      floor: args.floor, at: at, kind: args.kind, tileId: tileId, oldTile: oldTile
    }) + '\n');
  },

  'git-snapshot': function(args) {
    var msg = args.message || ('blockout snapshot ' + new Date().toISOString());
    var cwd = S.path.resolve(S.paths.TOOLS_DIR, '..');
    try {
      // `git add -A` on the two directories the blockout workflow touches.
      cp.execFileSync('git', ['add', 'tools/floor-data.json'], { cwd: cwd, stdio: 'pipe' });
      try { cp.execFileSync('git', ['add', 'engine/'], { cwd: cwd, stdio: 'pipe' }); } catch (_e) { /* engine dir may be clean */ }
      var out = cp.execFileSync('git', ['commit', '-m', msg], { cwd: cwd, stdio: 'pipe' });
      process.stdout.write(JSON.stringify({ ok: true, message: msg, git: String(out).trim() }, null, 2) + '\n');
    } catch (e) {
      var stderr = (e && e.stderr) ? String(e.stderr).trim() : String(e);
      // "nothing to commit" is not a real failure
      if (/nothing to commit/i.test(stderr)) {
        process.stdout.write(JSON.stringify({ ok: true, noop: true, note: 'nothing to commit' }) + '\n');
        return;
      }
      S.fail(2, 'git-snapshot: ' + stderr);
    }
  },

  'git-diff': function(args) {
    var cwd = S.path.resolve(S.paths.TOOLS_DIR, '..');
    var targets = ['tools/floor-data.json'];
    if (!args.floor) targets.push('engine/');
    try {
      var out = cp.execFileSync('git', ['diff', '--stat'].concat(targets), { cwd: cwd, stdio: 'pipe' });
      var full = cp.execFileSync('git', ['diff'].concat(targets), { cwd: cwd, stdio: 'pipe' });
      process.stdout.write(String(out));
      if (args.verbose) { process.stdout.write('\n---\n'); process.stdout.write(String(full)); }
    } catch (e) {
      S.fail(2, 'git-diff: ' + ((e && e.stderr) ? String(e.stderr).trim() : String(e)));
    }
  }
};
