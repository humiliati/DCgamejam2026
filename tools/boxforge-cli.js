#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  tools/boxforge-cli.js — BoxForge agent CLI (Phase 3a dispatcher)
//  BOXFORGE_AGENT_ROADMAP §4.2
//
//  Mirrors tools/blockout-cli.js conventions:
//    - Command modules live in tools/cli/bf-*.js
//    - Each module exports { '<cmd-name>': run(args, raw) }
//    - Object.assign composes them into a single COMMANDS map
//    - Exit codes: 0 ok, 1 usage error, 2 runtime error
//    - Global flags: --dry-run (preview), --help / -h
//
//  Phase 2 shipped the READ-ONLY commands. Phase 3a adds the first
//  two mutators (ingest / emit) — both participate in the --dry-run
//  envelope via bf-shared.setDryRun() / saveCallCount().
// ═══════════════════════════════════════════════════════════════
'use strict';

var S = require('./cli/bf-shared');

var COMMANDS = Object.assign(
  {},
  require('./cli/bf-list-templates'),   // list-templates
  require('./cli/bf-describe'),         // describe --variant <name>
  require('./cli/bf-list-peeks'),       // list-peeks
  require('./cli/bf-help'),             // help [<command>]
  require('./cli/bf-ingest'),           // ingest --from <path> | --variant <v>  (Phase 3a)
  require('./cli/bf-emit'),             // emit   --variant <v> [--as peek-module] (Phase 3a)
  require('./cli/bf-stamps')            // list-stamps + apply-stamp              (Phase 5.1)
);

Object.keys(COMMANDS).forEach(function(k) {
  if (k.charAt(0) === '_') delete COMMANDS[k];
});

var NO_LOAD = { 'help': 1 };

var READ_ONLY = {
  'list-templates': 1,
  'describe':       1,
  'list-peeks':     1,
  'list-stamps':    1,
  'help':           1
};

function printHelp() {
  process.stdout.write([
    'boxforge-cli — BoxForge agent CLI (Phase 3a)',
    'Mirrors blockout-cli.js conventions — read-only in Phase 2, mutators in 3a.',
    '',
    'Global flags:',
    '  --dry-run      Preview without writing (affects ingest/emit).',
    '  --help, -h     Show this message.',
    '',
    'Per-command help:',
    '  node tools/boxforge-cli.js help                — list every command',
    '  node tools/boxforge-cli.js help <command>      — args + worked example',
    '  node tools/boxforge-cli.js help <command> --json   — JSON for agents',
    '',
    'Commands:',
    '  ' + Object.keys(COMMANDS).sort().join('\n  '),
    '',
    'Examples:',
    '  node tools/boxforge-cli.js list-templates',
    '  node tools/boxforge-cli.js describe --variant chest',
    '  node tools/boxforge-cli.js list-peeks --orphans',
    '  node tools/boxforge-cli.js emit --variant crate --print | head -30',
    '  node tools/boxforge-cli.js emit --variant crate --out engine/crate-peek.js',
    '  node tools/boxforge-cli.js ingest --from engine/crate-peek.js --print',
    '  node tools/boxforge-cli.js ingest --variant crate --dry-run',
    '  node tools/boxforge-cli.js list-stamps',
    '  node tools/boxforge-cli.js apply-stamp --name braizer --variant hearth --tile-match HEARTH --bw 360 --bh 300 --bd 180',
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

  var dryRun = !!args['dry-run'];
  if (dryRun) S.setDryRun(true);

  var raw = NO_LOAD[cmdName] ? {} : {};

  try {
    cmd(args, raw);
  } catch (e) {
    S.fail(2, (e && e.stack) || String(e));
  }

  if (dryRun) {
    var suppressed = S.saveCallCount();
    S.setDryRun(false);
    var readOnly = !!READ_ONLY[cmdName];
    var tag = readOnly
      ? 'nothing to preview (command "' + cmdName + '" is read-only)'
      : suppressed + ' save call' + (suppressed === 1 ? '' : 's') + ' suppressed';
    process.stderr.write('[boxforge-cli] --dry-run: ' + tag + '\n');
    process.stdout.write(JSON.stringify({
      dryRun: true,
      command: cmdName,
      readOnly: readOnly,
      saveCallsSuppressed: suppressed,
      wouldChange: !readOnly && suppressed > 0
    }, null, 2) + '\n');
  }
}

main();
