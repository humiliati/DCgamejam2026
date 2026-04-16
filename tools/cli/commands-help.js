// ═══════════════════════════════════════════════════════════════
//  tools/cli/commands-help.js — `bo help` / `bo help <command>`
//  Slice C3 — Track C (agent-feedback closeouts)
//
//  Thin wrapper over help-meta.js. Public commands:
//
//    bo help                → list every command with one-line desc
//    bo help paint-rect     → args + example block for paint-rect
//    bo help paint-rect --json  → same payload as JSON (agent-friendly)
//
//  The command is read-only and does NOT need floor-data.json loaded —
//  blockout-cli.js includes 'help' in NO_FLOORS (and READ_ONLY).
//
//  Exit codes: 0 ok (always, even for unknown command — we print a
//  helpful note rather than fail, so `bo help foo` never breaks a
//  scripted pipeline).
// ═══════════════════════════════════════════════════════════════
'use strict';

var helpMeta = require('./help-meta');

function run(args, raw, schema) {
  // Positional arg: `bo help paint-rect` → args._[0] === 'paint-rect'.
  // shared.parseArgs collects positionals under args._.
  var positional = Array.isArray(args._) ? args._ : [];
  var target = positional[0] || args.command || null;
  var asJson = !!args.json;

  if (!target) {
    if (asJson) {
      var names = helpMeta.list();
      var payload = {};
      names.forEach(function(n) { payload[n] = helpMeta.get(n); });
      process.stdout.write(JSON.stringify({ ok: true, action: 'help', commands: payload }, null, 2) + '\n');
    } else {
      process.stdout.write(helpMeta.formatIndex());
    }
    return;
  }

  var meta = helpMeta.get(target);
  if (asJson) {
    if (!meta) {
      process.stdout.write(JSON.stringify({
        ok: false, action: 'help', command: target,
        error: 'unknown command',
        available: helpMeta.list()
      }, null, 2) + '\n');
    } else {
      process.stdout.write(JSON.stringify({
        ok: true, action: 'help', command: target, meta: meta
      }, null, 2) + '\n');
    }
    return;
  }

  process.stdout.write(helpMeta.formatBlock(target));
}

module.exports = {
  'help': run
};
