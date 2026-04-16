#!/usr/bin/env node
// ============================================================
// blockout-cli.js — Tier 6 dispatcher (Pass 0.3 split, Pass 5a add)
// ============================================================
// Agent-facing CLI for tools/floor-data.json. Shares the action
// vocabulary of window.BO so an agent can reach for either
// (browser via `javascript_tool`, or shell via this script) and
// get identical semantics.
//
// Pass 0.3: command implementations live under tools/cli/; this
// file is just a dispatcher that merges per-topic command modules.
// Pass 5a: adds commands-floor.js (create-floor, set-biome,
// place-entity, git-snapshot, git-diff).
//
// Exit codes: 0 ok, 1 usage error, 2 runtime error.
// ============================================================
'use strict';

var S = require('./cli/shared');

var COMMANDS = Object.assign(
  {},
  require('./cli/commands-meta'),
  require('./cli/commands-paint'),
  require('./cli/commands-perception'),
  require('./cli/commands-validation'),
  require('./cli/commands-tile-lookup'),
  require('./cli/commands-stamps'),
  require('./cli/commands-floor'),
  require('./cli/commands-ingest'),   // Slice C2: bo ingest
  require('./cli/commands-emit'),     // Slice C2: bo emit
  require('./cli/commands-quest'),    // Phase 0b: bo add-quest/place-waypoint/validate-quest
  require('./cli/commands-help')      // Slice C3: bo help [<command>]
);

// Strip private helpers (underscore prefix).
Object.keys(COMMANDS).forEach(function(k) {
  if (k.charAt(0) === '_') delete COMMANDS[k];
});

COMMANDS['describe'] = function(args, raw) {
  process.stdout.write(JSON.stringify({
    floorDataPath: S.paths.FLOOR_DATA_PATH,
    floorCount: Object.keys(raw.floors).length,
    generated: raw.generated || null,
    commands: Object.keys(COMMANDS).sort()
  }, null, 2) + '\n');
};

// Commands that don't need floor-data loaded (Pass 5a git-*, Pass 5d help).
var NO_FLOORS = { 'git-snapshot': 1, 'git-diff': 1, 'help': 1 };

function printHelp() {
  process.stdout.write([
    'blockout-cli — Tier 6 Pass 1+2+3+4+5a+5d (Node, split 0.3)',
    'Mutates tools/floor-data.json in place.',
    '',
    'Global flags:',
    '  --dry-run      Preview cell/spawn/door diff; do NOT write floor-data.json.',
    '  --help, -h     Show this message.',
    '',
    'Per-command help (Slice C3):',
    '  node tools/blockout-cli.js help               — list every command with one-liner',
    '  node tools/blockout-cli.js help <command>     — args + worked example for one command',
    '  node tools/blockout-cli.js help <command> --json   — same payload as JSON (for agents)',
    '',
    'Commands:',
    '  ' + Object.keys(COMMANDS).sort().join('\n  '),
    '',
    'Examples:',
    '  node tools/blockout-cli.js paint-rect   --floor 2.1 --at 5,5 --size 3x3 --tile WALL',
    '  node tools/blockout-cli.js paint-rect   --floor 2.1 --at 5,5 --size 3x3 --tile WALL --dry-run',
    '  node tools/blockout-cli.js render-ascii --floor 1.3.1 --viewport 0,0,40x20',
    '  node tools/blockout-cli.js create-floor --id 4.1 --biome bazaar --template single-room',
    '  node tools/blockout-cli.js set-biome    --floor 4.1 --biome guild',
    '  node tools/blockout-cli.js place-entity --floor 4.1 --at 3,3 --kind CHEST --key treasure1',
    '  node tools/blockout-cli.js git-snapshot --message "scaffold 4.1"',
    '  node tools/blockout-cli.js help         paint-rect',
    ''
  ].join('\n'));
}

