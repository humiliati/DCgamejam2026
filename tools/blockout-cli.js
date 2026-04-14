#!/usr/bin/env node
// ============================================================
// blockout-cli.js — Tier 6 dispatcher (Pass 0.3 split)
// ============================================================
// Agent-facing CLI for tools/floor-data.json. Shares the action
// vocabulary of window.BO so an agent can reach for either
// (browser via `javascript_tool`, or shell via this script) and
// get identical semantics.
//
// The CLI mutates tools/floor-data.json in place. Changes are
// picked up by the visualizer on next page-load (or by re-running
// extract-floors.js on the engine). This does NOT rewrite
// engine/floor-blockout-*.js — that requires the browser's
// File System Access API via `BO.run({action:'save'})` or the
// visualizer's Save button.
//
// Usage:
//   node tools/blockout-cli.js <command> [--flags...]
//   node tools/blockout-cli.js --help
//
// Pass 0.3: command implementations live under tools/cli/; this
// file is just a dispatcher that merges per-topic command modules.
// See tools/cli/shared.js for shared helpers.
//
// Exit codes: 0 ok, 1 usage error, 2 runtime error.
// ============================================================
'use strict';

var S = require('./cli/shared');

// Merge per-topic command modules into a single COMMANDS map.
var COMMANDS = Object.assign(
  {},
  require('./cli/commands-meta'),
  require('./cli/commands-paint'),
  require('./cli/commands-perception'),
  require('./cli/commands-validation'),
  require('./cli/commands-tile-lookup'),
  require('./cli/commands-stamps')
);

// Strip the private helpers (commands-validation.js exports
// _validateFloor/_validateCross for internal reuse).
Object.keys(COMMANDS).forEach(function(k) {
  if (k.charAt(0) === '_') delete COMMANDS[k];
});

// `describe` is defined here because it needs the fully-merged
// COMMANDS map to enumerate every command.
COMMANDS['describe'] = function(args, raw) {
  process.stdout.write(JSON.stringify({
    floorDataPath: S.paths.FLOOR_DATA_PATH,
    floorCount: Object.keys(raw.floors).length,
    generated: raw.generated || null,
    commands: Object.keys(COMMANDS).sort()
  }, null, 2) + '\n');
};

function printHelp() {
  process.stdout.write([
    'blockout-cli — Tier 6 Pass 1+2+3+4 (Node, split 0.3)',
    'Mutates tools/floor-data.json in place (Pass 1/4). Pass 2/3 are read-only.',
    '',
    'Commands:',
    '  ' + Object.keys(COMMANDS).sort().join('\n  '),
    '',
    'Examples:',
    '  node tools/blockout-cli.js paint-rect   --floor 2.1   --at 5,5 --size 3x3 --tile WALL',
    '  node tools/blockout-cli.js render-ascii --floor 1.3.1 --viewport 0,0,40x20',
    '  node tools/blockout-cli.js tile         --name WALL',
    '  node tools/blockout-cli.js find-tiles   --isDoor true',
    '  node tools/blockout-cli.js stamp-room   --floor 2.2.1 --at 2,2 --size 5x5',
    '  node tools/blockout-cli.js save-stamp   --floor 2.2.1 --name my-room --at 2,2 --size 5x5',
    '  node tools/blockout-cli.js apply-stamp  --floor 2.2.2 --name my-room --at 10,10 --rotate 90',
    ''
  ].join('\n'));
}

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
  var raw = S.loadFloors();
  var schema = S.loadSchema();
  try {
    cmd(args, raw, schema);
  } catch (e) {
    S.fail(2, (e && e.stack) || String(e));
  }
}

main();
