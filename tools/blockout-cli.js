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
  require('./cli/commands-floor')
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

// Commands that don't need floor-data loaded (Pass 5a git-*).
var NO_FLOORS = { 'git-snapshot': 1, 'git-diff': 1 };

function printHelp() {
  process.stdout.write([
    'blockout-cli — Tier 6 Pass 1+2+3+4+5a (Node, split 0.3)',
    'Mutates tools/floor-data.json in place.',
    '',
    'Commands:',
    '  ' + Object.keys(COMMANDS).sort().join('\n  '),
    '',
    'Examples:',
    '  node tools/blockout-cli.js paint-rect   --floor 2.1 --at 5,5 --size 3x3 --tile WALL',
    '  node tools/blockout-cli.js render-ascii --floor 1.3.1 --viewport 0,0,40x20',
    '  node tools/blockout-cli.js create-floor --id 4.1 --biome bazaar --template single-room',
    '  node tools/blockout-cli.js set-biome    --floor 4.1 --biome guild',
    '  node tools/blockout-cli.js place-entity --floor 4.1 --at 3,3 --kind CHEST --key treasure1',
    '  node tools/blockout-cli.js git-snapshot --message "scaffold 4.1"',
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
  var raw = NO_FLOORS[cmdName] ? { floors: {} } : S.loadFloors();
  var schema = S.loadSchema();
  try {
    cmd(args, raw, schema);
  } catch (e) {
    S.fail(2, (e && e.stack) || String(e));
  }
}

main();