// ── Slice C1: dry-run preview ──────────────────────────────────
// Compare in-memory `raw` (after command has mutated it) against the
// pristine `snap` taken at load time. Emit a compact preview payload
// so agents can eyeball impact before re-running without --dry-run.
function _dryRunDiff(snap, raw) {
  var out = {
    cells: {}, spawn: {}, doorTargets: {},
    floorsAdded: [], floorsRemoved: [], totalCellsChanged: 0
  };
  var before = (snap && snap.floors) || {};
  var after  = (raw  && raw.floors)  || {};
  Object.keys(after).forEach(function(fid) {
    if (!before[fid]) out.floorsAdded.push(fid);
  });
  Object.keys(before).forEach(function(fid) {
    if (!after[fid]) { out.floorsRemoved.push(fid); return; }
    var bg = before[fid].grid || [];
    var ag = after[fid].grid  || [];
    var h = Math.max(bg.length, ag.length);
    var changed = [];
    for (var y = 0; y < h; y++) {
      var br = bg[y] || [];
      var ar = ag[y] || [];
      var w = Math.max(br.length, ar.length);
      for (var x = 0; x < w; x++) {
        if (br[x] !== ar[x]) {
          changed.push({ x: x, y: y,
            oldTile: br[x] == null ? null : br[x],
            newTile: ar[x] == null ? null : ar[x] });
        }
      }
    }
    if (changed.length) { out.cells[fid] = changed; out.totalCellsChanged += changed.length; }
    var bs = before[fid].spawn, as = after[fid].spawn;
    var spawnChanged = (!!bs !== !!as) ||
      (bs && as && (bs.x !== as.x || bs.y !== as.y || bs.dir !== as.dir));
    if (spawnChanged) out.spawn[fid] = { before: bs || null, after: as || null };
    var bd = JSON.stringify(before[fid].doorTargets || {});
    var ad = JSON.stringify(after[fid].doorTargets  || {});
    if (bd !== ad) out.doorTargets[fid] = {
      before: before[fid].doorTargets || {}, after: after[fid].doorTargets || {}
    };
  });
  out.wouldChange = out.totalCellsChanged > 0
    || Object.keys(out.spawn).length > 0
    || Object.keys(out.doorTargets).length > 0
    || out.floorsAdded.length > 0
    || out.floorsRemoved.length > 0;
  return out;
}

// Non-mutating commands that don't touch floor-data — --dry-run is a
// no-op here, we just run them normally and exit.
var READ_ONLY = {
  'list-floors': 1, 'render-ascii': 1, 'describe-cell': 1, 'describe': 1,
  'validate': 1, 'report-validation': 1, 'tile': 1, 'tile-name': 1,
  'tile-schema': 1, 'find-tiles': 1, 'list-stamps': 1, 'export-stamps': 1,
  'git-snapshot': 1, 'git-diff': 1,
  'help': 1,
  // Slice C2: emit is read-only by default (stdout). --out / --overwrite
  // writes outside floor-data.json; those writes honor --dry-run via
  // S.isDryRun() inside commands-emit.
  'emit': 1,
  // Phase 0b: quest commands write to tools/floor-payloads/*.quest.json
  // (NOT floor-data.json) and honour --dry-run via S.isDryRun() inside
  // commands-quest.js. From the dispatcher's perspective they leave
  // floor-data.json untouched, so the dry-run envelope shows no diff.
  'add-quest': 1, 'place-waypoint': 1, 'validate-quest': 1
};

function main() {
  var argv = process.argv.slice(2);
  if (!argv.length || argv[0] === '--help' || argv[0] === '-h') {
    printHelp();
    process.exit(argv.length ? 0 : 1);
  }
  var cmdName = argv[0];
  var args = S.parseArgs(argv.slice(1));
  if (args.help) { printHelp(); process.exit(0); }
  var cmd = COMMANDS[cmdName];
  if (!cmd) S.fail(1, 'unknown command: ' + cmdName + ' (try --help)');
  var dryRun = !!args['dry-run'];
  var raw = NO_FLOORS[cmdName] ? { floors: {} } : S.loadFloors();
  var schema = S.loadSchema();
  // Pristine snapshot — taken BEFORE the command mutates `raw`. JSON
  // round-trip is cheap for floor-data (~small) and guarantees deep
  // isolation from any in-place mutation the command does.
  var snap = dryRun ? JSON.parse(JSON.stringify(raw)) : null;
  if (dryRun) S.setDryRun(true);
  try {
    cmd(args, raw, schema);
  } catch (e) {
    S.fail(2, (e && e.stack) || String(e));
  }
  if (dryRun) {
    S.setDryRun(false);
    var diff = _dryRunDiff(snap, raw);
    var payload = {
      dryRun: true,
      command: cmdName,
      readOnly: !!READ_ONLY[cmdName],
      saveCallsSuppressed: S.saveCallCount(),
      wouldChange: diff.wouldChange,
      totalCellsChanged: diff.totalCellsChanged,
      floorsAdded: diff.floorsAdded,
      floorsRemoved: diff.floorsRemoved,
      cells: diff.cells,
      spawn: diff.spawn,
      doorTargets: diff.doorTargets
    };
    process.stderr.write('[blockout-cli] --dry-run: floor-data.json NOT written (' +
      S.saveCallCount() + ' save call' + (S.saveCallCount()===1?'':'s') + ' suppressed)\n');
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  }
}

main();
