// ═══════════════════════════════════════════════════════════════
//  tools/cli/bf-help.js — `bf help` / `bf help <command>`
//  Phase 2 of BOXFORGE_AGENT_ROADMAP §4.2
//
//  Thin wrapper over bf-help-meta.js. Mirrors commands-help.js
//  (tools/cli/commands-help.js) for symmetry with the blockout CLI.
//
//    bf help                → index of commands with one-liners
//    bf help describe       → args + example block for describe
//    bf help describe --json  → same payload as JSON (for agents)
//
//  Never fails — unknown command prints a helpful note and exits 0.
// ═══════════════════════════════════════════════════════════════
'use strict';

var helpMeta = require('./bf-help-meta');

function run(args) {
  var positional = Array.isArray(args._) ? args._ : [];
  var target = positional[0] || args.command || null;
  var asJson = !!args.json;

  if (!target) {
    if (asJson) {
      var names = helpMeta.list();
      var payload = {};
      names.forEach(function(n) { payload[n] = helpMeta.get(n); });
      process.stdout.write(JSON.stringify({
        ok: true, action: 'help', commands: payload
      }, null, 2) + '\n');
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
